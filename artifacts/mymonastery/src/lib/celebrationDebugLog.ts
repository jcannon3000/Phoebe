// Temporary diagnostic trail for the "completion animation sometimes plays
// twice" report (owner, repeatedly) — static review of the read-once
// recentCompletion.ts mechanism hasn't turned up the double-fire, so this
// records exactly what happens instead of guessing blind. Owner: "maybe
// build something that logs where the animation has happened yet."
//
// Every DailyProgressBody mount that finds (or doesn't find) a pending
// celebration appends one entry here — which of the three home branches it
// is (mountTag), a random per-instance id (so two mounts firing close
// together are distinguishable even with the same tag), whether a stamp was
// found, its key/age, and whether THIS mount actually set celebrating=true.
// Capped so a long session can't grow it unboundedly. Also mirrored to
// console.info (tag "[celebration]") for live Safari Web Inspector viewing.
//
// Read the trail from Settings → (temporary) or via Safari Web Inspector:
//   JSON.parse(localStorage.getItem("phoebe:celebration-debug-log"))
// Remove this file + its two call sites in DailyProgressBody.tsx once the
// double-fire is caught and fixed — it's diagnostic-only, not a feature.

const KEY = "phoebe:celebration-debug-log";
const MAX_ENTRIES = 40;

export type CelebrationLogEntry = {
  t: number; // Date.now()
  tISO: string; // human-readable, since localStorage is easiest to eyeball as JSON
  instanceId: string;
  mountTag: string;
  stampFound: boolean;
  stampKey: string | null;
  stampAgeMs: number | null;
  celebrating: boolean;
};

export function logCelebrationEvent(entry: Omit<CelebrationLogEntry, "t" | "tISO">): void {
  try {
    const full: CelebrationLogEntry = { ...entry, t: Date.now(), tISO: new Date().toISOString() };
    console.info("[celebration]", full);
    const raw = localStorage.getItem(KEY);
    const list: CelebrationLogEntry[] = raw ? JSON.parse(raw) : [];
    list.push(full);
    while (list.length > MAX_ENTRIES) list.shift();
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* diagnostic-only — never let logging itself break anything */
  }
}

export function readCelebrationLog(): CelebrationLogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
