import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientSession, setClientSession } from "@/lib/auth";
import { normalizePhone, isValidBelarusPhone, PHONE_FORMAT_ERROR } from "@/lib/phone";

// Legacy passwordless flow used only by the anonymous /booking wizard, for
// people who never registered. Trade-off: no code confirmation, so anyone
// who knows an *unregistered* phone number can claim a session for it.
// Registered (password-protected) clients are explicitly excluded below —
// this must never be a backdoor around /login's password check.
const schema = z.object({
  phone: z.string().transform(normalizePhone).refine(isValidBelarusPhone, PHONE_FORMAT_ERROR),
  name: z.string().min(1),
  // Set by the frontend only after the user has explicitly confirmed they
  // want to switch away from their current session to a different phone
  // number (see the switchRequired branch below).
  confirmSwitch: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Укажите имя и телефон" },
      { status: 400 }
    );
  }
  const { phone, name, confirmSwitch } = parsed.data;

  // If the browser already carries a valid client session for a *different*
  // phone number, upserting+overwriting the cookie here would silently log
  // that person out of their own account and into whichever number they
  // just typed (e.g. booking "for a friend" on a shared device, or a stale
  // tab). Require an explicit confirmation before allowing that switch —
  // same phone number is a no-op and always allowed.
  const currentSession = await getClientSession();
  if (currentSession && currentSession.phone !== phone && !confirmSwitch) {
    return NextResponse.json(
      {
        error:
          "Вы уже вошли под другим номером телефона. Продолжить с новым номером и выйти из текущего аккаунта?",
        switchRequired: true,
      },
      { status: 409 }
    );
  }

  const existing = await prisma.client.findUnique({ where: { phone } });
  if (existing?.passwordHash) {
    return NextResponse.json(
      { error: "Этот номер уже зарегистрирован. Войдите через форму входа." },
      { status: 409 }
    );
  }

  const client = await prisma.client.upsert({
    where: { phone },
    update: { name },
    create: { phone, name },
  });

  await setClientSession({ id: client.id, phone: client.phone });

  return NextResponse.json({ ok: true, client: { id: client.id, name: client.name, phone: client.phone } });
}
