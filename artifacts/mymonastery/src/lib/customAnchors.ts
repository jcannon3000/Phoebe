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
export const SLOT_OPEN_HOUR: Record<CustomSlot, number> = {
  morning: 0, anytime: 0, midday: 10, afternoon: 14, evening: 17,
};

// Is the slot's window open right now? Morning + anytime are always open.
export function isSlotOpen(slot: CustomSlot, now: Date = new Date()): boolean {
  return now.getHours() >= (SLOT_OPEN_HOUR[slot] ?? 0);
}

// The local hour (0–23) after which a daytime slot has clearly PASSED for today
// — morning is behind you by noon, midday by 2 PM, afternoon by 5 PM (each rolls
// forward when the next block begins). "evening" is the last slot (never rolls
// to tomorrow), and "anytime" is flexible all day, so both are null (never past).
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
export type SlottedPractice = "cobreathe" | "listening" | "examen" | "walk" | "reading";
const PRACTICE_SLOT_DEFAULT: Record<SlottedPractice, CustomSlot> = {
  cobreathe: "morning",
  listening: "midday",
  examen: "evening",
  walk: "afternoon",
  reading: "afternoon", // was a hardcoded "afternoon"; now user-choosable
};
export function getPracticeSlot(key: SlottedPractice): CustomSlot {
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
};

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

export function removeCustomAnchor(id: string): void {
  // Record the tombstone FIRST so the next push tells the server to retire it
  // (absence alone never deletes — that's what makes accidental wipes impossible).
  addDeletedId(id);
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
function addDoneDay(id: string, ymd: string): void { writeDoneHist(id, [...readDoneHist(id), ymd]); }
function removeDoneDay(id: string, ymd: string): void { writeDoneHist(id, readDoneHist(id).filter((d) => d !== ymd)); }

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
    const entry: { done?: string; skip?: string; readToday?: string; readTotal?: number } = {};
    try {
      const done = localStorage.getItem(DONE_PREFIX + a.id); if (done) entry.done = done;
      const skip = localStorage.getItem(SKIP_PREFIX + a.id); if (skip) entry.skip = skip;
      const rt = localStorage.getItem(READ_TODAY_PREFIX + a.id); if (rt) entry.readToday = rt;
      const total = localStorage.getItem(READ_TOTAL_PREFIX + a.id);
      if (total) { const n = Number(total); if (Number.isFinite(n) && n > 0) entry.readTotal = n; }
    } catch { /* ignore */ }
    if (Object.keys(entry).length > 0) log[a.id] = entry;
  }
  const deletedIds = getDeletedIds();
  return { defs, log, updatedAt: Date.now(), ...(deletedIds.length > 0 ? { deletedIds } : {}) };
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
    const tomb = new Set<string>(snap.tombstones && typeof snap.tombstones === "object" ? Object.keys(snap.tombstones) : []);
    const serverIds = new Set(snap.defs.map((d) => d.id));
    // Local anchors the server hasn't seen yet — keep them rather than dropping
    // (a not-yet-synced add survives), EXCEPT ones the server says are deleted.
    const localOnly = getCustomAnchors().filter((a) => !serverIds.has(a.id) && !tomb.has(a.id));
    const serverDefs = snap.defs.filter((d) => !tomb.has(d.id));
    saveDefs([...serverDefs, ...localOnly]);
    // Re-stamp per-day state + reading total for the server's anchors. Local-only
    // anchors keep their existing localStorage state untouched.
    for (const a of serverDefs) {
      const e = snap.log?.[a.id] ?? {};
      setOrRemove(DONE_PREFIX + a.id, e.done);
      setOrRemove(SKIP_PREFIX + a.id, e.skip);
      setOrRemove(READ_TODAY_PREFIX + a.id, e.readToday);
      setOrRemove(READ_TOTAL_PREFIX + a.id, e.readTotal != null ? String(e.readTotal) : undefined);
    }
    if (tomb.size > 0) pruneDeletedIds(tomb);
    needsPush = localOnly.length > 0;
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
function flushPendingPush(): void {
  if (!pushTimer || suppressPush) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  // Use the snapshot captured at schedule time — never re-read a possibly
  // cleared localStorage on the way out.
  const payload = pendingSnapshot ?? exportCustomAnchorSnapshot();
  pendingSnapshot = null;
  if (!safeToPush(payload)) return;
  try {
    fetch("/api/me/custom-anchors", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* best-effort */ });
  } catch { doPush(payload); }
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
  if (serverDefs.length === 0 && localDefs.length === 0) return; // nothing anywhere

  // Union by id: server defs first (authoritative order), then any local-only —
  // excluding anything the server has tombstoned.
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
