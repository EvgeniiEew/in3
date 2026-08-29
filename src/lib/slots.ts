import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { moscowDayRange, moscowDayOfWeek } from "./timezone";

const STEP_MIN = Number(process.env.SLOT_STEP_MINUTES || 15);

export type Slot = { start: Date; end: Date };

/**
 * Returns available booking slots for a given master/service/date,
 * taking working hours (Shift) and existing appointments into account.
 * A slot is available if [slotStart, slotEnd) does not overlap any
 * CONFIRMED/PENDING appointment for that master. `dateStr` is a
 * "YYYY-MM-DD" calendar day interpreted in Moscow time (see lib/timezone.ts).
 */
export async function getAvailableSlots(params: {
  masterId: string;
  serviceId: string;
  dateStr: string;
}): Promise<Slot[]> {
  const { masterId, serviceId, dateStr } = params;

  const [service, master] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId } }),
    prisma.master.findUnique({ where: { id: masterId } }),
  ]);
  // A deactivated master/service shouldn't offer any slots, even to someone
  // with a stale/bookmarked id — listing endpoints already filter these out,
  // but the slot generator is the real gate that every booking path funnels
  // through, so it needs to enforce this itself too.
  if (!service || !service.active || !master || !master.active) return [];

  const { start: day, end: dayEnd } = moscowDayRange(dateStr);
  const dayOfWeek = moscowDayOfWeek(dateStr);

  const shifts = await prisma.shift.findMany({
    where: { masterId, dayOfWeek },
  });
  if (shifts.length === 0) return [];

  const existing = await prisma.appointment.findMany({
    where: {
      masterId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startAt: { lt: dayEnd },
      endAt: { gt: day },
    },
    select: { startAt: true, endAt: true },
  });

  const now = new Date();
  const slots: Slot[] = [];

  for (const shift of shifts) {
    const shiftStart = new Date(day.getTime() + shift.startMinutes * 60000);
    const shiftEnd = new Date(day.getTime() + shift.endMinutes * 60000);

    for (
      let slotStart = new Date(shiftStart);
      slotStart.getTime() + service.durationMin * 60000 <= shiftEnd.getTime();
      slotStart = new Date(slotStart.getTime() + STEP_MIN * 60000)
    ) {
      const slotEnd = new Date(slotStart.getTime() + service.durationMin * 60000);
      if (slotStart < now) continue;

      const overlaps = existing.some(
        (a) => a.startAt < slotEnd && a.endAt > slotStart
      );
      if (!overlaps) {
        slots.push({ start: slotStart, end: slotEnd });
      }
    }
  }

  return slots;
}

/**
 * Re-checks overlap inside a transaction right before insert, to protect
 * against two clients booking the same slot at nearly the same time.
 * For high-traffic production use, also add a DB-level exclusion
 * constraint (btree_gist) on (masterId, tsrange(startAt, endAt)).
 */
/**
 * True if the error is Postgres rejecting an insert/update because it
 * violated the "appointment_no_overlap_per_master" exclusion constraint
 * (see prisma/migrations/20260815201501_double_booking_guard_and_indexes).
 * This is the last line of defense against double-booking: the app-level
 * isSlotStillFree() check above can race under concurrent requests, but the
 * DB constraint can't — a second conflicting write is rejected outright.
 * Callers should treat this the same as their own SLOT_TAKEN check.
 */
export function isOverlapConstraintError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return /exclusion constraint|appointment_no_overlap_per_master|23P01/i.test(e.message);
}

export async function isSlotStillFree(
  tx: Prisma.TransactionClient,
  masterId: string,
  startAt: Date,
  endAt: Date,
  excludeAppointmentId?: string
) {
  const conflict = await tx.appointment.findFirst({
    where: {
      masterId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
  });
  return !conflict;
}
