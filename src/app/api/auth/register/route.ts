import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setClientSession } from "@/lib/auth";
import { normalizePhone, isValidBelarusPhone, PHONE_FORMAT_ERROR } from "@/lib/phone";

// Client self-registration: phone + name + password. Auto-logs them in on
// success, same as the other roles.
const schema = z
  .object({
    phone: z.string().transform(normalizePhone).refine(isValidBelarusPhone, PHONE_FORMAT_ERROR),
    name: z.string().min(1),
    password: z.string().min(6, "Пароль слишком короткий, нужно от 6 символов"),
    confirmPassword: z.string().min(6, "Пароль слишком короткий, нужно от 6 символов"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Некорректные данные" },
      { status: 400 }
    );
  }
  const { phone, name, password } = parsed.data;

  const existing = await prisma.client.findUnique({ where: { phone } });
  if (existing?.passwordHash) {
    return NextResponse.json(
      { error: "Этот номер уже зарегистрирован, войдите через /login" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // If a Client row already exists without a password (e.g. created by
  // admin/master booking them by phone, or via the old anonymous booking
  // flow), this "claims" it by setting name + password instead of erroring.
  const client = await prisma.client.upsert({
    where: { phone },
    update: { name, passwordHash },
    create: { phone, name, passwordHash },
  });

  await setClientSession({ id: client.id, phone: client.phone });
  return NextResponse.json({ ok: true, redirect: "/calendar" });
}
