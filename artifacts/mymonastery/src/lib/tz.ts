// ─── Canonical timezone / local-day helpers (frontend mirror) ────────────────
//
// IDENTICAL to artifacts/api-server/src/lib/tz.ts. The frontend can't import
// from api-server, so this is a hand-kept mirror — change both together.
//
// One source of truth for "what wall-clock time / calendar date is it in this
// IANA zone right now", with ONE consistent fallback: on an invalid/unparseable
// zone, fall back to UTC, never to a sentinel.

/** Current wall-clock hour/minute (0–23, 0–59) in the given IANA zone.
 *  Falls back to the UTC wall-clock if the zone is invalid. */
export function getCurrentTimeInTz(timezone: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(new Date());
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    // hour12:false renders midnight as "24" in some engines — normalize to 0.
    const h = isNaN(hour) ? 0 : hour === 24 ? 0 : hour;
    return { hour: h, minute: isNaN(minute) ? 0 : minute };
  } catch {
    const now = new Date();
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

/** True if `tz` is an IANA zone the runtime can format with. Lets callers
 *  skip work rather than silently acting on the UTC fallback above. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
