import { PrismaClient } from "@prisma/client";

// Separate PrismaClient instance on purpose: this file is imported both by
// a one-shot CLI script and by the long-running scheduler worker, neither of
// which goes through Next.js's request lifecycle (so it can't reuse the
// singleton in src/lib/prisma.ts, which is wired for hot-reload dev safety).
export const purgePrisma = new PrismaClient();

/**
 * Permanently deletes every appointment that has already ended
 * (endAt < now). No history is kept anywhere — this is intentional: the
 * live calendar should only ever contain current/future bookings, and
 * nothing is archived once a booking's time has passed.
 *
 * Returns the number of appointments deleted.
 */
export async function purgeOldAppointments(now: Date = new Date()): Promise<number> {
  const result = await purgePrisma.appointment.deleteMany({
    where: { endAt: { lt: now } },
  });
  return result.count;
}
