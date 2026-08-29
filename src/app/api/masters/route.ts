import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  const masters = await prisma.master.findMany({
    where: {
      active: true,
      ...(serviceId ? { services: { some: { serviceId } } } : {}),
    },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ masters });
}
