import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

const schema = z.object({
  shifts: z.array(
    z.object({
      dayOfWeek: z.number().min(0).max(6),
      startMinutes: z.number().min(0).max(1439),
      endMinutes: z.number().min(1).max(1440),
    })
  ),
});

// Replaces a master's whole weekly schedule in one go — simplest mental
// model for the admin UI: one working-hours range per day, or none (day off).
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный график" }, { status: 400 });
  }

  for (const s of parsed.data.shifts) {
    if (s.endMinutes <= s.startMinutes) {
      return NextResponse.json({ error: "Время окончания должно быть позже начала" }, { status: 400 });
    }
  }

  // The admin UI only ever sends one range per day, but guard the API
  // itself too: reject duplicate days outright, and reject any two ranges
  // on the same day that overlap (relevant if a duplicate day is ever sent
  // with different times — getAvailableSlots would otherwise silently
  // double up or produce inconsistent slot listings for that day).
  const byDay = new Map<number, typeof parsed.data.shifts>();
  for (const s of parsed.data.shifts) {
    const list = byDay.get(s.dayOfWeek) ?? [];
    list.push(s);
    byDay.set(s.dayOfWeek, list);
  }
  for (const [, list] of byDay) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMinutes < sorted[i - 1].endMinutes) {
        return NextResponse.json(
          { error: "На один день недели заданы пересекающиеся интервалы работы" },
          { status: 400 }
        );
      }
    }
  }

  const master = await prisma.master.findUnique({ where: { id: params.id } });
  if (!master) return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });

  await prisma.$transaction([
    prisma.shift.deleteMany({ where: { masterId: params.id } }),
    prisma.shift.createMany({
      data: parsed.data.shifts.map((s) => ({ ...s, masterId: params.id })),
    }),
  ]);

  const shifts = await prisma.shift.findMany({ where: { masterId: params.id } });
  return NextResponse.json({ ok: true, shifts });
}
