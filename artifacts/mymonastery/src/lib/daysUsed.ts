// ── How many days this phone has been used ──────────────────────────────────
//
// Owner, 2026-09-20: "after a use has been using phoebe for three days even if
// they are signed out, have it take away the welcome banners".
//
// DISTINCT LOCAL DAYS THE HOME WAS OPENED, counted on the device and therefore
// true whether or not there is an account. Someone who has come back on three
// separate days is not a newcomer, and "Begin here" starts to read as an app
// that has not noticed them.
//
// The key lives under "phoebe:guest-", so the logout wipe takes it with the
// rest of that family: a device handed to somebody else starts at nought and
// is greeted, which is the right way round. A person who never signs in keeps
// their own count.
//
// Only the last few days are kept — the question is "how many, up to three",
// not a history of use, and a list that grew for ever would be a record of
// somebody's prayer life sitting in local storage for no reason.

const KEY = "phoebe:guest-days-used";
/** Stop counting here: nothing asks a larger question. */
const CAP = 4;

function todayYmd(): string {
  try { return new Date().toLocaleDateString("en-CA"); } catch { return ""; }
}

function read(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Note today as a day this device was used, and answer how many distinct days
 * that now makes. Safe to call on every render of the home — a day already
 * counted writes nothing.
 */
export function noteDayUsed(): number {
  const ymd = todayYmd();
  if (!ymd) return 0;
  const days = read();
  if (days.includes(ymd)) return days.length;
  const next = [...days, ymd].sort().slice(-CAP);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode — today just won't count */ }
  return next.length;
}

/** How many distinct days this device has been used, without counting today. */
export function daysUsed(): number {
  return read().length;
}

/**
 * Three days in, the welcome is retired. Private mode reports nothing, so a
 * device that cannot remember keeps its welcome — the gentler failure.
 */
export const WELCOME_RETIRES_AFTER_DAYS = 3;
export function pastWelcome(): boolean {
  return daysUsed() >= WELCOME_RETIRES_AFTER_DAYS;
}
