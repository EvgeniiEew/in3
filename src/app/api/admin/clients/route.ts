import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

// Registered clients, their bonus balance, and how many bookings they've
// made — admin-only (not shared with masters).
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { appointments: true } } },
  });

  // Never leak password hashes to the client.
  const safe = clients.map(({ passwordHash: _passwordHash, ...c }) => c);
  return NextResponse.json({ clients: safe });
}

const patchSchema = z.object({
  id: z.string(),
  bonusPoints: z.number().int().min(0, "Бонусы не могут быть отрицательными").max(1_000_000, "Слишком много бонусов").optional(),
  name: z.string().optional(),
});

// Edit a client's bonus balance (or name).
export async function PATCH(req: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Некорректные данные" },
      { status: 400 }
    );
  }
  const { id, ...rest } = parsed.data;

  const client = await prisma.client.update({ where: { id }, data: rest });
  const { passwordHash: _passwordHash, ...safeClient } = client;
  return NextResponse.json({ ok: true, client: safeClient });
}

// DELETE /api/admin/clients?id=... -> removes the client and, via cascade,
// their appointment history and waitlist entries. Irreversible.
export async function DELETE(req: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указан id" }, { status: 400 });

  await prisma.client.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
