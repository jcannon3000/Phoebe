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
  // Practice time-of-day slots (customAnchors.ts).
  "phoebe:slot:cobreathe", "phoebe:slot:listening", "phoebe:slot:examen",
  "phoebe:slot:lectio", "phoebe:slot:walk", "phoebe:slot:scripture", "phoebe:slot:reading", "phoebe:journaling-slot",
  // Listen-to-Scripture: which readings to play through.
  "phoebe:scripture-scope",
  // The 30-day commitment's start date (lib/commitment.ts) — synced so
  // "Day N of 30" agrees across the user's devices instead of each device
  // starting its own trial.
  "phoebe:commitment-start",
];

const UPDATED_AT_KEY = "phoebe:routine:updated-at";

function getLocalUpdatedAt(): number {
  try { const n = parseInt(localStorage.getItem(UPDATED_AT_KEY) ?? "0", 10); return Number.isFinite(n) ? n : 0; } catch { return 0; }
}
function setLocalUpdatedAt(t: number): void {
  try { localStorage.setItem(UPDATED_AT_KEY, String(t)); } catch { /* private mode */ }
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

// Reconcile with the server config on login / app-active. Last-write-wins by
// `updatedAt`; an empty/absent server config migrates THIS device's routine up.
export function syncRoutineFromServer(server: RoutineConfig | null | undefined): void {
  const serverVals = (server && typeof server.values === "object" && server.values) ? server.values : null;
  const serverAt = (server && typeof server.updatedAt === "number") ? server.updatedAt : 0;
  const localAt = getLocalUpdatedAt();
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

// Reset the sync clock on logout so the next user re-syncs from scratch (the
// routine keys themselves are cleared by their own modules / on a fresh login).
export function clearRoutineSyncClock(): void {
  try { localStorage.removeItem(UPDATED_AT_KEY); } catch { /* ignore */ }
}
