// Long-running worker process (run as its own Docker service, see
// docker-compose.yml's `scheduler` service). Fires every Sunday at 00:00
// server time and permanently deletes every appointment that has already
// ended — no history is kept anywhere, by design. node-cron keeps the event
// loop alive on its own, so this process just needs to stay up — it doesn't
// need its own keep-alive loop.
import cron from "node-cron";
import { purgeOldAppointments } from "./purge-lib";

// Override via PURGE_CRON if a different cadence is ever needed. Standard
// cron syntax: minute hour day-of-month month day-of-week (0 = Sunday).
const SCHEDULE = process.env.PURGE_CRON ?? "0 0 * * 0";

if (!cron.validate(SCHEDULE)) {
  console.error(`[scheduler] Invalid PURGE_CRON expression: "${SCHEDULE}"`);
  process.exit(1);
}

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log(`[scheduler] Weekly appointment purge scheduled: "${SCHEDULE}" (container time zone: ${tz}).`);
console.log(`[scheduler] Set the TZ env var if this isn't the salon's local time zone.`);

cron.schedule(SCHEDULE, async () => {
  const startedAt = new Date();
  try {
    const count = await purgeOldAppointments(startedAt);
    console.log(`[scheduler] ${startedAt.toISOString()} — permanently deleted ${count} past appointment(s).`);
  } catch (e) {
    console.error(`[scheduler] ${startedAt.toISOString()} — purge failed:`, e);
  }
});
