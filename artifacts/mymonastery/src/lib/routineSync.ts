// routineSync — sync the routine SETTINGS (per-side office levels, reflection
// source, practice time-of-day slots, FDD mode, psalm cycle, contemplation
// style) across devices, so a person's daily rhythm matches phone ↔ web.
//
// These settings otherwise live ONLY in this device's localStorage (the
// customizer writes them via setSideLevel / setPracticeSlot / etc.), so the home
// routine differed between devices. We mirror them into ONE server blob
// (users.rule_config), last-write-wins by `updatedAt`. Custom anchors sync
// separately (lib/customAnchors); daily completion (done/read) stays local and
// is tracked server-side elsewhere — neither is included here.
import { apiRequest } from "@/lib/queryClient";

export const ROUTINE_SYNCED_EVENT = "phoebe:routine-synced";

export type RoutineConfig = { values: Record<string, string>; updatedAt: number };

// The exact localStorage keys that define the routine STRUCTURE (not daily logs).
// Keep in sync with the setters in lib/officePrefs.ts + lib/customAnchors.ts.
// Exported so prescribe-routine.tsx can snapshot/restore EXACTLY the set of
// keys that syncs, instead of keeping its own hand-copied mirror. That mirror
// drifted twice (phoebe:contemplation-log-method and
// phoebe:hide-turn-learn-pray were added here but never there), and each drift
// silently overwrote the designing admin's OWN value and pushed it to their
// devices. Deriving from one list makes that class of bug impossible.
export const ROUTINE_KEYS: string[] = [
  // Per-side office method + entry + reflection (officePrefs.ts).
  "phoebe:office:level:morning", "phoebe:office:level:evening",
  // The one-day practice swap (date inside the VALUE, so the key is fixed and
  // can live in this list). Synced so the swap shows on every device today;
  // it self-expires by date, so a stale synced value is simply ignored.
  "phoebe:office:day-swap:morning", "phoebe:office:day-swap:evening",
  // The user's own routine order + which practice each notification opens —
  // the flat-routine model's two carriers (see lib/routineOrder.ts).
  "phoebe:routine-order",
  "phoebe:notify-target:morning", "phoebe:notify-target:evening",
  "phoebe:office:entry:morning", "phoebe:office:entry:evening",
  "phoebe:office:reflection:morning", "phoebe:office:reflection:evening",
  // Name of a side's own "Create your own" custom practice (level "custom").
  "phoebe:office:custom-name:morning", "phoebe:office:custom-name:evening",
  // A DIFFERENT practice on certain weekdays (officePrefs.getSideDayRules) —
  // e.g. Chapel Mon–Fri, Morning Prayer on Saturday, Worship on Sunday.
  "phoebe:office:level-days:morning", "phoebe:office:level-days:evening",
  // Which weekdays each non-office practice card is kept on (practiceDays.ts).
  "phoebe:practice-days",
  // A SECOND practice on the side, alongside its anchor (getSideExtra).
  "phoebe:office:extra:morning", "phoebe:office:extra:evening",
  // Prayer List + BCP merge (community intercessions prayed within the office).
  "phoebe:office:community-within:morning", "phoebe:office:community-within:evening",
  // Per-side Contemplative Prayer (drives the Morning/Evening Contemplation cards).
  "phoebe:office:contemplation:morning", "phoebe:office:contemplation:evening",
  // …and WHICH contemplative practice that side keeps — silent sit or the
  // Creation Prayer breath. Per side, so a rule can hold both (see
  // officePrefs.getSideContemplationKind). A key missing from THIS list is
  // never mirrored to localStorage and never syncs, so it must live here.
  "phoebe:office:contemplation-kind:morning", "phoebe:office:contemplation-kind:evening",
  // Per-side sit length + confession + gratitude toggles (were device-local
  // only, so they were lost on logout→login; now they ride the rule_config).
  "phoebe:office:minutes:morning", "phoebe:office:minutes:evening",
  "phoebe:office:confession:morning", "phoebe:office:confession:evening",
  "phoebe:office:gratitude:morning", "phoebe:office:gratitude:evening",
  // Global office/reflection settings.
  "phoebe:office:reflection-source", "phoebe:office:audio-source",
  "phoebe:office:default-entry", "phoebe:office:include-gratitude-slide",
  "phoebe:office:contemplation-minutes",
  "phoebe:office:show-cac-close", "phoebe:office:show-fdd-close", "phoebe:office:show-ssje-close",
  "phoebe:fdd-mode", "phoebe:psalm-cycle", "phoebe:contemplation-style", "phoebe:contemplation-log-method",
  // Which readings the Daily Scripture Reading deck includes (officePrefs'
  // getScriptureParts). A rule preference, so it travels like one.
  "phoebe:scripture-scope",
  // Whether the daily silence is one sit or several. Reported: "even though I
  // had multiple sits saved, it defaulted to one sit when I came back" — the
  // interview was writing it into the spec, but a key missing from THIS list is
  // never mirrored to localStorage and never synced, so it could not survive
  // the trip back.
  "phoebe:contemplation-sits",
  // Creation Prayer breath-count preset (customizer "How many breaths?" +
  // the /cobreathe Length dropdown share this key).
  "phoebe:cobreathe-length",
  // Practice time-of-day slots (customAnchors.ts).
  "phoebe:slot:cobreathe", "phoebe:slot:listening", "phoebe:slot:examen",
  // visio belongs with its siblings: it IS a SlottedPractice, getPracticeSlot
  // honours its key (it's one of only two not short-circuited to "anytime"),
  // and both the home card and the widget place it by that slot. Missing here
  // it never synced, never reached rule_config — so describeSpec could emit no
  // `slot:visio` row and the "Your rhythm" list had no way to show or delete
  // Visio Divina — and "Reset routine to default" left the stale slot behind.
  "phoebe:slot:walk", "phoebe:slot:reading", "phoebe:slot:visio",
  // Which side (if any) the Prayer List satisfies. Its own docblock calls this
  // "whether the Prayer List satisfies morningDone/eveningDone" — completion
  // structure, not a device preference — and it was in NO list: it never
  // synced, it survived logout into the next person's session, and a leader
  // designing a community rule never got theirs back.
  "phoebe:prayer-list-slot",
  // The 30-day commitment's start date (lib/commitment.ts) — synced so
  // "Day N of 30" agrees across the user's devices instead of each device
  // starting its own trial.
  "phoebe:commitment-start",
  // The Way of Love WEEKLY practices the user keeps (lib/weeklyRhythm.ts —
  // Commune/Go/Bless/Rest, a JSON array). Synced so the "This week" band
  // matches across devices, and carried into prescribed/community rules so a
  // rule of life can include a weekly rhythm too.
  "phoebe:weekly-practices",
  // The optional rest WINDOW ("an event to rest" — day lives in users.restDays,
  // the time window here). Rides rules so a community's rule can carry it.
  "phoebe:rest-window",
  // Which COURSES the reader has taken off their home screen, and which medium
  // Audio Divina defaults to. Both are exactly the shape of the key above them
  // — a home-display choice and a practice preference — and both were written
  // without joining this list, which is the drift this file's own header
  // documents happening twice before. Missing here they never sync, and (since
  // guestSeed derives its logout wipe from this list) they survive into the
  // next person's session on a shared device.
  "phoebe:course-hidden",
  "phoebe:audio-divina-medium",
  // Course progress (lib/courseProgress.ts) — which lessons are completed + the
  // last one opened, per course. Device-local like the office method was, so it
  // was lost on logout→login; now it rides the rule_config too. One key per
  // course (a small fixed set); the value is the course's JSON progress blob.
  "phoebe:course:spiritual-journey:v1",
  "phoebe:course:centering-prayer:v1",
  "phoebe:course:way-of-love:v1",
];

