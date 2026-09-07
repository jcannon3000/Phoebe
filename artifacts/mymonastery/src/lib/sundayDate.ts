// ── Which Sunday is "this Sunday" — ONE answer, shared ───────────────────────
//
// The Sunday readings deck, the background walk that saves it, and the server
// that builds it must all name the SAME day, or the deck asks for a key the
// walk never wrote and This Sunday is blank with the readings sitting on the
// phone.
//
// The server resolves the coming Sunday in NEW YORK (rclLectionary's
// nextSundayDate → todayInNewYork), because the lectionary is an American
// church's calendar and rolls over on its clock, not the viewer's. So this
// does too — a viewer in Auckland on Sunday morning is still on Saturday's
// New York readings, which is exactly what the server would have served them.
//
// Was: the deck and the walk both used the literal string "next", because
// /api/office/sunday ignored ?date= and only ever built the coming Sunday.
// That held ONE Sunday, and worse, "next" never sorted before a date so
// pruneOfficeCacheBefore could not sweep it: offline on the 13th you'd have
// been served the 6th's readings, up to five weeks stale.

/** Today's date in New York, as YYYY-MM-DD. */
function todayYmdNY(now: Date): string {
  // en-CA formats as YYYY-MM-DD, which is the whole reason it's used here.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** The weekday in New York, 0 = Sunday. */
function dowNY(now: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // UTC arithmetic on a date-only value: no DST hour can shift the day.
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/**
 * The next N Sundays in New York, as YYYY-MM-DD, starting with the coming one.
 * TODAY counts when today is Sunday — that matches nextSundayDate server-side
 * (`add = dow === 0 ? 0 : 7 - dow`), so a Sunday morning reader gets today's
 * readings rather than next week's.
 */
export function sundayYmdsNY(count = 1, now: Date = new Date()): string[] {
  const today = todayYmdNY(now);
  const dow = dowNY(now);
  const first = addDaysYmd(today, dow === 0 ? 0 : 7 - dow);
  return Array.from({ length: Math.max(1, count) }, (_, i) => addDaysYmd(first, i * 7));
}

/** The coming Sunday in New York — what the This Sunday deck is showing. */
export function nextSundayYmdNY(now: Date = new Date()): string {
  return sundayYmdsNY(1, now)[0];
}
