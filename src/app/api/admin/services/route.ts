import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const [categories, masters] = await Promise.all([
    prisma.serviceCategory.findMany({
      orderBy: { order: "asc" },
      include: {
        services: {
          orderBy: { name: "asc" },
          include: { masters: { select: { masterId: true } } },
        },
      },
    }),
    prisma.master.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return NextResponse.json({
    categories: categories.map((c) => ({
      ...c,
      services: c.services.map((s) => ({ ...s, masterIds: s.masters.map((m) => m.masterId) })),
    })),
    masters,
  });
}

const createSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string(),
  priceRub: z.number().int().nonnegative().optional(),
  durationMin: z.number().int().positive(),
  masterIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные услуги" }, { status: 400 });
  }
  const { name, categoryId, priceRub, durationMin, masterIds } = parsed.data;

  // Convenience default: if no specific masters were picked, offer the new
  // service through every active master.
  const linkMasterIds =
    masterIds.length > 0
      ? masterIds
      : (await prisma.master.findMany({ where: { active: true }, select: { id: true } })).map((m) => m.id);

  const service = await prisma.service.create({
    data: {
      name,
      categoryId,
      priceRub,
      durationMin,
      masters: { create: linkMasterIds.map((masterId) => ({ masterId })) },
    },
  });

  return NextResponse.json({ ok: true, service });
}

const patchSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  priceRub: z.number().int().nonnegative().optional(),
  durationMin: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  // When present, replaces the full set of masters who perform this
  // service (including an empty array — "no master offers this anymore").
  // Omit the field entirely to leave existing assignments untouched.
  masterIds: z.array(z.string()).optional(),
});

export async function PATCH(req: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const { id, masterIds, ...rest } = parsed.data;

  const service = await prisma.$transaction(async (tx) => {
    if (Object.keys(rest).length > 0) {
      await tx.service.update({ where: { id }, data: rest });
    }
    if (masterIds) {
      await tx.masterService.deleteMany({ where: { serviceId: id } });
      if (masterIds.length > 0) {
        await tx.masterService.createMany({
          data: masterIds.map((masterId) => ({ masterId, serviceId: id })),
        });
      }
    }
    return tx.service.findUnique({ where: { id }, include: { masters: true } });
  });

  return NextResponse.json({ ok: true, service });
}
