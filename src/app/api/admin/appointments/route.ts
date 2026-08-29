import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStaffSession, type StaffSession } from "@/lib/auth";
import { isSlotStillFree, isOverlapConstraintError } from "@/lib/slots";
import { normalizePhone, isValidBelarusPhone, PHONE_FORMAT_ERROR } from "@/lib/phone";
import { moscowDateStr, moscowDayRange, moscowDayOfWeek } from "@/lib/timezone";

// Admins can manage any appointment, including past ones. Masters share the
// same calendar view but can only cancel/delete/reschedule appointments that
// haven't happened yet.
function canModify(session: StaffSession, appointment: { startAt: Date }) {
  if (session.role === "admin") return true;
  return appointment.startAt.getTime() >= Date.now();
}

// GET /api/admin/appointments?date=YYYY-MM-DD  -> all appointments for that day, all masters
export async function GET(req: Request) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date") || moscowDateStr();
  const { start: dayStart, end: dayEnd } = moscowDayRange(dateStr);
  const dayOfWeek = moscowDayOfWeek(dateStr);

  const [masters, appointments, shifts] = await Promise.all([
    prisma.master.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.appointment.findMany({
      where: { startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
      include: {
        service: true,
        client: { select: { id: true, name: true, phone: true } },
        master: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    // That day-of-week's working hours per master, so the calendar can grey
    // out closed hours and size its grid to what's actually staffed instead
    // of a hardcoded 09:00–21:00.
    prisma.shift.findMany({ where: { dayOfWeek } }),
  ]);

  return NextResponse.json({
    masters: masters.map(({ passwordHash: _ph, ...m }) => m),
    appointments,
    shifts: shifts.map((s) => ({ masterId: s.masterId, startMinutes: s.startMinutes, endMinutes: s.endMinutes })),
    role: session.role,
  });
}

const createSchema = z.object({
  masterId: z.string(),
  serviceId: z.string(),
  startAt: z.string(),
  clientPhone: z.string().transform(normalizePhone).refine(isValidBelarusPhone, PHONE_FORMAT_ERROR),
  clientName: z.string().optional(),
  notes: z.string().optional(),
});

// POST -> staff manually creates an appointment ("по звонку или в салоне")
export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Некорректные данные" },
      { status: 400 }
    );
  }
  const { masterId, serviceId, startAt, clientPhone, clientName, notes } = parsed.data;

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });

  const master = await prisma.master.findUnique({ where: { id: masterId } });
  if (!master || !master.active) return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });

  const offers = await prisma.masterService.findUnique({
    where: { masterId_serviceId: { masterId, serviceId } },
  });
  if (!offers) {
    return NextResponse.json({ error: "Этот мастер не выполняет данную услугу" }, { status: 400 });
  }

  const start = new Date(startAt);
  const end = new Date(start.getTime() + service.durationMin * 60000);

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      const free = await isSlotStillFree(tx, masterId, start, end);
      if (!free) throw new Error("SLOT_TAKEN");

      const client = await tx.client.upsert({
        where: { phone: clientPhone },
        update: clientName ? { name: clientName } : {},
        create: { phone: clientPhone, name: clientName },
      });

      return tx.appointment.create({
        data: {
          masterId,
          serviceId,
          clientId: client.id,
          startAt: start,
          endAt: end,
          status: "CONFIRMED",
          createdByAdmin: true,
          notes,
        },
      });
    });

    return NextResponse.json({ ok: true, appointment });
  } catch (e) {
    if ((e instanceof Error && e.message === "SLOT_TAKEN") || isOverlapConstraintError(e)) {
      return NextResponse.json({ error: "Время уже занято" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Не удалось создать запись" }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "DONE"]).optional(),
  startAt: z.string().optional(),
  masterId: z.string().optional(),
});

// Reschedule (перенос): admin can move an appointment to a different master,
// date, and/or time. A master can only move date/time — reassigning to a
// different master is admin-only, enforced below with a 403.
export async function PATCH(req: Request) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const { id, status, startAt, masterId } = parsed.data;

  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  if (!canModify(session, appointment)) {
    return NextResponse.json(
      { error: "Мастер не может изменять записи, которые уже прошли" },
      { status: 403 }
    );
  }

  const changingMaster = !!masterId && masterId !== appointment.masterId;
  if (changingMaster && session.role !== "admin") {
    return NextResponse.json(
      { error: "Только администратор может переназначить мастера" },
      { status: 403 }
    );
  }

  const effectiveMasterId = masterId ?? appointment.masterId;

  let newStart = appointment.startAt;
  let newEnd = appointment.endAt;
  if (startAt) {
    const service = await prisma.service.findUnique({ where: { id: appointment.serviceId } });
    if (!service || !service.active) return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });
    newStart = new Date(startAt);
    newEnd = new Date(newStart.getTime() + service.durationMin * 60000);
  }

  if (changingMaster) {
    const newMaster = await prisma.master.findUnique({ where: { id: effectiveMasterId } });
    if (!newMaster || !newMaster.active) {
      return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
    }
    const offers = await prisma.masterService.findUnique({
      where: { masterId_serviceId: { masterId: effectiveMasterId, serviceId: appointment.serviceId } },
    });
    if (!offers) {
      return NextResponse.json({ error: "Этот мастер не выполняет данную услугу" }, { status: 400 });
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (changingMaster || startAt) {
        const free = await isSlotStillFree(tx, effectiveMasterId, newStart, newEnd, id);
        if (!free) throw new Error("SLOT_TAKEN");
      }
      return tx.appointment.update({
        where: { id },
        data: {
          ...(status ? { status } : {}),
          ...(changingMaster ? { masterId: effectiveMasterId } : {}),
          ...(startAt ? { startAt: newStart, endAt: newEnd } : {}),
        },
      });
    });
    return NextResponse.json({ ok: true, appointment: updated });
  } catch (e) {
    if ((e instanceof Error && e.message === "SLOT_TAKEN") || isOverlapConstraintError(e)) {
      return NextResponse.json({ error: "Это время уже занято" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Не удалось обновить запись" }, { status: 500 });
  }
}

// DELETE /api/admin/appointments?id=... -> permanently remove from the calendar.
// Admin: any appointment. Master: only appointments that haven't happened yet.
export async function DELETE(req: Request) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указан id записи" }, { status: 400 });

  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  if (!canModify(session, appointment)) {
    return NextResponse.json(
      { error: "Мастер не может удалять записи, которые уже прошли" },
      { status: 403 }
    );
  }

  await prisma.appointment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
