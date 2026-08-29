import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/auth";
import { moscowDateStr, moscowDayRange, moscowDayOfWeek } from "@/lib/timezone";

// Client-facing version of the staff calendar: same day/masters grid, but
// privacy-safe. Other people's appointments are reduced to an anonymous
// "busy" block — no name, phone, or even service is exposed. The signed-in
// client's own appointments come through in full so they can review/cancel
// them.
export async function GET(req: Request) {
  const session = await getClientSession();
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
      where: {
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        status: { in: ["PENDING", "CONFIRMED", "DONE"] },
      },
      include: { service: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.shift.findMany({ where: { dayOfWeek } }),
  ]);

  const sanitized = appointments.map((a) => {
    const mine = a.clientId === session.sub;
    return {
      id: a.id,
      masterId: a.masterId,
      startAt: a.startAt,
      endAt: a.endAt,
      status: a.status,
      mine,
      service: mine ? { id: a.service.id, name: a.service.name, durationMin: a.service.durationMin } : null,
    };
  });

  return NextResponse.json({
    masters: masters.map(({ passwordHash: _ph, ...m }) => m),
    appointments: sanitized,
    shifts: shifts.map((s) => ({ masterId: s.masterId, startMinutes: s.startMinutes, endMinutes: s.endMinutes })),
  });
}
