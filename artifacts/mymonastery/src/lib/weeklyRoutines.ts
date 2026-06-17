// Weekly routines — practices that recur once a WEEK rather than once a day.
// Drawn from the Episcopal "Way of Love" rule of life (Curry), which has seven
// practices: Turn · Learn · Pray · Worship · Bless · Go · Rest. Phoebe's DAILY
// rhythm already carries three of them — Pray (the office), Learn (the daily
// reflection), and Turn (the daily turning of the heart). The remaining FOUR are
// naturally weekly: Worship (gather), Bless (be a blessing), Go (cross a
// boundary), Rest (keep a sabbath). A weekly practice is "kept" if done at least
// once in the current liturgical week (Sunday → Saturday).
//
// BETA, client-first: definitions (which are enabled + a target day) and per-
// week completion live in localStorage, mirroring lib/customAnchors — instant,
// offline, no server round-trip, no schema collision. A future v2 can sync these
// to the server for cross-device + weekly nudges. Two events let mounted
// surfaces re-read live: one when the SET changes (enabled/day), one when a
// CHECK toggles.

export type WeeklyKey = "worship" | "bless" | "go" | "rest";

export type WeeklyPractice = {
  key: WeeklyKey;
  emoji: string;
  title: string;
  blurb: string;
  /** The single-tap "mark kept" affordance label. */
  cta: string;
  /** A natural day of the week (0=Sun … 6=Sat) this practice leans toward, or
   *  null for "any day this week". Drives the "by Sunday" nudge + ordering. */
  day: number | null;
  /** Accent colour "r,g,b" for the card, matching the app's per-practice hues. */
  rgb: string;
};

// The catalog — the four weekly Way-of-Love practices, in the framework's order
// (Worship · Bless · Go · Rest). Worship leans toward Sunday; the rest are kept
// any day of the week.
export const WEEKLY_CATALOG: WeeklyPractice[] = [
  { key: "worship", emoji: "⛪", title: "Worship", blurb: "Gather for the Eucharist with your community.", cta: "Mark kept", day: 0, rgb: "92,157,239" },
  { key: "bless", emoji: "🤲", title: "Bless", blurb: "Be a blessing — a gift, a kindness, an encouragement.", cta: "Mark kept", day: null, rgb: "108,162,124" },
  { key: "go", emoji: "🚶", title: "Go", blurb: "Cross a boundary — serve, listen, share your faith.", cta: "Mark kept", day: null, rgb: "96,141,209" },
  { key: "rest", emoji: "🕊️", title: "Rest", blurb: "Keep a sabbath — one day set apart.", cta: "Mark kept", day: null, rgb: "62,124,122" },
];

const ENABLED_KEY = "phoebe:weekly-routines";       // string[] of enabled keys
const DAY_PREFIX = "phoebe:weekly-day:";            // per-key target-day override
const DONE_PREFIX = "phoebe:weekly-done:";          // per-key per-week completion

// Set/check changed — separate so listeners react to just what they care about.
export const WEEKLY_SET_EVENT = "phoebe:weekly-routines";
export const WEEKLY_DONE_EVENT = "phoebe:weekly-done";

function localDay(d: Date): string {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD, local
}

// The liturgical week starts on SUNDAY. The week key is that Sunday's local date,
// so every day Sun–Sat maps to the same key, and it rolls over at Saturday→Sunday
// midnight in the viewer's own timezone.
export function currentWeekKey(now: Date = new Date()): string {
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return localDay(sunday);
}

function isValidKey(k: unknown): k is WeeklyKey {
  return k === "worship" || k === "bless" || k === "go" || k === "rest";
}

export function getEnabledKeys(): WeeklyKey[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ENABLED_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(isValidKey);
  } catch {
    return [];
  }
}

export function isWeeklyEnabled(key: WeeklyKey): boolean {
  return getEnabledKeys().includes(key);
}

export function setWeeklyEnabled(key: WeeklyKey, on: boolean): void {
  const cur = new Set(getEnabledKeys());
  if (on) cur.add(key); else cur.delete(key);
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify([...cur]));
    window.dispatchEvent(new Event(WEEKLY_SET_EVENT));
  } catch { /* private mode / quota — non-fatal */ }
}

/** The target day for a practice — a user override, else the catalog default. */
export function getWeeklyDay(key: WeeklyKey): number | null {
  try {
    const raw = localStorage.getItem(DAY_PREFIX + key);
    if (raw === null) return WEEKLY_CATALOG.find((p) => p.key === key)?.day ?? null;
    if (raw === "any") return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
  } catch {
    return WEEKLY_CATALOG.find((p) => p.key === key)?.day ?? null;
  }
}

export function setWeeklyDay(key: WeeklyKey, day: number | null): void {
  try {
    localStorage.setItem(DAY_PREFIX + key, day === null ? "any" : String(day));
    window.dispatchEvent(new Event(WEEKLY_SET_EVENT));
  } catch { /* non-fatal */ }
}

/** Kept at least once in the CURRENT week (viewer's local Sunday-start week)? */
export function isWeeklyKept(key: WeeklyKey): boolean {
  try {
    return localStorage.getItem(DONE_PREFIX + key) === currentWeekKey();
  } catch {
    return false;
  }
}

/** Toggle "kept this week" for a practice (tap to keep, tap to undo). */
export function toggleWeeklyKept(key: WeeklyKey): void {
  try {
    const k = DONE_PREFIX + key;
    if (localStorage.getItem(k) === currentWeekKey()) localStorage.removeItem(k);
    else localStorage.setItem(k, currentWeekKey());
    window.dispatchEvent(new Event(WEEKLY_DONE_EVENT));
  } catch { /* non-fatal */ }
}

export type EnabledWeekly = WeeklyPractice & { day: number | null; kept: boolean };

/** The enabled practices, resolved with their (possibly overridden) day +
 *  this-week kept state, ordered for the "This week" rail: practices with a
 *  day come first (in day order), then the any-day ones. */
export function getEnabledWeekly(): EnabledWeekly[] {
  const enabled = new Set(getEnabledKeys());
  return WEEKLY_CATALOG
    .filter((p) => enabled.has(p.key))
    .map((p) => ({ ...p, day: getWeeklyDay(p.key), kept: isWeeklyKept(p.key) }))
    .sort((a, b) => {
      const da = a.day ?? 99;
      const db = b.day ?? 99;
      return da - db;
    });
}