const UPDATED_AT_KEY = "phoebe:routine:updated-at";
// Which user the routine keys currently in localStorage belong to. The LWW clock
// is only meaningful WITHIN one account — so on a user SWITCH (logout→login, a
// guest→account, a different account) we must NOT let the device's clock decide,
// or the previous session's routine (or the seeded default) would overwrite the
// account's saved routine. Instead we adopt the account's server config.
const OWNER_KEY = "phoebe:routine:owner";

function getLocalUpdatedAt(): number {
  try { const n = parseInt(localStorage.getItem(UPDATED_AT_KEY) ?? "0", 10); return Number.isFinite(n) ? n : 0; } catch { return 0; }
}
function setLocalUpdatedAt(t: number): void {
  try { localStorage.setItem(UPDATED_AT_KEY, String(t)); } catch { /* private mode */ }
}

// Wipe every routine-STRUCTURE key from this device (Settings → "Reset routine
// to default"). Daily completion logs (done/read) are NOT touched — only the
// rule's shape. Callers re-seed the default + sync afterward.
export function clearRoutineKeys(): void {
  try {
    for (const k of ROUTINE_KEYS) localStorage.removeItem(k);
    localStorage.removeItem(UPDATED_AT_KEY);
  } catch { /* private mode */ }
}

// Snapshot the routine keys currently set in localStorage.
export function collectRoutineValues(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const k of ROUTINE_KEYS) {
      const v = localStorage.getItem(k);
      if (v != null) out[k] = v;
    }
  } catch { /* private mode */ }
  return out;
}

