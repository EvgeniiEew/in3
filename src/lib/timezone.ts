// The salon operates on Russian (Moscow) time — UTC+3, no DST since 2014.
// Hardcoded rather than relying on the server's OS/process time zone,
// because that's unreliable across environments: Windows dev machines
// mostly ignore the TZ env var for Node's Date/Intl, so `npm run dev` on
// Windows would silently compute "today" in whatever zone Windows itself is
// set to. Pinning the offset here means "today" and every day-boundary
// calculation mean the same wall-clock day everywhere — local dev, Docker
// on the VPS, and every visitor's browser — regardless of what machine or
// container time zone happens to be set.
//
// Safe to import from both server code (API routes) and client components
// (plain Date math, no server-only APIs).
const MOSCOW_OFFSET_MIN = 3 * 60;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The given instant's Y/M/D as seen on a Moscow wall clock, formatted
 * "YYYY-MM-DD". Defaults to the current moment. */
export function moscowDateStr(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MIN * 60000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The real UTC instant corresponding to 00:00 Moscow time on the given
 * "YYYY-MM-DD" calendar day — safe to compare directly against DB
 * timestamps (startAt/endAt are stored as real instants). */
export function moscowDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+03:00`);
}

/** [start, end) instants covering the given Moscow calendar day. */
export function moscowDayRange(dateStr: string): { start: Date; end: Date } {
  const start = moscowDayStart(dateStr);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Shifts a "YYYY-MM-DD" string by N Moscow calendar days. */
export function shiftMoscowDate(dateStr: string, days: number): string {
  const shifted = new Date(moscowDayStart(dateStr).getTime() + days * 24 * 60 * 60 * 1000);
  return moscowDateStr(shifted);
}

/** Day-of-week for the given Moscow calendar day, matching JS convention
 * (0 = Sunday … 6 = Saturday) — used to look up a master's weekly Shift. */
export function moscowDayOfWeek(dateStr: string): number {
  // Read it back from the UTC+3 instant's UTC day-of-week, since that
  // instant IS Moscow midnight.
  return moscowDayStart(dateStr).getUTCDay();
}

function toMoscowWallClock(date: Date): Date {
  return new Date(date.getTime() + MOSCOW_OFFSET_MIN * 60000);
}

/** Minutes since Moscow midnight for the given instant — used to position
 * appointment blocks on the calendar grid. Deliberately NOT the visitor's
 * browser-local hour: a client viewing the site from another time zone
 * should still see their appointment lined up against the salon's own
 * 09:00–21:00 grid labels, not shifted by their device's clock. */
export function moscowMinutesOfDay(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const m = toMoscowWallClock(d);
  return m.getUTCHours() * 60 + m.getUTCMinutes();
}

/** "HH:MM" for the given instant, in Moscow time. */
export function moscowTimeStr(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const m = toMoscowWallClock(d);
  return `${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}`;
}

/** "DD.MM.YYYY" for the given instant, in Moscow time — matches the
 * ru-RU short date format used throughout the UI. */
export function moscowDateRu(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const m = toMoscowWallClock(d);
  return `${pad(m.getUTCDate())}.${pad(m.getUTCMonth() + 1)}.${m.getUTCFullYear()}`;
}

/** Formats a bare "YYYY-MM-DD" calendar-day string as "DD.MM.YYYY" via
 * plain string manipulation — deliberately does NOT go through `new
 * Date(dateStr)`, because bare date-only strings parse as UTC midnight per
 * spec, and formatting that through the browser's local time zone can roll
 * the displayed day backward for anyone west of Moscow (a well-known JS
 * date pitfall, unrelated to which zone we've pinned instants to). */
export function dateStrToRu(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

/** Builds the real UTC instant for a "YYYY-MM-DD" + "HH" + "MM" combo,
 * interpreted as Moscow wall-clock time — used when staff type a manual
 * time (e.g. the admin "new appointment" form) so it means the same moment
 * regardless of which time zone the admin's own browser happens to be in. */
export function moscowDateTimeToISO(dateStr: string, hh: string, mm: string): string {
  return new Date(`${dateStr}T${hh}:${mm}:00+03:00`).toISOString();
}
