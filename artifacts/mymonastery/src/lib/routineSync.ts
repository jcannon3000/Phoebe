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
const ROUTINE_KEYS: string[] = [
  // Per-side office method + entry + reflection (officePrefs.ts).
  "phoebe:office:level:morning", "phoebe:office:level:evening",
  "phoebe:office:entry:morning", "phoebe:office:entry:evening",
  "phoebe:office:reflection:morning", "phoebe:office:reflection:evening",
  // Prayer List + BCP merge (community intercessions prayed within the office).
  "phoebe:office:community-within:morning", "phoebe:office:community-within:evening",
  // Per-side Contemplative Prayer (drives the Morning/Evening Contemplation cards).
  "phoebe:office:contemplation:morning", "phoebe:office:contemplation:evening",
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
  "phoebe:fdd-mode", "phoebe:psalm-cycle", "phoebe:contemplation-style",
  // Creation Prayer breath-count preset (customizer "How many breaths?" +
  // the /cobreathe Length dropdown share this key).
  "phoebe:cobreathe-length",
  // Practice time-of-day slots (customAnchors.ts).
  "phoebe:slot:cobreathe", "phoebe:slot:listening", "phoebe:slot:examen",
  "phoebe:slot:lectio", "phoebe:slot:walk", "phoebe:slot:scripture", "phoebe:slot:reading", "phoebe:journaling-slot",
  // Listen-to-Scripture: which readings to play through.
  "phoebe:scripture-scope",
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

// Mirror an authoritative server config into localStorage: set the keys it
// carries, and clear routine keys it OMITS (those are at their default on the
// source device). Only ever called with a NON-EMPTY, newer config, so a partial
// / empty config can't wipe a device. Fires ROUTINE_SYNCED_EVENT so the UI
// re-reads (getSideLevel / getPracticeSlot read straight from localStorage).
function applyRoutineValues(values: Record<string, string>): void {
  let changed = false;
  try {
    for (const k of ROUTINE_KEYS) {
      const v = values[k];
      const cur = localStorage.getItem(k);
      if (typeof v === "string") {
        if (cur !== v) { localStorage.setItem(k, v); changed = true; }
      } else if (cur != null) {
        localStorage.removeItem(k); changed = true;
      }
    }
  } catch { /* private mode */ }
  if (changed) { try { window.dispatchEvent(new Event(ROUTINE_SYNCED_EVENT)); } catch { /* ignore */ } }
}

// Debounced push of this device's routine to the server (bumps the LWW clock).
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function pushRoutineConfig(): void {
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

// Synchronously flush this device's routine to the server, bypassing the 800ms
// debounce, and survive a navigation/unload (keepalive). Called on logout BEFORE
// the device rule is wiped: a customization made within 800ms of logging out
// would otherwise have its debounced push cancelled by the page teardown, so the
// server rule_config would never receive it and the SAME user re-logging-in would
// find the method blank. Best-effort; no-op if nothing to send.
export function flushRoutineConfig(): void {
  cancelPush();
  const values = collectRoutineValues();
  if (Object.keys(values).length === 0) return;
  const at = getLocalUpdatedAt() || Date.now();
  setLocalUpdatedAt(at);
  try {
    void fetch("/api/me/rule-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, updatedAt: at }),
      credentials: "include",
      keepalive: true,
    }).catch(() => { /* best-effort */ });
  } catch { /* ignore */ }
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
    const localHasVals = Object.keys(collectRoutineValues()).length > 0;
    // Normally the account's server config is the truth and we adopt it. The one
    // exception: a device whose owner was UNSET (pre-owner-guard build, or a
    // fresh device that edited offline) may hold a routine NEWER than the server
    // — blind-adopting would silently drop that edit. So when the local edit is
    // strictly newer AND non-empty, keep it and push it up instead.
    if (owner == null && localHasVals && localAt > serverAt) {
      pushRoutineConfig();
    } else if (serverVals && Object.keys(serverVals).length > 0) {
      applyRoutineValues(serverVals);
      setLocalUpdatedAt(serverAt);
    } else if (localHasVals) {
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
