// Custom practices — user-defined daily anchors. A person picks a title + any
// emoji ("Morning walk" 🚶), and it becomes a Daily-progress card with a check:
// tick it off → it slides into Done and counts as a dot, exactly like the built-
// in optional practices. No special logic — it's purely "did I do this today."
//
// Stored per-device in localStorage (definitions + per-day completion), mirroring
// the officePrefs / practiceCompletion pattern: instant, offline-safe, no server
// round-trip. Two custom events let mounted surfaces (useRhythmState, the create
// UI) re-read live: one when the LIST changes, one when a CHECK toggles.

// Where in the day this practice belongs — drives where its card slots into the
// daily rhythm (a morning walk near Morning Prayer, an evening stretch near the
// evening office, etc.). Defaults to "afternoon" (a neutral middle) for anchors
// created before this field existed.
export type CustomSlot = "morning" | "midday" | "afternoon" | "evening";
export const CUSTOM_SLOTS: CustomSlot[] = ["morning", "midday", "afternoon", "evening"];

// A reading ritual is a custom anchor you LOG by an amount rather than a plain
// check. The unit is how you measure a sitting — by chapter, by page, or by
// time (minutes). An optional per-day goal gives the log a target; logging any
// amount counts the dot for the day, and a running total remembers where you
// left off so the next sitting picks up from there.
export type ReadingUnit = "chapter" | "page" | "minute";
export const READING_UNITS: ReadingUnit[] = ["chapter", "page", "minute"];
export type ReadingConfig = { unit: ReadingUnit; goal?: number };

export type CustomAnchor = {
  id: string;
  title: string;
  emoji: string;
  slot: CustomSlot;
  // Present only for reading rituals; absent for plain check-off practices.
  reading?: ReadingConfig;
};

/** Singular/plural label for a reading unit ("3 chapters", "1 page", "20 min"). */
export function readingUnitLabel(unit: ReadingUnit, n: number): string {
  if (unit === "minute") return n === 1 ? "minute" : "minutes";
  if (unit === "page") return n === 1 ? "page" : "pages";
  return n === 1 ? "chapter" : "chapters";
}

const DEFS_KEY = "phoebe:custom-anchors";
const DONE_PREFIX = "phoebe:custom-done:";
// Reading logs: today's amount (per local day) + an all-time running total.
const READ_TODAY_PREFIX = "phoebe:custom-read:";   // value: `${ymd}|${amount}`
const READ_TOTAL_PREFIX = "phoebe:custom-read-total:"; // value: cumulative number

// List changed (added / removed) vs. a check toggled — separate so listeners can
// react to just what they care about.
export const CUSTOM_ANCHORS_EVENT = "phoebe:custom-anchors";
export const CUSTOM_DONE_EVENT = "phoebe:custom-anchor-done";

// A sane cap so the rhythm doesn't sprawl into dozens of dots.
const MAX_CUSTOM = 8;

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA"); // local day, matches every rhythm surface
}

