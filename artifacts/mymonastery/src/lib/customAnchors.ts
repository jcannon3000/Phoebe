// Custom practices — user-defined daily anchors. A person picks a title + any
// emoji ("Morning walk" 🚶), and it becomes a Daily-progress card with a check:
// tick it off → it slides into Done and counts as a dot, exactly like the built-
// in optional practices. No special logic — it's purely "did I do this today."
//
// Stored in localStorage (definitions + per-day state) as the instant, offline-
// safe cache AND mirrored to the SERVER (users.custom_anchors) so a person's
// rituals live in their data and show on every device — phone, web, anywhere.
// localStorage is written first (synchronous, never wiped); a debounced push
// syncs it up, and on login the server snapshot syncs back down. Two custom
// events let mounted surfaces (useRhythmState, the create UI) re-read live: one
// when the LIST changes, one when a CHECK toggles.

import { apiRequest } from "@/lib/queryClient";
import { pushRoutineConfig } from "@/lib/routineSync";
import { swellHaptic } from "@/lib/swellHaptic";
import { markRecentCompletion } from "@/lib/recentCompletion";

// Where in the day this practice belongs — drives where its card slots into the
// daily rhythm (a morning walk near Morning Prayer, an evening stretch near the
// evening office, etc.). Defaults to "afternoon" (a neutral middle) for anchors
// created before this field existed.
export type CustomSlot = "morning" | "anytime" | "midday" | "afternoon" | "evening";
// Picker/display order — Anytime leads (most custom practices aren't tied to a
// time of day). The DAY order on the home is SLOT_RANK below, unchanged:
// anytime cards still ride just after morning.
export const CUSTOM_SLOTS: CustomSlot[] = ["anytime", "morning", "midday", "afternoon", "evening"];

// Ordering of the slots in the daily rhythm. "anytime" sits right after the
// morning cards but carries no time gate.
export const SLOT_RANK: Record<CustomSlot, number> = {
  morning: 0, anytime: 1, midday: 2, afternoon: 3, evening: 4,
};

// The local hour (0–23) each slot's window OPENS. A slotted practice can't be
// completed before its window. Morning opens at the start of the day; "anytime"
// is never gated (always available, just ordered after morning).
//
// Owner: "let evening be available at 4pm" (was 5). Exported on its own because
// the evening gate had been copied as a bare `17` into half a dozen places —
// the evening card's "Later" state, the hero pick, the contemplation side
// gate — and a literal in each of them is how they drift apart.
export const EVENING_OPEN_HOUR = 16;
export const SLOT_OPEN_HOUR: Record<CustomSlot, number> = {
  morning: 0, anytime: 0, midday: 10, afternoon: 14, evening: EVENING_OPEN_HOUR,
};

// Is the slot's window open right now? Morning + anytime are always open.
export function isSlotOpen(slot: CustomSlot, now: Date = new Date()): boolean {
  return now.getHours() >= (SLOT_OPEN_HOUR[slot] ?? 0);
}

// The local hour (0–23) after which a daytime slot has clearly PASSED for today
// — morning is behind you by noon, midday by 2 PM, afternoon by 5 PM. "evening"
// is the last slot (never rolls to tomorrow), and "anytime" is flexible all day,
// so both are null (never past).
//
// These used to line up exactly with the next block's open hour. They no longer
// do: evening now opens at 4 PM (EVENING_OPEN_HOUR) while afternoon stays open
// until 5, so there's a deliberate hour of overlap. Left that way on purpose —
// closing afternoon an hour earlier would push an undone afternoon practice to
// "Tomorrow" sooner, which is a real loss to fix a symmetry nobody sees.
export const SLOT_CLOSE_HOUR: Record<CustomSlot, number | null> = {
  morning: 12, anytime: null, midday: 14, afternoon: 17, evening: null,
};

// Is this slot's window in the PAST for today? Used to route an undone practice
// to the "Tomorrow" section instead of nagging catch-up in Next — e.g. morning
// practices when you set up in the evening. null-close slots are never past.
export function isSlotPast(slot: CustomSlot, now: Date = new Date()): boolean {
  const close = SLOT_CLOSE_HOUR[slot];
  return close != null && now.getHours() >= close;
}

// A short "opens at" label for a gated slot (e.g. "10 AM"), or null when the
// slot is never gated (morning / anytime).
export function slotOpensLabel(slot: CustomSlot): string | null {
  const h = SLOT_OPEN_HOUR[slot] ?? 0;
  if (h <= 0) return null;
  const am = h < 12;
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  return `${hr12} ${am ? "AM" : "PM"}`;
}

