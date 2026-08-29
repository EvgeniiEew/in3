import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

// Categories only exist via prisma/seed.ts today — this lets admins add
// more ("Маникюр", "Барбершоп", etc.) without a DB migration/reseed.
const createSchema = z.object({
  name: z.string().min(1, "Укажите название категории"),
});

export async function POST(req: Request) {
  if (!(await getAdminSession())) {
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

  const maxOrder = await prisma.serviceCategory.aggregate({ _max: { order: true } });
  const category = await prisma.serviceCategory.create({
    data: { name: parsed.data.name, order: (maxOrder._max.order ?? 0) + 1 },
  });

  return NextResponse.json({ ok: true, category });
}
