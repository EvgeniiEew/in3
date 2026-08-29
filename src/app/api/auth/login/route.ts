import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setAdminSession, setClientSession, setMasterSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";

// Single login endpoint for everyone: identifier + password. The
// identifier tells us who's who — an email belongs to an admin, a phone
// that matches a Master is a master login, any other registered phone is a
// client. Clients register first at /register (which is where their
// password comes from). Returns where the frontend should send them next.
const schema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1, "Введите пароль"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите телефон или email" }, { status: 400 });
  }
  const { identifier: rawIdentifier, password } = parsed.data;
  const isEmail = rawIdentifier.includes("@");
  // Phones are stored normalized (no spaces/dashes) — normalize the login
  // input the same way so "+375 29 123-45-67" still matches "+375291234567".
  const identifier = isEmail ? rawIdentifier : normalizePhone(rawIdentifier);

  if (isEmail) {
    const admin = await prisma.adminUser.findUnique({ where: { email: identifier } });
    if (!admin) {
      return NextResponse.json({ error: "Пользователь с таким email не найден" }, { status: 404 });
    }
    if (!(await bcrypt.compare(password, admin.passwordHash))) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    }
    await setAdminSession(admin);
    return NextResponse.json({ ok: true, role: "admin", redirect: "/admin/calendar" });
  }

  // Not an email — treat as a phone number. Check masters first.
  const master = await prisma.master.findUnique({ where: { phone: identifier } });
  if (master) {
    if (!master.passwordHash || !(await bcrypt.compare(password, master.passwordHash))) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    }
    if (!master.active) {
      return NextResponse.json({ error: "Учётная запись отключена" }, { status: 403 });
    }
    await setMasterSession({ id: master.id, phone: master.phone!, name: master.name });
    return NextResponse.json({ ok: true, role: "master", redirect: "/master/calendar" });
  }

  // Not an admin or master — look up a registered client by phone.
  const client = await prisma.client.findUnique({ where: { phone: identifier } });
  if (!client || !client.passwordHash) {
    return NextResponse.json(
      { error: "Пользователь не найден, зарегистрируйтесь" },
      { status: 404 }
    );
  }
  if (!(await bcrypt.compare(password, client.passwordHash))) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }
  await setClientSession({ id: client.id, phone: client.phone });
  return NextResponse.json({ ok: true, role: "client", redirect: "/calendar" });
}