// Built-in practices that the customizer places at a chosen time of day
// (Co-Breathe, Audio Divina, the Examen) — each carries a per-device slot.
// Sensible defaults if the user never picks one.
export type SlottedPractice = "cobreathe" | "listening" | "examen" | "walk" | "reading" | "visio";
const PRACTICE_SLOT_DEFAULT: Record<SlottedPractice, CustomSlot> = {
  // Visio Divina is looked at whenever there's light and quiet — not pinned.
  visio: "anytime",
  cobreathe: "morning",
  listening: "midday",
  examen: "evening",
  walk: "afternoon",
  reading: "afternoon", // was a hardcoded "afternoon"; now user-choosable
};
export function getPracticeSlot(key: SlottedPractice): CustomSlot {
  // Co-Breathe / Audio Divina / the Examen / a contemplative walk no longer
  // offer a time-of-day picker in the customizer (owner) — they're just
  // available all day now, so this ignores any slot stored from before that
  // change rather than resurrecting a stale morning/evening gate. "reading"
  // is unaffected — its picker still lives on its own customizer step.
  if (key === "cobreathe" || key === "listening" || key === "examen" || key === "walk") return "anytime";
  try {
    const v = localStorage.getItem(`phoebe:slot:${key}`) as CustomSlot | null;
    return v && CUSTOM_SLOTS.includes(v) ? v : PRACTICE_SLOT_DEFAULT[key];
  } catch {
    return PRACTICE_SLOT_DEFAULT[key];
  }
}
export function setPracticeSlot(key: SlottedPractice, slot: CustomSlot): void {
  try { localStorage.setItem(`phoebe:slot:${key}`, slot); } catch { /* private mode */ }
  pushRoutineConfig(); // sync the slot change across devices (lib/routineSync)
}

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
  /**
   * Which weekdays this practice is kept on, as JS day numbers (0 = Sunday …
   * 6 = Saturday). ABSENT means every day — the shape every anchor had before
   * this existed, so nothing already saved changes meaning.
   *
   * For practices that genuinely aren't daily: a community meal on weekdays, a
   * Saturday walk. On an off day the card doesn't appear and the weekly grid
   * shows no gap to feel bad about, rather than a dot you could never fill.
   */
  days?: number[];
  /**
   * This practice can ALSO be kept by praying an office in the app.
   *
   * VTS's Chapel is the case it exists for (owner): chapel is sometimes
   * Morning Prayer, and a student who doesn't have the physical BCP in front
   * of them should be able to pray it here and have that count. The practice
   * stays a plain named practice — this only adds a second door to keeping it,
   * offered on its log sheet and credited when that office is completed.
   *
   * A FLAG, never a name match: the practice can be renamed (the seminary's
   * Sunday is "Worship") without changing what it does.
   */
  office?: "morning" | "evening";
  /**
   * A yes/no QUESTION to ask instead of a bare "Done".
   *
   * The relational practices are things you either did or didn't do with
   * someone today — "Did you tell someone, or send someone a message, saying
   * what you are grateful for?" — and asking that reads truer than a checkbox
   * labelled "Express gratitude". Owner: "on the pop up for the log it will
   * say, did you tell someone or send someone a message today expressing
   * gratitude? Yes. Not today."
   *
   * When present the log sheet shows this and labels the affirmative "Yes".
   */
  prompt?: string;
};

/** Mon–Fri, the common case (a weekday practice). */
export const WEEKDAYS = [1, 2, 3, 4, 5];

/** "weekdays" / "weekends" / "Mon, Wed, Fri" — for describing a scoped anchor. */
export function describeDays(days: number[]): string {
  const set = [...new Set(days)].sort();
  if (set.length === 5 && set.every((d) => d >= 1 && d <= 5)) return "weekdays";
  if (set.length === 2 && set.includes(0) && set.includes(6)) return "weekends";
  const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return set.map((d) => NAMES[d]).join(", ");
}

/** Is this anchor kept on `date`'s weekday? No `days` = every day. */
export function anchorOnDay(a: { days?: number[] }, date: Date = new Date()): boolean {
  if (!a.days || a.days.length === 0) return true;
  return a.days.includes(date.getDay());
}

/** Singular/plural label for a reading unit ("3 chapters", "1 page", "20 min"). */
export function readingUnitLabel(unit: ReadingUnit, n: number): string {
  if (unit === "minute") return n === 1 ? "minute" : "minutes";
  if (unit === "page") return n === 1 ? "page" : "pages";
  return n === 1 ? "chapter" : "chapters";
}

const DEFS_KEY = "phoebe:custom-anchors";
// Tombstones: ids the user has DELETED. A delete is the only thing that removes
// an anchor on the server (the server unions everything else by id and never
// drops on absence), so we must tell it which ids to retire. Kept locally until
// the server acknowledges them (echoes them back in snapshot.tombstones).
const DELETED_KEY = "phoebe:custom-anchors-deleted";
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
        // Day numbers only, deduped and sorted; anything else is dropped so a
        // malformed value can't hide a practice forever.
        const rawDays = (a as { days?: unknown }).days;
        const days = Array.isArray(rawDays)
          ? [...new Set(rawDays.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6))].sort()
          : undefined;
        // WHITELIST — every field a practice carries has to be listed here.
        // This reader REBUILDS each practice rather than passing the stored
        // object through, so a field that isn't named below is silently
        // dropped on every read: it survives in storage and on the server, and
        // simply never reaches the app. That is how `office` first behaved —
        // written by the preset, present in localStorage, and invisible.
        const office = (a as { office?: unknown }).office;
        const rawPrompt = (a as { prompt?: unknown }).prompt;
        return {
          id: a.id,
          title: a.title,
          emoji: a.emoji,
          slot: CUSTOM_SLOTS.includes(a.slot as CustomSlot) ? (a.slot as CustomSlot) : "afternoon",
          ...(reading ? { reading } : {}),
          ...(days && days.length > 0 && days.length < 7 ? { days } : {}),
          ...(office === "morning" || office === "evening" ? { office } : {}),
          ...(typeof rawPrompt === "string" && rawPrompt.trim() ? { prompt: rawPrompt } : {}),
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
/**
 * RELATIONAL PRACTICES — a category of its own in the customizer.
 *
 * Owner: "a new page on the customizer that was relational … it would just
 * work like custom logs — give someone a hug, express gratitude, call a
 * friend. Let's just start with those three."
 *
 * They ARE custom logs: each is an ordinary custom anchor, so they inherit the
 * home card, the done state, the ordering and the day-scoping without a new
 * mechanism. What they add is a `prompt` — the log sheet asks a question and
 * answers "Yes" rather than offering a checkbox called "Express gratitude",
 * because these are things you either did with another person today or didn't.
 *
 * Matched by TITLE, which is also how addCustomAnchor dedupes, so choosing one
 * twice is a no-op and a person who typed the same name by hand keeps theirs.
 */
export const RELATIONAL_PRACTICES = [
  {
    id: "hug",
    title: "Give someone a hug",
    emoji: "🤗",
    prompt: "Did you hug someone today?",
  },
  {
    id: "gratitude",
    title: "Express gratitude",
    emoji: "🙏",
    prompt: "Did you tell someone, or send someone a message, saying what you are grateful for?",
  },
  {
    id: "call",
    title: "Call a friend",
    emoji: "📞",
    prompt: "Did you call a friend today?",
  },
] as const;

export type RelationalPracticeId = (typeof RELATIONAL_PRACTICES)[number]["id"];

/** Which relational practices are currently in the rule, by id. */
export function activeRelationalPractices(): RelationalPracticeId[] {
  const titles = new Set(getCustomAnchors().map((a) => a.title.trim().toLowerCase()));
  return RELATIONAL_PRACTICES.filter((r) => titles.has(r.title.toLowerCase())).map((r) => r.id);
}

/**
 * Add or remove the relational practices to match `wanted`.
 *
 * Removal is BY TITLE and only ever touches the three known ones — a person's
 * own practice with a similar name is never in RELATIONAL_PRACTICES, so it
 * cannot be swept up here.
 */
export function setRelationalPractices(wanted: readonly RelationalPracticeId[]): void {
  const want = new Set(wanted);
  const existing = getCustomAnchors();
  for (const r of RELATIONAL_PRACTICES) {
    const found = existing.find((a) => a.title.trim().toLowerCase() === r.title.toLowerCase());
    if (want.has(r.id) && !found) {
      addCustomAnchor(r.title, r.emoji, "anytime", undefined, undefined, undefined, r.prompt);
    } else if (!want.has(r.id) && found) {
      removeCustomAnchor(found.id);
    }
  }
}

export function addCustomAnchor(
  title: string,
  emoji: string,
  slot: CustomSlot = "afternoon",
  reading?: ReadingConfig,
  /** Weekdays this is kept on (0–6). Omit for every day. */
  days?: number[],
  /** See CustomAnchor.office — the office that can also keep this practice. */
  office?: "morning" | "evening",
  /** See CustomAnchor.prompt — a yes/no question in place of "Done". */
  prompt?: string,
): void {
  const t = title.trim();
  if (!t) return;
  const list = getCustomAnchors();
  if (list.length >= MAX_CUSTOM) return;
  // One practice per title, enforced at the ROOT. Every other add-path
  // already checked; the manual "Create your own" form didn't, and the login
  // sync now folds same-title copies into one — so a second "Stretch" made
  // here would survive only until the next sign-in, then silently collapse.
  // Refusing the duplicate up front is the honest version of that.
  if (list.some((a) => titleKey(a) === t.toLowerCase())) return;
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
    ...(days && days.length > 0 && days.length < 7
      ? { days: [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort() }
      : {}),
    ...(office ? { office } : {}),
    ...(prompt && prompt.trim() ? { prompt: prompt.trim() } : {}),
  });
  saveDefs(list);
}

