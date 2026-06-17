// Daily gratitude — "thank three people".
//
// NOT a gratitude journal. The practice is OUTWARD: each day you actually thank
// three real human beings, then write their names here — a reminders-app of
// gratitude. Three slots, filled through the day, reset at local midnight.
//
// BETA, client-first: the day's three names live in localStorage (per-day key),
// mirroring lib/customAnchors — instant, offline, no schema collision with the
// parallel session. A future v2 can sync the names + the "done" marker to the
// server (cross-device) and drive the 3×/day "who can you thank?" nudges.

export const THANKS_SLOTS = 3;
const MAX_NAME = 60;

const PREFIX = "phoebe:gratitude-thanks:"; // + YYYY-MM-DD → JSON string[]

// Fired whenever today's names change, so mounted surfaces (the /thanks screen,
// the daily-progress card) re-read live.
export const THANKS_EVENT = "phoebe:gratitude-thanks";

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA"); // local day, matches every rhythm surface
}

function keyFor(ymd: string): string {
  return PREFIX + ymd;
}

/** Today's three slots, as a fixed-length array of names ("" = empty slot). */
export function getTodayThanks(): string[] {
  const out = ["", "", ""];
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(todayISO())) || "[]");
    if (Array.isArray(raw)) {
      for (let i = 0; i < THANKS_SLOTS; i++) {
        if (typeof raw[i] === "string") out[i] = raw[i].slice(0, MAX_NAME);
      }
    }
  } catch { /* private mode / parse — empty slots */ }
  return out;
}

/** How many of today's three slots are filled (a non-blank name). */
export function thanksFilledCount(names: string[] = getTodayThanks()): number {
  return names.filter((n) => n.trim().length > 0).length;
}

/** All three thanked today? */
export function thanksDoneToday(names: string[] = getTodayThanks()): boolean {
  return thanksFilledCount(names) >= THANKS_SLOTS;
}

/** Set one slot's name (trims, caps length). Persists today's three slots. */
export function setThank(index: number, name: string): void {
  if (index < 0 || index >= THANKS_SLOTS) return;
  const names = getTodayThanks();
  names[index] = name.slice(0, MAX_NAME);
  saveToday(names);
}

/** Clear one slot. */
export function clearThank(index: number): void {
  if (index < 0 || index >= THANKS_SLOTS) return;
  const names = getTodayThanks();
  names[index] = "";
  saveToday(names);
}

function saveToday(names: string[]): void {
  try {
    // Store all three slots verbatim — getTodayThanks() always re-pads to the
    // fixed slot shape on read, so blank slots are preserved positionally.
    localStorage.setItem(keyFor(todayISO()), JSON.stringify(names.map((n) => n ?? "")));
    window.dispatchEvent(new Event(THANKS_EVENT));
  } catch { /* private mode / quota — non-fatal */ }
}

/** The distinct people thanked over the last `days` days (most recent first) —
 *  a quiet trail of who you've been grateful toward. For a "your week in
 *  gratitude" flourish; deduped case-insensitively, original casing kept. */
export function recentThankedNames(days = 7): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const now = new Date();
  for (let d = 0; d < days; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    const ymd = day.toLocaleDateString("en-CA");
    try {
      const raw = JSON.parse(localStorage.getItem(keyFor(ymd)) || "[]");
      if (!Array.isArray(raw)) continue;
      for (const n of raw) {
        const name = typeof n === "string" ? n.trim() : "";
        if (!name) continue;
        const lc = name.toLowerCase();
        if (seen.has(lc)) continue;
        seen.add(lc);
        out.push(name);
      }
    } catch { /* skip this day */ }
  }
  return out;
}
