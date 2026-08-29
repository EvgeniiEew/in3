import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { normalizePhone, isValidBelarusPhone, PHONE_FORMAT_ERROR } from "@/lib/phone";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const masters = await prisma.master.findMany({
    include: { shifts: true, services: { include: { service: true } } },
    orderBy: { name: "asc" },
  });
  // Never leak password hashes to the client.
  const safe = masters.map(({ passwordHash: _passwordHash, ...m }) => m);
  return NextResponse.json({ masters: safe });
}

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().transform(normalizePhone).refine(isValidBelarusPhone, PHONE_FORMAT_ERROR),
  password: z.string().min(4, "Пароль слишком короткий, нужно от 4 символов"),
  shifts: z
    .array(z.object({ dayOfWeek: z.number().min(0).max(6), startMinutes: z.number(), endMinutes: z.number() }))
    .default([]),
});

export async function POST(req: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Некорректные данные мастера" },
      { status: 400 }
    );
  }
  const { name, phone, password, shifts } = parsed.data;

  const existing = await prisma.master.findUnique({ where: { phone } });
  if (existing) {
    return NextResponse.json({ error: "Мастер с таким телефоном уже есть" }, { status: 409 });
  }

  const master = await prisma.master.create({
    data: {
      name,
      phone,
      passwordHash: await bcrypt.hash(password, 10),
      shifts: { create: shifts },
    },
  });

  // Convenience default: link the new master to every active service so they
  // immediately show up in the booking flow. Adjust assignments later via
  // the services admin page or directly in the database if needed.
  const activeServices = await prisma.service.findMany({ where: { active: true }, select: { id: true } });
  if (activeServices.length > 0) {
    await prisma.masterService.createMany({
      data: activeServices.map((s) => ({ masterId: master.id, serviceId: s.id })),
      skipDuplicates: true,
    });
  }

  const { passwordHash: _passwordHash, ...safeMaster } = master;
  return NextResponse.json({ ok: true, master: safeMaster });
}

const patchSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  phone: z.string().transform(normalizePhone).refine(isValidBelarusPhone, PHONE_FORMAT_ERROR).optional(),
  password: z.string().min(4, "Пароль слишком короткий, нужно от 4 символов").optional(),
  active: z.boolean().optional(),
});

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
  const { id, password, ...rest } = parsed.data;
  const master = await prisma.master.update({
    where: { id },
    data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
  });
  const { passwordHash: _passwordHash, ...safeMaster } = master;
  return NextResponse.json({ ok: true, master: safeMaster });
}

// DELETE /api/admin/masters?id=... -> permanently removes a master. Admin
// only (masters can't delete themselves or anyone else). Blocked while the
// master has any appointment on record — past or future — so history never
// disappears silently; the weekly purge job naturally "unblocks" deletion
// once their past appointments age out. Shifts and service links cascade;
// any waitlist entries pointed at them just become "any master" instead of
// being deleted.
export async function DELETE(req: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указан id" }, { status: 400 });

  const master = await prisma.master.findUnique({ where: { id } });
  if (!master) return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });

  const appointmentCount = await prisma.appointment.count({ where: { masterId: id } });
  if (appointmentCount > 0) {
    return NextResponse.json(
      {
        error: `Нельзя удалить мастера — на нём ${appointmentCount} ${
          appointmentCount === 1 ? "запись" : "записей"
        } (включая прошедшие). Дождитесь еженедельной автоочистки прошедших записей, перенесите записи на другого мастера, либо просто скройте мастера кнопкой "Скрыть" вместо удаления.`,
      },
      { status: 409 }
    );
  }

  try {
    await prisma.master.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Race: an appointment was created between the count check above and
    // the delete — the FK RESTRICT constraint catches it, same message.
    console.error(e);
    return NextResponse.json(
      { error: "Не удалось удалить мастера — возможно, на него только что записались." },
      { status: 409 }
    );
  }
}
