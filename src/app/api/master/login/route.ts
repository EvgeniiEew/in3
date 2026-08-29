import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setMasterSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";

const schema = z.object({ phone: z.string().min(6), password: z.string().min(1) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите телефон и пароль" }, { status: 400 });
  }

  const phone = normalizePhone(parsed.data.phone);
  const { password } = parsed.data;
  const master = await prisma.master.findUnique({ where: { phone } });
  if (!master || !master.passwordHash || !(await bcrypt.compare(password, master.passwordHash))) {
    return NextResponse.json({ error: "Неверный телефон или пароль" }, { status: 401 });
  }
  if (!master.active) {
    return NextResponse.json({ error: "Учётная запись отключена" }, { status: 403 });
  }

  await setMasterSession({ id: master.id, phone: master.phone!, name: master.name });
  return NextResponse.json({ ok: true });
}