// Ids the user has explicitly deleted (tombstones), so the server retires them
// rather than treating their absence as "nothing changed". Capped + persisted.
function getDeletedIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DELETED_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}
function addDeletedId(id: string): void {
  try {
    const next = [...new Set([...getDeletedIds(), id])].slice(-200);
    localStorage.setItem(DELETED_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}
// Once the server has acknowledged a tombstone (it echoes it in snapshot.tombstones),
// we can stop sending that id — bounds the deleted-ids list.
function pruneDeletedIds(acknowledged: Set<string>): void {
  if (acknowledged.size === 0) return;
  try {
    const remaining = getDeletedIds().filter((id) => !acknowledged.has(id));
    localStorage.setItem(DELETED_KEY, JSON.stringify(remaining));
  } catch { /* ignore */ }
}

// Wipe ALL custom practices (Settings → "Reset routine to default"). Absence
// never deletes — the server unions by id and a sync-down would resurrect them
// — so we TOMBSTONE every current anchor and PUT the empty+tombstoned snapshot
// up (awaited), so a post-reset /auth/me sync can't bring them back. Also drops
// each anchor's per-day completion / reading logs. Returns the push promise so a
// reset can await it before reloading. Best-effort: a guest with no real account
// just gets a harmless response.
export async function clearCustomAnchors(): Promise<void> {
  let payload: CustomAnchorSnapshot | null = null;
  try {
    for (const a of getCustomAnchors()) {
      addDeletedId(a.id);
      try {
        localStorage.removeItem(DONE_PREFIX + a.id);
        localStorage.removeItem(SKIP_PREFIX + a.id);
        localStorage.removeItem(READ_TODAY_PREFIX + a.id);
        localStorage.removeItem(READ_TOTAL_PREFIX + a.id);
      } catch { /* ignore */ }
    }
    saveDefs([]); // empty the local defs + fire the change event
    payload = exportCustomAnchorSnapshot(); // { defs: [], deletedIds: [...] }
  } catch { /* private mode */ }
  if (payload && (payload.deletedIds?.length ?? 0) > 0) {
    try { await apiRequest("PUT", "/api/me/custom-anchors", payload); } catch { /* best-effort */ }
  }
}

/**
 * Edit ONE practice in place — its name, emoji, time of day, days.
 *
 * There was no way to change a practice once made: the editor could only add
 * or remove, so the gear on a named practice had nothing to open and showed
 * the whole "Create your own" list instead. Reported when Chapel became a
 * practice of its own: "I now can't edit the chapel custom on its own."
 *
 * Fields absent from the patch are LEFT ALONE, which is what protects the
 * ones this form doesn't show — the reading config, and `office` (the door
 * that lets VTS's Chapel be kept by praying Morning Prayer). Rewriting the
 * record wholesale here would quietly drop them.
 */
export function updateCustomAnchor(
  id: string,
  patch: { title?: string; emoji?: string; slot?: CustomSlot; days?: number[] | null },
): void {
  const list = getCustomAnchors();
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return;
  const cur = list[i]!;
  const title = patch.title?.trim();
  const emoji = patch.emoji?.trim();
  const days = patch.days === null
    ? undefined
    : patch.days
      ? [...new Set(patch.days.filter((d) => d >= 0 && d <= 6))].sort()
      : cur.days;
  list[i] = {
    ...cur,
    ...(title ? { title: title.slice(0, 40) } : {}),
    ...(emoji ? { emoji: emoji.slice(0, 8) } : {}),
    ...(patch.slot && CUSTOM_SLOTS.includes(patch.slot) ? { slot: patch.slot } : {}),
    // A 7-day (or empty) selection means "every day", which this shape spells
    // as the field being absent — same rule addCustomAnchor writes by.
    ...(days && days.length > 0 && days.length < 7 ? { days } : {}),
  };
  if (!(days && days.length > 0 && days.length < 7)) delete (list[i] as { days?: number[] }).days;
  saveDefs(list); // schedules the server push, as add/remove do
}

export function removeCustomAnchor(id: string): void {
  // Record the tombstone FIRST so the next push tells the server to retire it
  // (absence alone never deletes — that's what makes accidental wipes impossible).
  addDeletedId(id);
  saveDefs(getCustomAnchors().filter((a) => a.id !== id));
  /**
   * FLUSH — a deletion doesn't wait out the debounce. The 800ms window is
   * fine for coalescing checkmarks; for a delete it's a window in which a
   * boot-time or focus-time sync-down can land a stale snapshot, or the tab
   * can close with the tombstone never sent (observed both ways: one
   * environment resurrected the anchor locally, the other never pushed at
   * all and the reload restored it). saveDefs above scheduled the push;
   * this sends it now, with the snapshot captured post-removal.
   */
  try { void flushCustomAnchorPush(); } catch { /* best-effort */ }
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

/**
 * "I'm keeping this practice by praying the office" — set when someone opens
 * the office from a practice's log sheet, read when the office completes.
 *
 * DERIVED, NOT WRITTEN AT COMPLETION. The office's own completion is the
 * source of truth (see the office-completed invariant: an office counts only
 * when its slideshow is finished), so rather than hooking that path and
 * writing a second done-stamp — two records that can disagree — the practice
 * simply asks: did I send someone to this office today, and is that office
 * done? One computation, and it survives the app being backgrounded mid-office.
 */
const OFFICE_INTENT_PREFIX = "phoebe:anchor-office-intent:";
export function markAnchorOfficeIntent(id: string): void {
  try { localStorage.setItem(OFFICE_INTENT_PREFIX + id, todayISO()); } catch { /* private mode */ }
}
export function hasAnchorOfficeIntentToday(id: string): boolean {
  try { return localStorage.getItem(OFFICE_INTENT_PREFIX + id) === todayISO(); } catch { return false; }
}
/** Clear the intent — used when the practice is explicitly un-logged, so the
 *  office no longer keeps it on the reader's behalf. */
export function clearAnchorOfficeIntent(id: string): void {
  try { localStorage.removeItem(OFFICE_INTENT_PREFIX + id); } catch { /* private mode */ }
}

/** Toggle today's check for a custom practice (tap to check, tap to undo). */
export function toggleCustomDoneToday(id: string): void {
  try {
    const key = DONE_PREFIX + id;
    if (localStorage.getItem(key) === todayISO()) { localStorage.removeItem(key); removeDoneDay(id, todayISO()); }
    else { localStorage.setItem(key, todayISO()); addDoneDay(id, todayISO()); }
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

// ── Per-day completion history (for the weekly grid) ──────────────────────────
// A small rolling set of recent kept-days (YYYY-MM-DD) per anchor, so the weekly
// progress grid can show a row for custom practices too. Pruned to ~21 days; only
// grows going forward (no backfill of days before this shipped — the row fills in
// over the week). DONE_PREFIX still holds just "kept today" for the daily card.
const DONE_HIST_PREFIX = "phoebe:custom-done-hist:";
function readDoneHist(id: string): string[] {
  try {
    const raw = localStorage.getItem(DONE_HIST_PREFIX + id);
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}
function writeDoneHist(id: string, days: string[]): void {
  // Distinct, sorted (YYYY-MM-DD sorts chronologically), most-recent 21 kept.
  try { localStorage.setItem(DONE_HIST_PREFIX + id, JSON.stringify(Array.from(new Set(days)).sort().slice(-21))); }
  catch { /* non-fatal */ }
}
function addDoneDay(id: string, ymd: string): void {
  writeDoneHist(id, [...readDoneHist(id), ymd]);
  pushCustomDone(id, ymd, true);
}
function removeDoneDay(id: string, ymd: string): void {
  writeDoneHist(id, readDoneHist(id).filter((d) => d !== ymd));
  pushCustomDone(id, ymd, false);
}

// ── Server mirror ────────────────────────────────────────────────────────────
//
// Keeping a custom practice used to live ONLY on the device. The anchor
// DEFINITIONS synced (users.custom_anchors), but the days you kept them never
// left the phone — so clearing a cache, or signing in somewhere else, silently
// lost that history, and nothing server-side could see it (the widget payload,
// for one, is built from these).
//
// They ride practice_completion now, as `custom:<id>`, alongside every other
// practice. Local storage stays the source of truth for RENDERING — it's
// synchronous and works offline — and this is a best-effort mirror on top:
// every write is fire-and-forget, and a failed one just leaves the day local
// until the next sync-down reconciles.
//
// TWO PATHS, deliberately — read this before adding a third:
//   • TODAY's done/skip stamp already rides the routine SNAPSHOT
//     (CustomAnchorSnapshot.log, merged by mergeLogEntry, later-stamp-wins).
//     That predates this and still handles today.
//   • The 21-day HISTORY (DONE_HIST_PREFIX, what the weekly grid draws) was in
//     no snapshot at all, and is what this adds.
// History goes to practice_completion rather than into the snapshot's blob
// because it wants to be QUERIED server-side — one row per practice per day is
// what a widget payload (or any future digest) can read, which a JSON blob on
// the user row is not.
//
// KNOWN LIMIT: the sync-down is a union, so an UNMARK doesn't propagate across
// devices. The DELETE reaches the server, but a device that already merged that
// day keeps it locally — nothing here removes a day it can already see. Making
// absence authoritative would need to distinguish "the server never had it"
// from "this device hasn't pushed it yet", or an offline device would lose
// genuine local marks on the next sync.
const customSection = (id: string) => `custom:${id}`;
/** Sunday that begins this local day's week — the shape the table wants. */
function weekStartOf(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString("en-CA");
}
function pushCustomDone(id: string, ymd: string, done: boolean): void {
  // The server's own id rule (CUSTOM_SECTION in routes/practice-completion).
  // A locally-generated id should always pass; skip rather than send a 400.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
  const body = done
    ? { section: customSection(id), localDate: ymd, weekStart: weekStartOf(ymd) }
    : { section: customSection(id), localDate: ymd };
  void apiRequest(done ? "POST" : "DELETE", "/api/practice-completion", body)
    .catch(() => { /* best effort — the day is already kept locally */ });
}

/**
 * Merge the account's custom-practice history down into this device.
 *
 * UNION, never replace: a day kept on this device that hasn't reached the
 * server yet (offline, or a push that failed) must survive the sync rather
 * than being erased by a server list that doesn't know about it. An unmark
 * propagates through pushCustomDone's DELETE, not through absence here.
 */
export async function syncCustomDoneFromServer(): Promise<void> {
  try {
    // Matches writeDoneHist's own 21-day retention — fetching 28 merged a week
    // that the very next prune threw away.
    const since = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 21);
      return d.toLocaleDateString("en-CA");
    })();
    const res = await apiRequest<{ completions?: Array<{ section: string; localDate: string }> }>(
      "GET", `/api/practice-completion?since=${encodeURIComponent(since)}`,
    );
    const byId = new Map<string, string[]>();
    for (const c of res?.completions ?? []) {
      if (!c?.section?.startsWith("custom:")) continue;
      const id = c.section.slice("custom:".length);
      if (!id || !c.localDate) continue;
      byId.set(id, [...(byId.get(id) ?? []), c.localDate]);
    }
    if (byId.size === 0) return;
    for (const [id, days] of byId) writeDoneHist(id, [...readDoneHist(id), ...days]);
    window.dispatchEvent(new Event(CUSTOM_DONE_EVENT));
  } catch { /* best effort */ }
}

/** The set of recent local days this custom practice was kept — including today
 *  if it's currently marked done. Powers the weekly progress grid's custom rows. */
export function getCustomDoneDays(id: string): Set<string> {
  const set = new Set(readDoneHist(id));
  if (isCustomDoneToday(id)) set.add(todayISO());
  return set;
}

/** Log this practice as DONE today (clears any "not today"). */
export function markCustomDoneToday(id: string): void {
  const wasAlreadyDone = isCustomDoneToday(id);
  try {
    localStorage.setItem(DONE_PREFIX + id, todayISO());
    localStorage.removeItem(SKIP_PREFIX + id);
    addDoneDay(id, todayISO());
    window.dispatchEvent(new Event(CUSTOM_DONE_EVENT));
    if (!wasAlreadyDone) markRecentCompletion(`custom-${id}`);
  } catch {
    /* non-fatal */
  }
  // A fresh completion of a custom routine practice → the swell haptic.
  if (!wasAlreadyDone) swellHaptic();
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
    removeDoneDay(id, todayISO());
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
      // …and into the weekly HISTORY. Without this a reading ritual read as
      // kept today (getCustomDoneDays adds today from DONE_PREFIX) and then
      // disappeared from the grid tomorrow, because the day was never
      // recorded. It's also what carries the day to the server now.
      addDoneDay(id, todayISO());
    } else {
      // Logging zero clears today's check entirely.
      localStorage.removeItem(READ_TODAY_PREFIX + id);
      localStorage.removeItem(DONE_PREFIX + id);
      removeDoneDay(id, todayISO());
    }
    localStorage.setItem(READ_TOTAL_PREFIX + id, String(nextTotal));
    window.dispatchEvent(new Event(CUSTOM_DONE_EVENT));
  } catch {
    /* non-fatal */
  }
}

// ── Server sync ───────────────────────────────────────────────────────────────
// A person's rituals are their DATA, not a device setting: they must show on
// every device (the "I see my custom ritual on the phone but not the web" bug).
// We keep localStorage as the instant, offline-safe cache and mirror the whole
// thing — definitions + today's per-day state + reading totals — to the server
// (users.custom_anchors, GET via /auth/me, PUT /api/me/custom-anchors). On login
// the server snapshot syncs DOWN; every local change pushes UP (debounced).

export type CustomAnchorSnapshot = {
  defs: CustomAnchor[];
  // Per-anchor state, keyed by anchor id: today's done/skip day-stamps, today's
  // reading log ("ymd|amount"), and the all-time reading total.
  log: Record<string, { done?: string; skip?: string; readToday?: string; readTotal?: number }>;
  updatedAt: number;
  // Ids the user explicitly deleted — sent UP so the server tombstones them
  // (absence never deletes). On the way DOWN the server echoes accumulated
  // tombstones so this device can drop any locally-resurrected copy.
  deletedIds?: string[];
  tombstones?: Record<string, number>;
};

// True only while we're WRITING the server snapshot into localStorage, so the
// change-events that fire during import don't immediately push it back up.
let suppressPush = false;
// Flips true once we've heard from the server (a sync-down landed). Until then
// we refuse to push an EMPTY snapshot — a fresh/cleared/corrupted device must
// not send "I have nothing" before it's learned what the server holds. (The
// server merge already refuses to delete on absence; this is defence-in-depth
// that also avoids needless churn + a cross-user-leak push right after login.)
let serverSyncReceived = false;

/** Build the full snapshot (defs + per-day state + pending deletes) from localStorage. */
export function exportCustomAnchorSnapshot(): CustomAnchorSnapshot {
  const defs = getCustomAnchors();
  const log: CustomAnchorSnapshot["log"] = {};
  for (const a of defs) {
    const entry = readLocalLogEntry(a.id);
    if (Object.keys(entry).length > 0) log[a.id] = entry;
  }
  const deletedIds = getDeletedIds();
  return { defs, log, updatedAt: Date.now(), ...(deletedIds.length > 0 ? { deletedIds } : {}) };
}

/** One practice per TITLE — the key every add-path already dedupes on. */
function titleKey(a: { title: string }): string {
  return a.title.trim().toLowerCase();
}

/** One anchor's per-day state, read straight out of localStorage. */
function readLocalLogEntry(id: string): LogEntry {
  const entry: LogEntry = {};
  try {
    const done = localStorage.getItem(DONE_PREFIX + id); if (done) entry.done = done;
    const skip = localStorage.getItem(SKIP_PREFIX + id); if (skip) entry.skip = skip;
    const rt = localStorage.getItem(READ_TODAY_PREFIX + id); if (rt) entry.readToday = rt;
    const total = localStorage.getItem(READ_TOTAL_PREFIX + id);
    if (total) { const n = Number(total); if (Number.isFinite(n) && n > 0) entry.readTotal = n; }
  } catch { /* ignore */ }
  return entry;
}

function writeLocalLogEntry(id: string, e: LogEntry): void {
  setOrRemove(DONE_PREFIX + id, e.done);
  setOrRemove(SKIP_PREFIX + id, e.skip);
  setOrRemove(READ_TODAY_PREFIX + id, e.readToday);
  setOrRemove(READ_TOTAL_PREFIX + id, e.readTotal != null ? String(e.readTotal) : undefined);
}

function setOrRemove(key: string, value: string | undefined): void {
  try {
    if (value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

/** Merge a server snapshot DOWN into localStorage. The server is authoritative
 *  for anchors it KNOWS about, but a local-only anchor (added on this device and
 *  not yet pushed up, or pushed while offline) is KEPT — the sync-down used to
 *  blindly replace the list, which silently wiped a not-yet-synced custom card
 *  (the recurring "I lost my custom practice" bug). We union by id: server defs
 *  first, then any local-only defs appended, and push the merged set back up so
 *  the server catches up. */
export function importCustomAnchorSnapshot(snap: CustomAnchorSnapshot | null | undefined): void {
  if (!snap || !Array.isArray(snap.defs)) return;
  // We've now heard from the server — empty pushes are allowed again (a genuine
  // "I deleted my last card" carries deletedIds; an empty-from-corruption is
  // still harmless because the server merge won't delete on absence).
  serverSyncReceived = true;
  let needsPush = false;
  suppressPush = true;
  try {
    // Tombstones the server reports — ids the user deleted (here or elsewhere).
    // Drop any local copy so a delete genuinely propagates across devices, and
    // stop re-sending deletes the server has now acknowledged.
    /**
     * TWO sets, because "tombstoned" means two different things here and
     * conflating them destroyed deletions. serverTomb is what the SERVER has
     * ACKNOWLEDGED — the only thing that may retire a local pending delete.
     * tomb (below) additionally carries the LOCAL pending deletes, and is
     * used ONLY to filter incoming defs. The first version of this fix fed
     * the combined set to pruneDeletedIds, so a delete whose push had FAILED
     * (a 403, offline, a 500) pruned its own tombstone on the first
     * sync-down: the deletion survived one reload and was silently undone on
     * the second, with the local tombstone — the sole record the deletion
     * ever happened — thrown away unacknowledged. Traced across two reloads
     * with the push instrumented; the prune must gate on the server's echo
     * and nothing else.
     */
    const serverTomb = new Set<string>(snap.tombstones && typeof snap.tombstones === "object" ? Object.keys(snap.tombstones) : []);
    const tomb = new Set<string>(serverTomb);
    /**
     * LOCAL pending deletes count as tombstones too. The server's snapshot is
     * only as fresh as when it was fetched — commit() invalidates /auth/me,
     * and a refetch racing the delete's own PUT hands back a blob that still
     * carries the deleted anchor. Accepting it resurrected the practice
     * locally seconds after the ✕ (observed live: local defs regained
     * "Community Meal" while the SERVER had already deleted it). A local
     * tombstone the server hasn't acknowledged yet is a delete in flight, and
     * a delete in flight outranks a stale snapshot; pruneDeletedIds retires it
     * once the server echoes it back.
     */
    for (const id of getDeletedIds()) tomb.add(id);

    /**
     * ONE practice per title — the union is by id, and ids are random.
     *
     * Reported: "I logged in and logged out and somehow the Community Meal
     * custom from the VTS preset was duplicated." Every path that CREATES an
     * anchor already refuses a title it already has, but ids come from
     * `Date.now()` + entropy, so the SAME practice made twice is two different
     * ids — and a union by id keeps both. That's all it takes: adopt the VTS
     * preset while signed out, sign in, and the server's Community Meal meets
     * the device's, agreeing on everything except the one field the merge
     * compares.
     *
     * So titles are collapsed here, where the two lists actually meet. The
     * SURVIVOR is whichever comes first — server defs are walked first, so the
     * id other devices already know is the one that lives, and the local twin
     * is the one retired. Deduping only in the caller wouldn't have held:
     * this function re-derives local-only anchors from localStorage, so the
     * twin would simply be added back a line later.
     *
     * A folded twin's own record is merged into the survivor rather than
     * dropped, so collapsing them can never un-log a day someone kept, and its
     * id is TOMBSTONED so the next sync-down doesn't resurrect it.
     */
    const keptByTitle = new Map<string, CustomAnchor>();
    /** folded id → the id that now carries it */
    const folded = new Map<string, string>();
    const serverDefs: CustomAnchor[] = [];
    for (const d of snap.defs) {
      if (tomb.has(d.id)) continue;
      const seen = keptByTitle.get(titleKey(d));
      if (seen) { folded.set(d.id, seen.id); continue; }
      keptByTitle.set(titleKey(d), d);
      serverDefs.push(d);
    }
    const serverIds = new Set(serverDefs.map((d) => d.id));
    // Local anchors the server hasn't seen yet — keep them rather than dropping
    // (a not-yet-synced add survives), EXCEPT ones the server says are deleted
    // and ones that are just another copy of a title we're already keeping.
    const localOnly: CustomAnchor[] = [];
    for (const a of getCustomAnchors()) {
      if (serverIds.has(a.id)) continue;
      if (tomb.has(a.id)) {
        // Another device already folded this copy. Its id must go — but a
        // day logged HERE against it (a push still in the debounce when the
        // other device synced) belongs to the survivor, not the grave.
        const seen = keptByTitle.get(titleKey(a));
        if (seen) folded.set(a.id, seen.id);
        continue;
      }
      const seen = keptByTitle.get(titleKey(a));
      if (seen) { folded.set(a.id, seen.id); continue; }
      keptByTitle.set(titleKey(a), a);
      localOnly.push(a);
    }
    // What each folded copy had recorded, gathered BEFORE anything is removed —
    // from BOTH stores. The twin's record can live only in the incoming
    // snapshot: log out (localStorage wiped) and back in, and the server's
    // copy of the pair arrives with its done-day and reading totals in
    // snap.log while localStorage has nothing. Reading localStorage alone
    // dropped exactly the data this fold exists to preserve — and then the
    // tombstone push had the server prune it too, unrecoverably. The 21-day
    // grid history folds along with it, or a week of kept dots collapsed to
    // at most today.
    const foldedInto = new Map<string, LogEntry[]>();
    const foldedHist = new Map<string, string[]>();
    for (const [from, into] of folded) {
      const twin = mergeLogEntry(readLocalLogEntry(from), snap.log?.[from]);
      foldedInto.set(into, [...(foldedInto.get(into) ?? []), twin]);
      foldedHist.set(into, [...(foldedHist.get(into) ?? []), ...readDoneHist(from)]);
    }

    saveDefs([...serverDefs, ...localOnly]);
    // Re-stamp per-day state + reading total for the server's anchors. Local-only
    // anchors keep their existing localStorage state untouched.
    for (const a of serverDefs) {
      let e: LogEntry = snap.log?.[a.id] ?? {};
      for (const twin of foldedInto.get(a.id) ?? []) e = mergeLogEntry(e, twin);
      writeLocalLogEntry(a.id, e);
    }
    // A local-only survivor keeps its own state, plus anything folded into it.
    for (const a of localOnly) {
      const twins = foldedInto.get(a.id);
      if (!twins?.length) continue;
      let e = readLocalLogEntry(a.id);
      for (const twin of twins) e = mergeLogEntry(e, twin);
      writeLocalLogEntry(a.id, e);
    }
    // The weekly grid draws from each anchor's 21-day history — carry the
    // folded copies' kept days onto the survivor (writeDoneHist dedupes,
    // sorts, and keeps the most recent 21).
    for (const [into, days] of foldedHist) {
      if (days.length > 0) writeDoneHist(into, [...readDoneHist(into), ...days]);
    }
    if (serverTomb.size > 0) pruneDeletedIds(serverTomb);
    // Retire the folded ids: tombstone (absence alone never deletes, so without
    // this the server would hand the twin straight back) and drop their state,
    // which now lives on the survivor.
    for (const from of folded.keys()) {
      addDeletedId(from);
      writeLocalLogEntry(from, {});
      try { localStorage.removeItem(DONE_HIST_PREFIX + from); } catch { /* ignore */ }
    }
    needsPush = localOnly.length > 0 || folded.size > 0;
    window.dispatchEvent(new Event(CUSTOM_ANCHORS_EVENT));
    window.dispatchEvent(new Event(CUSTOM_DONE_EVENT));
  } finally {
    suppressPush = false;
  }
  // Reconcile the server with the local-only anchors we just preserved.
  if (needsPush) pushCustomAnchors();
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
// The snapshot captured when the push was SCHEDULED, reused by the unload-time
// flush. Capturing it up-front means a page-hide flush can't re-read a
// localStorage that was cleared/corrupted in the meantime and send an empty set.
let pendingSnapshot: CustomAnchorSnapshot | null = null;

// Refuse to push a snapshot that would announce "I have nothing" with no
// explicit deletes. The ONLY legitimate empty push is "I deleted my last card",
// which carries deletedIds (tombstones) — that still goes through. An empty
// snapshot from a corrupted/cleared/re-read localStorage carries no deletedIds,
// so it's blocked unconditionally (not just before first sync — the earlier
// version let a post-sync corrupted re-read through). Absence never deletes.
function safeToPush(snap: CustomAnchorSnapshot): boolean {
  if (snap.defs.length === 0 && (!snap.deletedIds || snap.deletedIds.length === 0)) return false;
  return true;
}
function doPush(snap?: CustomAnchorSnapshot): void {
  const payload = snap ?? exportCustomAnchorSnapshot();
  if (!safeToPush(payload)) return;
  try {
    apiRequest("PUT", "/api/me/custom-anchors", payload).catch(() => { /* best-effort */ });
  } catch { /* ignore */ }
}
/** Debounced push of the local snapshot up to the server. */
export function pushCustomAnchors(): void {
  if (suppressPush) return;
  pendingSnapshot = exportCustomAnchorSnapshot(); // capture now, flush-safe
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; const s = pendingSnapshot; pendingSnapshot = null; doPush(s ?? undefined); }, 800);
}

// Flush a PENDING push IMMEDIATELY, surviving an imminent page unload. The 800ms
// debounce can be outrun by an app update / reload / backgrounding, which would
// drop a just-logged practice before it reached the server — the recurring
// "I logged it, then an update un-logged it" bug. `keepalive` lets the PUT
// complete even as the page goes away. Registered on visibilitychange/pagehide.
function flushPendingPush(): Promise<void> {
  if (!pushTimer || suppressPush) return Promise.resolve();
  clearTimeout(pushTimer);
  pushTimer = null;
  // Use the snapshot captured at schedule time — never re-read a possibly
  // cleared localStorage on the way out.
  const payload = pendingSnapshot ?? exportCustomAnchorSnapshot();
  pendingSnapshot = null;
  if (!safeToPush(payload)) return Promise.resolve();
  try {
    return fetch("/api/me/custom-anchors", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* best-effort */ }).then(() => undefined);
  } catch { doPush(payload); return Promise.resolve(); }
}

/**
 * Send any pending (debounced) custom-anchor push NOW, and resolve once the
 * server has it. For callers about to RE-READ derived state from the server
 * (the customizer's edit list) — without this the read races the 800ms
 * debounce and shows the state from before the edit.
 */
export function flushCustomAnchorPush(): Promise<void> {
  return flushPendingPush();
}

// Day-stamps are ISO YYYY-MM-DD, which sort lexically — so the later string is
// the more recent day. Ties keep `a` (local).
function laterStamp(a?: string, b?: string): string | undefined {
  if (a && b) return a >= b ? a : b;
  return a || b;
}
// readToday is "ymd|amount" — keep the later day; same day → LOCAL (a). A
// same-day local edit is the most recent action on THIS device, so it must win
// (a downward correction can't be reverted by a stale-but-larger server value).
function laterReadToday(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  const [ay] = a.split("|");
  const [by] = b.split("|");
  if (ay !== by) return ay > by ? a : b;
  return a;
}
type LogEntry = { done?: string; skip?: string; readToday?: string; readTotal?: number };
// Merge one anchor's per-day state field-by-field, keeping the MOST RECENT value
// for each. Critical: a blind `{...local, ...server}` let a stale server entry
// (e.g. one whose debounced push hadn't landed before an app update reloaded the
// page) wipe a fresh local "done today" — the "I logged it, then an update
// un-logged it" bug. Field-wise most-recent-wins is safe both for that same-
// device race AND for genuine cross-device updates.
function mergeLogEntry(l: LogEntry | undefined, s: LogEntry | undefined): LogEntry {
  const e: LogEntry = {};
  const done = laterStamp(l?.done, s?.done);
  const skip = laterStamp(l?.skip, s?.skip);
  if (done) e.done = done;
  // done + skip are mutually exclusive on a given day — the positive "done" wins.
  if (skip && skip !== done) e.skip = skip;
  const rt = laterReadToday(l?.readToday, s?.readToday);
  if (rt) e.readToday = rt;
  const total = Math.max(l?.readTotal ?? 0, s?.readTotal ?? 0);
  if (total > 0) e.readTotal = total;
  return e;
}

/**
 * Reconcile with the server snapshot at login by UNION-MERGING definitions by
 * id — so a ritual never disappears, whether it was created on this device or
 * another. Server state wins for shared ids (most recent cross-device truth);
 * local-only rituals are kept and pushed up. If the merge added anything the
 * server didn't have (incl. the first-time migration of existing local
 * rituals), the union is pushed up so the person's data ends up complete.
 */
export function syncCustomAnchorsFromServer(server: CustomAnchorSnapshot | null | undefined): void {
  // We've now heard from the server — release the empty-push guard either way.
  serverSyncReceived = true;
  const localDefs = getCustomAnchors();
  const serverDefs = (Array.isArray(server?.defs) ? server!.defs : []) as CustomAnchor[];
  // Tombstones the server reports — ids deleted here or on another device. They
  // must drop from the union so a delete genuinely propagates (not resurrect).
  const tombstones = (server?.tombstones && typeof server.tombstones === "object") ? server.tombstones : undefined;
  const tomb = new Set<string>(tombstones ? Object.keys(tombstones) : []);
  if (serverDefs.length === 0 && localDefs.length === 0) {
    /**
     * Nothing anywhere — but the ACK still has to be honoured on the way out.
     *
     * This early return sits BEFORE the prune, and "no defs on either side" is
     * exactly the state you land in after deleting your last practice. So the
     * server could echo the tombstone back forever and the local pending
     * delete was never retired: harmless in effect (it only ever filters a def
     * that no longer exists) but the deleted-list then grows without bound and
     * re-sends on every push, which is the one thing the prune exists to stop.
     * Traced end-to-end on a real network: three reloads, server tombstone
     * present throughout, local list never shrinking.
     */
    if (tombstones) pruneDeletedIds(new Set(Object.keys(tombstones)));
    return;
  }

  // Union by id: server defs first (authoritative order), then any local-only —
  // excluding anything the server has tombstoned.
  // Local pending deletes outrank a stale server snapshot here too.
  for (const id of getDeletedIds()) tomb.add(id);
  const byId = new Map<string, CustomAnchor>();
  for (const d of serverDefs) if (d && typeof d.id === "string" && !tomb.has(d.id)) byId.set(d.id, d);
  for (const d of localDefs) if (!byId.has(d.id) && !tomb.has(d.id)) byId.set(d.id, d);
  const mergedDefs = Array.from(byId.values());

  // Merge per-day state field-by-field, keeping the most-recent value for each
  // anchor (NOT a blind server-wins, which wiped freshly-logged local state).
  const localLog = exportCustomAnchorSnapshot().log;
  const serverLog = (server?.log && typeof server.log === "object" ? server.log : {}) as CustomAnchorSnapshot["log"];
  const mergedLog: CustomAnchorSnapshot["log"] = {};
  for (const id of new Set([...Object.keys(localLog), ...Object.keys(serverLog)])) {
    mergedLog[id] = mergeLogEntry(localLog[id], serverLog[id]);
  }

  importCustomAnchorSnapshot({ defs: mergedDefs, log: mergedLog, updatedAt: Date.now(), ...(tombstones ? { tombstones } : {}) });

  // Push the reconciled snapshot up whenever it differs from what the server
  // had — covers the first-time migration, a ritual added on this device, AND
  // recovering a freshly-logged local "done" the server's snapshot was missing
  // (otherwise the next reload's sync would drop it again). Skip the push when
  // nothing changed so two devices don't ping-pong identical writes.
  let changedVsServer = mergedDefs.length !== serverDefs.length;
  if (!changedVsServer) {
    for (const id of Object.keys(mergedLog)) {
      if (JSON.stringify(mergedLog[id]) !== JSON.stringify(serverLog[id])) { changedVsServer = true; break; }
    }
  }
  if (changedVsServer) doPush();
}

/** Wipe ALL custom-anchor local state. Call on LOGOUT so the next person on
 *  this device never inherits the previous user's rituals (which would then be
 *  pushed up to the new user's row — a cross-user data leak). Also resets the
 *  server-sync gate so the next session re-syncs before it can push. */
export function clearCustomAnchorStorage(): void {
  serverSyncReceived = false;
  // Flush any pending push FIRST (it carries the CURRENT user's data, incl. a
  // practice just logged inside the debounce window) so logout doesn't drop it
  // and a later re-login can't import a stale server snapshot over it. The
  // keepalive PUT goes to the still-authenticated user's row, then we wipe local.
  try { flushPendingPush(); } catch { /* best-effort */ }
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  pendingSnapshot = null;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // Every custom-anchor key (defs, done/skip/read/read-total/hist, deleted)
      // shares the phoebe:custom- prefix.
      if (k && k.startsWith("phoebe:custom-")) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

// Any local change (list add/remove via saveDefs, or a check/skip/reading log)
// fires one of these events — mirror it up to the server (suppressed during a
// server→local import so it doesn't echo).
if (typeof window !== "undefined") {
  window.addEventListener(CUSTOM_ANCHORS_EVENT, pushCustomAnchors);
  window.addEventListener(CUSTOM_DONE_EVENT, pushCustomAnchors);
  // Persist a just-logged practice BEFORE the page can go away (an app update /
  // reload / backgrounding). Without this the 800ms debounce loses the race and
  // the log never reaches the server — the recurring un-logging bug.
  window.addEventListener("pagehide", flushPendingPush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingPush();
  });
}
