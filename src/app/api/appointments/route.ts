import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/auth";
import { isSlotStillFree, isOverlapConstraintError } from "@/lib/slots";
import { moscowDateStr, moscowDayRange } from "@/lib/timezone";

const schema = z.object({
  masterId: z.string(),
  serviceId: z.string(),
  startAt: z.string(), // ISO datetime
});

export async function POST(req: Request) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется подтверждение номера телефона" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные записи" }, { status: 400 });
  }

  const { masterId, serviceId, startAt } = parsed.data;
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) {
    return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });
  }

  const master = await prisma.master.findUnique({ where: { id: masterId } });
  if (!master || !master.active) {
    return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
  }

  const offers = await prisma.masterService.findUnique({
    where: { masterId_serviceId: { masterId, serviceId } },
  });
  if (!offers) {
    return NextResponse.json({ error: "Этот мастер не выполняет данную услугу" }, { status: 400 });
  }

  const start = new Date(startAt);
  const end = new Date(start.getTime() + service.durationMin * 60000);

  if (start < new Date()) {
    return NextResponse.json({ error: "Нельзя записаться в прошлое" }, { status: 400 });
  }

  // One client can only have one appointment per calendar day (Moscow
  // time) — not just "one master per day", but one booking total, so this
  // checks for ANY existing appointment that day, same master or not.
  const { start: dayStart, end: dayEnd } = moscowDayRange(moscowDateStr(start));

  const sameDayAppointment = await prisma.appointment.findFirst({
    where: {
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
    const appointment = await prisma.$transaction(async (tx) => {
      const free = await isSlotStillFree(tx, masterId, start, end);
      if (!free) {
        throw new Error("SLOT_TAKEN");
      }
      return tx.appointment.create({
        data: {
          masterId,
          serviceId,
          clientId: session.sub,
          startAt: start,
          endAt: end,
          status: "CONFIRMED",
          createdByAdmin: false,
        },
      });
    });

    return NextResponse.json({ ok: true, appointment });
  } catch (e) {
    if ((e instanceof Error && e.message === "SLOT_TAKEN") || isOverlapConstraintError(e)) {
      return NextResponse.json(
        { error: "Это время уже занято, выберите другое" },
        { status: 409 }
      );
    }
    console.error(e);
    return NextResponse.json({ error: "Не удалось создать запись" }, { status: 500 });
  }
}
