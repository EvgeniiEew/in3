import { NextResponse } from "next/server";
import { purgeOldAppointments } from "../../../../../scripts/purge-lib";

// Alternative trigger for the weekly cleanup job, for hosting setups that
// can't run a long-lived background process (e.g. a free-tier PaaS that
// only runs request-driven web services, not persistent workers — see
// deploy-guide/README.md). An external free cron pinger (cron-job.org or
// similar, no credit card needed) hits this URL once a week instead of
// scripts/scheduler.ts running inside its own always-on container.
//
// If you deploy with docker-compose (the `scheduler` service already does
// this on its own schedule), you don't need this route or any external
// cron — the two do the exact same thing, just triggered differently. It's
// safe to leave both in place; the purge itself is idempotent.
//
// Requires PURGE_SECRET to be set — the route refuses to run otherwise, so
// it can never be triggered by accident or by a stranger who finds the URL.
function isAuthorized(req: Request): boolean {
  const secret = process.env.PURGE_SECRET;
  if (!secret) return false;
  const { searchParams } = new URL(req.url);
  const provided = req.headers.get("x-purge-secret") ?? searchParams.get("secret");
  return provided === secret;
}

async function runPurge() {
  const count = await purgeOldAppointments();
  console.log(`[purge:http] ${new Date().toISOString()} — permanently deleted ${count} past appointment(s).`);
  return NextResponse.json({ ok: true, deleted: count });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  return runPurge();
}

// GET too — most free cron-ping services only support plain GET requests,
// not POST with custom headers/bodies.
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  return runPurge();
}
