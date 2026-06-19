// Listening time-per-day — the simple metric for the audio-divina practice
// (see pages/listening.tsx). For now we just remember how many minutes you've
// listened *today*, accumulated across however many sittings. Local-first and
// offline-safe (one small localStorage map, pruned to the last few weeks); a
// server log + cross-device sync + a daily-rhythm anchor can come later. We
// deliberately keep this tiny rather than reach for the contemplation
// prayer_sessions machinery — "how much time today" is all we need right now.

const STORE_KEY = "phoebe:listening-log"; // { "YYYY-MM-DD": minutes }
const KEEP_DAYS = 30;
export const LISTENING_LOG_EVENT = "phoebe:listening-logged";

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA"); // local day, ISO 2026-06-18
}

function read(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function write(map: Record<string, number>): void {
  // Prune anything older than KEEP_DAYS so the blob can't grow without bound.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cutoffKey = cutoff.toLocaleDateString("en-CA");
  const pruned: Record<string, number> = {};
  for (const [day, mins] of Object.entries(map)) {
    if (day >= cutoffKey) pruned[day] = mins;
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(pruned));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/** Minutes listened today (local day). */
export function minutesToday(): number {
  return Math.round(read()[todayKey()] ?? 0);
}

/** Add a completed sitting's minutes to today's running total. */
export function addListeningMinutes(minutes: number): void {
  const m = Math.max(0, Math.round(minutes));
  if (m === 0) return;
  const map = read();
  const key = todayKey();
  map[key] = (map[key] ?? 0) + m;
  write(map);
  try { window.dispatchEvent(new Event(LISTENING_LOG_EVENT)); } catch { /* ignore */ }
}