export function getCustomAnchors(): CustomAnchor[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DEFS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (a): a is { id: string; title: string; emoji: string; slot?: unknown; reading?: unknown } =>
          !!a && typeof a.id === "string" && typeof a.title === "string" && typeof a.emoji === "string",
      )
      .map((a) => {
        const r = a.reading as { unit?: unknown; goal?: unknown } | undefined;
        const reading: ReadingConfig | undefined =
          r && READING_UNITS.includes(r.unit as ReadingUnit)
            ? { unit: r.unit as ReadingUnit, goal: typeof r.goal === "number" && r.goal > 0 ? r.goal : undefined }
            : undefined;
        return {
          id: a.id,
          title: a.title,
          emoji: a.emoji,
          slot: CUSTOM_SLOTS.includes(a.slot as CustomSlot) ? (a.slot as CustomSlot) : "afternoon",
          ...(reading ? { reading } : {}),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Add a custom practice. Title is required; emoji defaults to ✅ if blank.
 * Pass `reading` to make it a reading ritual (logged by chapter/page/time).
 */
export function addCustomAnchor(
  title: string,
  emoji: string,
  slot: CustomSlot = "afternoon",
  reading?: ReadingConfig,
): void {
  const t = title.trim();
  if (!t) return;
  const list = getCustomAnchors();
  if (list.length >= MAX_CUSTOM) return;
  // Unique-ish id from time + a little entropy (no server ids needed).
  const id = `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const clean: ReadingConfig | undefined =
    reading && READING_UNITS.includes(reading.unit)
      ? { unit: reading.unit, ...(reading.goal && reading.goal > 0 ? { goal: Math.round(reading.goal) } : {}) }
      : undefined;
  list.push({
    id,
    title: t.slice(0, 40),
    emoji: (emoji.trim() || (clean ? "📖" : "✅")).slice(0, 8),
    slot,
    ...(clean ? { reading: clean } : {}),
  });
  saveDefs(list);
}

export function removeCustomAnchor(id: string): void {
  saveDefs(getCustomAnchors().filter((a) => a.id !== id));
  // Drop today's completion flag + any reading logs so a re-added title doesn't
  // inherit them.
  try {
    localStorage.removeItem(DONE_PREFIX + id);
    localStorage.removeItem(SKIP_PREFIX + id);
    localStorage.removeItem(READ_TODAY_PREFIX + id);
    localStorage.removeItem(READ_TOTAL_PREFIX + id);
  } catch { /* ignore */ }
}

function saveDefs(list: CustomAnchor[]): void {
  try {
    localStorage.setItem(DEFS_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(CUSTOM_ANCHORS_EVENT));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/** True if this custom practice has been checked off today (local day). */
export function isCustomDoneToday(id: string): boolean {
  try {
    return localStorage.getItem(DONE_PREFIX + id) === todayISO();
  } catch {
    return false;
  }
}

/** Toggle today's check for a custom practice (tap to check, tap to undo). */
export function toggleCustomDoneToday(id: string): void {
  try {
    const key = DONE_PREFIX + id;
    if (localStorage.getItem(key) === todayISO()) localStorage.removeItem(key);
    else localStorage.setItem(key, todayISO());
    window.dispatchEvent(new Event(CUSTOM_DONE_EVENT));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

// "Not today" — the user logged that they're skipping this practice today. A
// skipped practice is HIDDEN for the day (not shown under Done) and drops out of
// the day's anchor count + dots, rather than counting as undone.
const SKIP_PREFIX = "phoebe:custom-skip:";

/** True if this custom practice was marked "not today" for the local day. */
export function isCustomSkippedToday(id: string): boolean {
  try {
    return localStorage.getItem(SKIP_PREFIX + id) === todayISO();
  } catch {
    return false;
  }
}

/** Log this practice as DONE today (clears any "not today"). */
export function markCustomDoneToday(id: string): void {
  try {
    localStorage.setItem(DONE_PREFIX + id, todayISO());
    localStorage.removeItem(SKIP_PREFIX + id);
    window.dispatchEvent(new Event(CUSTOM_DONE_EVENT));
  } catch {
    /* non-fatal */
  }
}

/** Log this practice as "not today" — hides it + drops its dot for the day. */
export function setCustomNotToday(id: string): void {
  try {
    // A reading skipped today drops today's logged amount — and that amount must
    // come back OUT of the running all-time total, or "X in all" drifts upward
    // every time a logged reading is later retracted.
    const todayAmt = getReadingToday(id);
    if (todayAmt > 0) {
      const total = getReadingTotal(id);
      localStorage.setItem(READ_TOTAL_PREFIX + id, String(Math.max(0, total - todayAmt)));
    }
    localStorage.setItem(SKIP_PREFIX + id, todayISO());
    localStorage.removeItem(DONE_PREFIX + id);
    localStorage.removeItem(READ_TODAY_PREFIX + id);
    window.dispatchEvent(new Event(CUSTOM_DONE_EVENT));
  } catch {
    /* non-fatal */
  }
}

// ── Reading rituals — logged by amount (chapter / page / minute) ──────────────

/** How much was logged for this reading today (0 if nothing / not today). */
export function getReadingToday(id: string): number {
  try {
    const raw = localStorage.getItem(READ_TODAY_PREFIX + id);
    if (!raw) return 0;
    const [ymd, amt] = raw.split("|");
    if (ymd !== todayISO()) return 0;
    const n = Number(amt);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Running all-time total logged for this reading (where you've read up to). */
export function getReadingTotal(id: string): number {
  try {
    const n = Number(localStorage.getItem(READ_TOTAL_PREFIX + id) || "0");
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Log a reading sitting of `amount` units for today. SETS today's amount (not
 * additive across taps — re-logging corrects the day), keeps the all-time total
 * in step, marks the anchor done for the day, and clears any "not today".
 */
export function logReadingToday(id: string, amount: number): void {
  const amt = Math.max(0, Math.round(amount));
  try {
    const prevToday = getReadingToday(id);
    const total = getReadingTotal(id);
    // Replace today's contribution in the running total, then re-add the new one.
    const nextTotal = Math.max(0, total - prevToday + amt);
    if (amt > 0) {
      localStorage.setItem(READ_TODAY_PREFIX + id, `${todayISO()}|${amt}`);
      localStorage.setItem(DONE_PREFIX + id, todayISO());
      localStorage.removeItem(SKIP_PREFIX + id);
    } else {
      // Logging zero clears today's check entirely.
      localStorage.removeItem(READ_TODAY_PREFIX + id);
      localStorage.removeItem(DONE_PREFIX + id);
    }
    localStorage.setItem(READ_TOTAL_PREFIX + id, String(nextTotal));
    window.dispatchEvent(new Event(CUSTOM_DONE_EVENT));
  } catch {
    /* non-fatal */
  }
}
