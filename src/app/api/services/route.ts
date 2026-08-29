import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Optional ?masterId= filters services down to only what that master
// actually performs (via the MasterService join table) — used by booking UIs
// so a client/admin can't pick a service the clicked master doesn't offer.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const masterId = searchParams.get("masterId");

  const categories = await prisma.serviceCategory.findMany({
    orderBy: { order: "asc" },
    include: {
      services: {
        where: {
          active: true,
          ...(masterId ? { masters: { some: { masterId } } } : {}),
        },
        orderBy: { name: "asc" },
      },
    },
  });
  return NextResponse.json({ categories });
}
