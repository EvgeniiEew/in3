-- CreateIndex
CREATE INDEX "WaitlistEntry_clientId_idx" ON "WaitlistEntry"("clientId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_masterId_idx" ON "WaitlistEntry"("masterId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_serviceId_idx" ON "WaitlistEntry"("serviceId");

-- Enable btree_gist: needed so a GiST exclusion constraint can compare
-- "masterId" (text) with the equality operator alongside a time-range
-- overlap check below. Requires the DB user to have CREATEDB/superuser
-- rights to create extensions — the default `postgres` bootstrap user in
-- docker-compose's db service has this; a locked-down managed Postgres
-- host might not, in which case this line needs to be run once by a DBA
-- with sufficient privileges before `prisma migrate deploy`.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Real DB-level guarantee against double-booking a master, on top of the
-- application-level isSlotStillFree() check (which is transaction-safe but
-- not race-proof under Postgres's default READ COMMITTED isolation — two
-- concurrent requests can both see "free" before either commits). This
-- constraint makes the second conflicting INSERT/UPDATE fail outright:
-- no two PENDING/CONFIRMED appointments for the same master may have
-- overlapping [startAt, endAt) ranges. CANCELLED/DONE appointments are
-- excluded so cancelling and rebooking the same slot still works, and so
-- historical DONE records don't block anything.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_no_overlap_per_master"
  EXCLUDE USING gist (
    "masterId" WITH =,
    tsrange("startAt", "endAt") WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));
