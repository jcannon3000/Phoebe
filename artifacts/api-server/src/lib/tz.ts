// ─── Canonical timezone / local-day helpers ─────────────────────────────────
//
// One source of truth for "what wall-clock time / calendar date is it in this
// IANA zone right now". These were previously reimplemented ~6 times across the
// api-server (bellSender, blessReminderScheduler, moments, parish,
// prayer-feeds) with DIVERGENT fallback behavior: most fell back to UTC, but
// blessReminderScheduler fell back to {hour:-1,minute:-1} / "" sentinels.
// Divergent fallbacks in scheduling code can silently misfire reminders, so the
// policy here is ONE consistent fallback — on an invalid/unparseable zone, fall
// back to UTC, never to a sentinel.
//
// Callers that must NOT act on a UTC fallback (e.g. a tz-local reminder that
// would be wrong, not just late, if fired at UTC time) should gate on
// isValidTimeZone() and skip, instead of relying on a sentinel return.
//
// The frontend keeps an identical copy at artifacts/mymonastery/src/lib/tz.ts
// (it can't import from api-server). Keep the two in sync.

/** Wall-clock hour/minute (0–23, 0–59) in the given IANA zone.
 *  Falls back to the UTC wall-clock if the zone is invalid.
 *  `at` pins the evaluation to one instant — schedulers that compare many
 *  users against the same tick MUST pass it, or the clock advances mid-loop
 *  and users processed after a minute boundary are judged against a
 *  different minute than users processed before it. */
export function getCurrentTimeInTz(timezone: string, at?: Date): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(at ?? new Date());
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    // hour12:false renders midnight as "24" in some engines — normalize to 0.
    const h = isNaN(hour) ? 0 : hour === 24 ? 0 : hour;
    return { hour: h, minute: isNaN(minute) ? 0 : minute };
  } catch {
    const now = at ?? new Date();
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

/** Today's calendar date as "YYYY-MM-DD" in the given IANA zone.
 *  Falls back to the UTC calendar date if the zone is invalid. */
export function todayDateInTz(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Legacy alias for {@link todayDateInTz}. Several call sites spell this
 *  "todayInZone"; the behavior is identical (both yield "YYYY-MM-DD"). */
export const todayInZone = todayDateInTz;

/** True if `tz` is an IANA zone the runtime can format with. Lets schedulers
 *  skip an item rather than silently acting on the UTC fallback above. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
