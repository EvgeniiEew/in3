import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/slots";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const masterId = searchParams.get("masterId");
  const serviceId = searchParams.get("serviceId");
  const dateStr = searchParams.get("date"); // YYYY-MM-DD

  if (!masterId || !serviceId || !dateStr) {
    return NextResponse.json(
      { error: "masterId, serviceId and date are required" },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  // getAvailableSlots only checks working hours + existing bookings — it
  // doesn't know which services a master actually performs. Guard that here
  // so a mismatched master/service combo never shows slots that would fail
  // at booking time anyway.
  const offers = await prisma.masterService.findUnique({
    where: { masterId_serviceId: { masterId, serviceId } },
  });
  if (!offers) {
    return NextResponse.json({ slots: [] });
  }

  const slots = await getAvailableSlots({ masterId, serviceId, dateStr });

  return NextResponse.json({
    slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
  });
}