// ADDITIVE keys: applied from the server when present, but NEVER deleted just
// because an incoming config omits them. Course progress is genuinely per-device
// (you complete lessons on your phone) and only piggybacks on the rule_config
// blob — so a routine-only push from a course-less device, or adopting a
// community/season rule (whose spec has no course keys), must not wipe the
// lessons you've kept. Restore on a true user-switch still works: the account's
// server config carries the course keys, so they're applied; a fresh device just
// keeps its (already-wiped-on-logout) empty set.
const ADDITIVE_KEYS = new Set<string>([
  "phoebe:course:spiritual-journey:v1",
  "phoebe:course:centering-prayer:v1",
  "phoebe:course:way-of-love:v1",
  /**
   * …and WHICH COURSES were taken off the home, for exactly the reason above.
   *
   * Reported: "somehow a course i removed from my home screen got back on it."
   * The hide is a routine key, so an incoming config that OMITS it deletes it
   * — and a routine spec never carries it: adopting a preset, a prescribed
   * routine or a community rule pushes a config built from that spec, so the
   * next sync-down removed the hide and the course returned. This is the
   * second time this removal has come back by a different road (the setter
   * itself used not to push at all, see setCourseHiddenFromHome), which is
   * what a key that is a PREFERENCE rather than part of the rule's shape
   * earns by living in this list at all.
   *
   * Safe as additive: un-hiding writes the key as an empty array rather than
   * deleting it, so "show it again" still travels between devices.
   */
  "phoebe:course-hidden",
]);

// Mirror an authoritative server config into localStorage: set the keys it
// carries, and clear routine keys it OMITS (those are at their default on the
// source device) — EXCEPT additive keys, which are only ever added/updated,
// never removed on absence. Fires ROUTINE_SYNCED_EVENT so the UI re-reads.
function applyRoutineValues(values: Record<string, string>): void {
  let changed = false;
  try {
    for (const k of ROUTINE_KEYS) {
      const v = values[k];
      const cur = localStorage.getItem(k);
      if (typeof v === "string") {
        if (cur !== v) { localStorage.setItem(k, v); changed = true; }
      } else if (cur != null && !ADDITIVE_KEYS.has(k)) {
        localStorage.removeItem(k); changed = true;
      }
    }
  } catch { /* private mode */ }
  if (changed) { try { window.dispatchEvent(new Event(ROUTINE_SYNCED_EVENT)); } catch { /* ignore */ } }
}

/**
 * DESIGNING-FOR-SOMEONE-ELSE mode: stop pushing this device's routine up.
 *
 * The customizer in `prescribe` mode writes the design into the SAME
 * localStorage keys the designer's own rhythm lives in, and the host pages
 * snapshot those keys and restore them afterwards. That handles the device.
 * It does not handle the SERVER: nearly every setter in the customizer fires
 * OFFICE_PREFS_EVENT, App.tsx pushes on that event, and so a leader designing
 * their group's rule of life was streaming the half-built design up as their
 * OWN rule_config, one debounce at a time.
 *
 * The restore does end with a push of the original values, so the happy path
 * healed itself. A closed tab, a killed app, or a phone that syncs in the
 * window between did not — and what stayed on the server then synced DOWN to
 * their other devices as the routine they'd never chosen.
 *
 * So the push is suspended for the duration instead of being undone after.
 * Local writes still happen (the customizer has to read back what it wrote);
 * only the server round-trip is held. The clock is deliberately NOT stamped
 * either — bumping it would make this device win the next reconcile with
 * values that were never the designer's.
 */
let syncSuspended = false;
export function setRoutineSyncSuspended(on: boolean): void {
  syncSuspended = on;
  if (on) cancelPush();
}

// Debounced push of this device's routine to the server (bumps the LWW clock).
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function pushRoutineConfig(): void {
  if (syncSuspended) return;
  const at = Date.now();
  setLocalUpdatedAt(at);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    apiRequest("PUT", "/api/me/rule-config", { values: collectRoutineValues(), updatedAt: at }).catch(() => { /* best-effort */ });
  }, 800);
}

// Cancel any queued push. Used on a user switch (a push scheduled for the
// PREVIOUS owner must never land on the account we're switching TO — the PUT is
// session-scoped server-side, so a late timer would corrupt the new account's
// routine) and before a synchronous flush.
function cancelPush(): void {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
}

// Flush this device's routine to the server NOW, bypassing the 800ms debounce.
// AWAITABLE + keepalive so the caller can complete it BEFORE the logout POST
// destroys the session (an un-awaited/late flush would hit the now-invalid
// session and 401, losing a customization made within the push debounce). Called
// first in useLogout, while the cookie is still valid. Best-effort; resolves
// immediately when there's nothing to send.
export async function flushRoutineConfig(): Promise<void> {
  cancelPush();
  const values = collectRoutineValues();
  if (Object.keys(values).length === 0) return;
  const at = getLocalUpdatedAt() || Date.now();
  setLocalUpdatedAt(at);
  try {
    await fetch("/api/me/rule-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, updatedAt: at }),
      credentials: "include",
      keepalive: true,
    });
  } catch { /* best-effort */ }
}

