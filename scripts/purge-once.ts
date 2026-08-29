// One-shot CLI runner — useful for testing the purge manually
// (`npm run purge:run`) or wiring it to an OS-level cron/systemd timer
// instead of the bundled node-cron scheduler service.
import { purgeOldAppointments, purgePrisma } from "./purge-lib";

purgeOldAppointments()
  .then((count) => {
    console.log(`[purge] ${new Date().toISOString()} — permanently deleted ${count} past appointment(s).`);
    return purgePrisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("[purge] Failed:", e);
    await purgePrisma.$disconnect();
    process.exit(1);
  });
