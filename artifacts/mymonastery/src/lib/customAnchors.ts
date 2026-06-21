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
import { swellHaptic } from "@/lib/swellHaptic";

// Where in the day this practice belongs — drives where its card slots into the
// daily rhythm (a morning walk near Morning Prayer, an evening stretch near the
// evening office, etc.). Defaults to "afternoon" (a neutral middle) for anchors
// created before this field existed.
export type CustomSlot = "morning" | "midday" | "afternoon" | "evening";
export const CUSTOM_SLOTS: CustomSlot[] = ["morning", "midday", "afternoon", "evening"];

// Journaling (a built-in optional practice) is flexible about WHEN — morning
// pages, an evening reflection — so, like a custom anchor, it carries a
// time-of-day slot that places its card in the rhythm at the chosen time.
// Stored per-device; defaults to evening (the most common journaling beat).
const JOURNALING_SLOT_KEY = "phoebe:journaling-slot";
export function getJournalingSlot(): CustomSlot {
  try {
    const v = localStorage.getItem(JOURNALING_SLOT_KEY) as CustomSlot | null;
    return v && CUSTOM_SLOTS.includes(v) ? v : "evening";
  } catch {
    return "evening";
  }
}
export function setJournalingSlot(slot: CustomSlot): void {
  try { localStorage.setItem(JOURNALING_SLOT_KEY, slot); } catch { /* private mode */ }
}

// Other built-in practices that the customizer now places at a chosen time of day
// (Co-Breathe, Audio Divina, the Examen) — each carries a per-device slot, same
// idea as journaling. Sensible defaults if the user never picks one.
export type SlottedPractice = "cobreathe" | "listening" | "examen" | "lectio" | "walk";
const PRACTICE_SLOT_DEFAULT: Record<SlottedPractice, CustomSlot> = {
  cobreathe: "morning",
  listening: "midday",
  examen: "evening",
  lectio: "morning",
  walk: "afternoon",
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
};

// True only while we're WRITING the server snapshot into localStorage, so the
// change-events that fire during import don't immediately push it back up.
let suppressPush = false;

/** Build the full snapshot (defs + per-day state) from localStorage. */
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
  return { defs, log, updatedAt: Date.now() };
}

function setOrRemove(key: string, value: string | undefined): void {
  try {
    if (value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

/** Write a server snapshot DOWN into localStorage (server is authoritative). */
export function importCustomAnchorSnapshot(snap: CustomAnchorSnapshot | null | undefined): void {
  if (!snap || !Array.isArray(snap.defs)) return;
  suppressPush = true;
  try {
    // Replace the definition list (handles cross-device adds/removes), then
    // re-stamp each anchor's per-day state + reading total.
    saveDefs(snap.defs);
    for (const a of snap.defs) {
      const e = snap.log?.[a.id] ?? {};
      setOrRemove(DONE_PREFIX + a.id, e.done);
      setOrRemove(SKIP_PREFIX + a.id, e.skip);
      setOrRemove(READ_TODAY_PREFIX + a.id, e.readToday);
      setOrRemove(READ_TOTAL_PREFIX + a.id, e.readTotal != null ? String(e.readTotal) : undefined);
    }
    window.dispatchEvent(new Event(CUSTOM_ANCHORS_EVENT));
    window.dispatchEvent(new Event(CUSTOM_DONE_EVENT));
  } finally {
    suppressPush = false;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function doPush(): void {
  try {
    apiRequest("PUT", "/api/me/custom-anchors", exportCustomAnchorSnapshot()).catch(() => { /* best-effort */ });
  } catch { /* ignore */ }
}
/** Debounced push of the local snapshot up to the server. */
export function pushCustomAnchors(): void {
  if (suppressPush) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; doPush(); }, 800);
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
  try {
    fetch("/api/me/custom-anchors", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exportCustomAnchorSnapshot()),
      keepalive: true,
    }).catch(() => { /* best-effort */ });
  } catch { doPush(); }
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
  const localDefs = getCustomAnchors();
  const serverDefs = (Array.isArray(server?.defs) ? server!.defs : []) as CustomAnchor[];
  if (serverDefs.length === 0 && localDefs.length === 0) return; // nothing anywhere

  // Union by id: server defs first (authoritative order), then any local-only.
  const byId = new Map<string, CustomAnchor>();
  for (const d of serverDefs) if (d && typeof d.id === "string") byId.set(d.id, d);
  for (const d of localDefs) if (!byId.has(d.id)) byId.set(d.id, d);
  const mergedDefs = Array.from(byId.values());

  // Merge per-day state field-by-field, keeping the most-recent value for each
  // anchor (NOT a blind server-wins, which wiped freshly-logged local state).
  const localLog = exportCustomAnchorSnapshot().log;
  const serverLog = (server?.log && typeof server.log === "object" ? server.log : {}) as CustomAnchorSnapshot["log"];
  const mergedLog: CustomAnchorSnapshot["log"] = {};
  for (const id of new Set([...Object.keys(localLog), ...Object.keys(serverLog)])) {
    mergedLog[id] = mergeLogEntry(localLog[id], serverLog[id]);
  }

  importCustomAnchorSnapshot({ defs: mergedDefs, log: mergedLog, updatedAt: Date.now() });

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
