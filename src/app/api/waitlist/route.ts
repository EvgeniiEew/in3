import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/auth";
import { moscowDayRange } from "@/lib/timezone";

// Client joins the waiting queue for a service (optionally a specific
// master) on a day where nothing was free. Staff later book them from
// /admin/waitlist or /master/waitlist once a slot opens up.
const schema = z.object({
  serviceId: z.string(),
  masterId: z.string().optional(),
  date: z.string(), // YYYY-MM-DD
});

export async function POST(req: Request) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется имя и телефон" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const { serviceId, masterId, date } = parsed.data;

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });

  const { start: desiredFrom, end: desiredTo } = moscowDayRange(date);

  const entry = await prisma.waitlistEntry.create({
    data: {
      clientId: session.sub,
      serviceId,
      masterId: masterId || null,
      desiredFrom,
      desiredTo,
    },
  });

  return NextResponse.json({ ok: true, entry });
}
