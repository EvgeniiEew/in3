import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { normalizePhone, isValidBelarusPhone, PHONE_FORMAT_ERROR } from "@/lib/phone";
import { moscowDayRange } from "@/lib/timezone";

// "Журнал записи" queue: clients waiting for a slot to free up. Both admin
// and master can see and act on it (book someone from the queue, or drop
// an entry), since they share the same calendar.
export async function GET() {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const entries = await prisma.waitlistEntry.findMany({
    include: {
      client: { select: { id: true, name: true, phone: true } },
      service: true,
      master: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" }, // FIFO — first to join, first offered a slot
  });

  return NextResponse.json({ entries });
}

const createSchema = z.object({
  clientPhone: z.string().transform(normalizePhone).refine(isValidBelarusPhone, PHONE_FORMAT_ERROR),
  clientName: z.string().optional(),
  serviceId: z.string(),
  masterId: z.string().optional(),
  date: z.string(), // YYYY-MM-DD
});

// Staff manually adds someone to the queue — e.g. a phone call with nothing
// free that day.
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
  const { clientPhone, clientName, serviceId, masterId, date } = parsed.data;

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });

  const client = await prisma.client.upsert({
    where: { phone: clientPhone },
    update: clientName ? { name: clientName } : {},
    create: { phone: clientPhone, name: clientName },
  });

  const { start: desiredFrom, end: desiredTo } = moscowDayRange(date);

  const entry = await prisma.waitlistEntry.create({
    data: { clientId: client.id, serviceId, masterId: masterId || null, desiredFrom, desiredTo },
  });

  return NextResponse.json({ ok: true, entry });
}

// DELETE /api/admin/waitlist?id=... -> drop an entry (booked elsewhere, or
// client no longer wants it). Both admin and master may do this.
export async function DELETE(req: Request) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указан id" }, { status: 400 });

  await prisma.waitlistEntry.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