// Reconcile with the server config on login / app-active. Last-write-wins by
// `updatedAt`; an empty/absent server config migrates THIS device's routine up.
export function syncRoutineFromServer(server: RoutineConfig | null | undefined, userId?: number | string | null): void {
  const serverVals = (server && typeof server.values === "object" && server.values) ? server.values : null;
  const serverAt = (server && typeof server.updatedAt === "number") ? server.updatedAt : 0;
  const localAt = getLocalUpdatedAt();

  // ── User-switch guard (fixes routine loss on logout→login) ──────────────────
  // If the routine keys on this device belong to a DIFFERENT user than the one we
  // now hold (owner mismatch), the LWW clock is meaningless: the local keys are
  // from a previous session (a guest, the seeded default, another account). This
  // account's server config is the truth — adopt it. If the account has no saved
  // routine yet, keep the device's current rule as its starting point and push it
  // up. Either way, DON'T let a locally-bumped clock overwrite the account's rule.
  const uid = userId != null ? String(userId) : null;
  let owner: string | null = null;
  try { owner = localStorage.getItem(OWNER_KEY); } catch { /* ignore */ }
  if (uid != null && uid !== owner) {
    // A push queued for the PREVIOUS owner must not land on this account.
    cancelPush();
    try { localStorage.setItem(OWNER_KEY, uid); } catch { /* ignore */ }
    // The account's server config is the truth — adopt it. We do NOT keep a
    // "newer" local routine here even when owner was unset: the local clock can
    // be bumped by a GUEST seed / a leftover session (course completion, weekly
    // toggle, custom anchor — none of which set the owner), and preferring it
    // would push that over the account's real saved routine (the CRITICAL
    // logout→login data-loss bug). Only when the account has NOTHING saved yet do
    // we migrate this device's current routine up as its starting point.
    if (serverVals && Object.keys(serverVals).length > 0) {
      applyRoutineValues(serverVals);
      setLocalUpdatedAt(serverAt);
    } else if (localAt > 0 && Object.keys(collectRoutineValues()).length > 0) {
      // Only migrate a GENUINELY-EDITED device routine up to a fresh account —
      // never an untouched guest seed. seedGuestRule zeroes the sync clock after
      // seeding, so a pure seed has localAt === 0 and is skipped here; a real
      // customization (via the setters) bumps the clock and still migrates.
      // Without this, reinstalling → the psalms guest default → signing into an
      // account whose method lived only in office-prefs (empty rule_config)
      // pushed "psalms" up and clobbered it, so the morning office reminder
      // went out worded for psalms instead of the office.
      pushRoutineConfig();
    }
    return;
  }

  // ── Same user across devices → last-write-wins ──────────────────────────────
  if (!serverVals || Object.keys(serverVals).length === 0) {
    // Server has nothing yet → migrate this device's local routine up.
    if (Object.keys(collectRoutineValues()).length > 0) pushRoutineConfig();
    return;
  }
  if (serverAt > localAt) {
    // Another device customized more recently → adopt its routine.
    applyRoutineValues(serverVals);
    setLocalUpdatedAt(serverAt);
  } else if (localAt > serverAt) {
    // This device edited more recently (e.g. offline) → push it up.
    pushRoutineConfig();
  }
  // Equal → already in sync.
}

// Apply an ADOPTED routine (community rule-of-life adopt, prescribed-routine /
// preset link accept, creator-season join) directly to this device. This is
// NOT a reconciliation — the adopted values ARE the new truth — so it bypasses
// syncRoutineFromServer's LWW entirely: routed through the reconciler, an
// empty ruleConfig hits the "migrate this device up" branch (pushing the OLD
// routine over the server-side adopt), and a local clock stamped ahead by
// another device flips the compare and pushes the old routine up too — either
// way silently reverting the adoption. Here: apply the values, then push (the
// push re-stamps the LWW clock so every other device adopts on next sync).
// Empty/missing values = apply nothing locally (the server-side office prefs
// and home layout from the adopt still stand; device keys stay at defaults).
export function adoptRoutineConfig(values: Record<string, string> | null | undefined): void {
  if (!values || typeof values !== "object" || Object.keys(values).length === 0) return;
  applyRoutineValues(values);
  pushRoutineConfig();
}

// Reset the sync clock on logout so the next user re-syncs from scratch (the
// routine keys themselves are cleared by their own modules / on a fresh login).
export function clearRoutineSyncClock(): void {
  cancelPush();
  try {
    localStorage.removeItem(UPDATED_AT_KEY);
    // Also forget which user the (now-cleared) routine belonged to, so the next
    // login is treated as a switch and adopts that account's server config.
    localStorage.removeItem(OWNER_KEY);
  } catch { /* ignore */ }
}
