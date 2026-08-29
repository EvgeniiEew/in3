import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { moscowDateStr, moscowDayStart } from "@/lib/timezone";

// GET /api/admin/appointments/summary?month=YYYY-MM
// Returns how many appointments fall on each day of that month, so the
// calendar date picker can highlight days that have bookings.
export async function GET(req: Request) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // "YYYY-MM"
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Некорректный месяц" }, { status: 400 });
  }

  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthStart = moscowDayStart(`${y}-${String(m).padStart(2, "0")}-01`);
  const monthEnd = moscowDayStart(`${nextMonth}-01`);

  const rows = await prisma.appointment.findMany({
    where: { startAt: { gte: monthStart, lt: monthEnd } },
    select: { startAt: true },
  });

  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = moscowDateStr(row.startAt);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return NextResponse.json({ counts });
}
