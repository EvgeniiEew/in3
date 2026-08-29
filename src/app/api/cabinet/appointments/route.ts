import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/auth";
import { isSlotStillFree, isOverlapConstraintError } from "@/lib/slots";
import { moscowDateStr, moscowDayRange } from "@/lib/timezone";

export async function GET() {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const appointments = await prisma.appointment.findMany({
    where: { clientId: session.sub },
    include: { service: true, master: { select: { id: true, name: true } } },
    orderBy: { startAt: "desc" },
  });

  const client = await prisma.client.findUnique({ where: { id: session.sub } });

  return NextResponse.json({ appointments, bonusPoints: client?.bonusPoints ?? 0 });
}

export async function PATCH(req: Request) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const action = body?.action as "cancel" | "reschedule" | undefined;

  if (!id || !action) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || appointment.clientId !== session.sub) {
    return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  }

  if (action === "cancel") {
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json({ ok: true, appointment: updated });
  }

  if (action === "reschedule") {
    if (appointment.status === "CANCELLED" || appointment.status === "DONE") {
      return NextResponse.json({ error: "Эту запись нельзя перенести" }, { status: 400 });
    }
    const newStartAt = body?.startAt as string | undefined;
    const newMasterId = body?.masterId as string | undefined;
    if (!newStartAt) {
      return NextResponse.json({ error: "Укажите новое время" }, { status: 400 });
    }
    if (new Date(newStartAt) < new Date()) {
      return NextResponse.json({ error: "Нельзя перенести на прошедшее время" }, { status: 400 });
    }
    const service = await prisma.service.findUnique({ where: { id: appointment.serviceId } });
    if (!service || !service.active) return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });

    const effectiveMasterId = newMasterId || appointment.masterId;
    const effectiveMaster = await prisma.master.findUnique({ where: { id: effectiveMasterId } });
    if (!effectiveMaster || !effectiveMaster.active) {
      return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
    }
    if (newMasterId && newMasterId !== appointment.masterId) {
      const offers = await prisma.masterService.findUnique({
        where: { masterId_serviceId: { masterId: newMasterId, serviceId: appointment.serviceId } },
      });
      if (!offers) {
        return NextResponse.json({ error: "Этот мастер не выполняет данную услугу" }, { status: 400 });
      }
    }

    const start = new Date(newStartAt);
    const end = new Date(start.getTime() + service.durationMin * 60000);

    // Same one-appointment-per-day rule as booking a new appointment: don't
    // let a reschedule land on a day where this client already has another
    // appointment — same master or not.
    const { start: dayStart, end: dayEnd } = moscowDayRange(moscowDateStr(start));

    const sameDayAppointment = await prisma.appointment.findFirst({
      where: {
        id: { not: id },
        clientId: session.sub,
        status: { in: ["PENDING", "CONFIRMED"] },
        startAt: { gte: dayStart, lt: dayEnd },
      },
    });
    if (sameDayAppointment) {
      return NextResponse.json(
        { error: "В этот день у вас уже есть запись. В один день можно записаться только один раз." },
        { status: 409 }
      );
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const free = await isSlotStillFree(tx, effectiveMasterId, start, end, id);
        if (!free) throw new Error("SLOT_TAKEN");
        return tx.appointment.update({
          where: { id },
          data: { startAt: start, endAt: end, masterId: effectiveMasterId },
        });
      });
      return NextResponse.json({ ok: true, appointment: updated });
    } catch (e) {
      if ((e instanceof Error && e.message === "SLOT_TAKEN") || isOverlapConstraintError(e)) {
        return NextResponse.json({ error: "Это время уже занято" }, { status: 409 });
      }
      console.error(e);
      return NextResponse.json({ error: "Не удалось перенести запись" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
