// Audio Divina log — the metrics behind the "sacred listening" practice (see
// pages/listening.tsx). The practice is logging-first: you listen (streaming or
// an analog medium) and record it. You set a daily GOAL — either time (minutes)
// or songs — and we count toward it. Local-first and offline-safe (small
// localStorage maps, pruned to the last few weeks); a server log + cross-device
// sync can come later. We deliberately keep this tiny rather than reach for the
// contemplation prayer_sessions machinery.

const MIN_KEY = "phoebe:listening-log"; // { "YYYY-MM-DD": minutes }
const SONG_KEY = "phoebe:listening-songs"; // { "YYYY-MM-DD": songs }
const GOAL_KEY = "phoebe:listening-goal"; // { type, amount }
const HISTORY_KEY = "phoebe:listening-history";
const KEEP_DAYS = 45;
export const LISTENING_LOG_EVENT = "phoebe:listening-logged";

export type ListeningMedium = "streaming" | "cd" | "vinyl" | "tape";
export type ListeningGoalType = "time" | "songs";
export type ListeningGoal = { type: ListeningGoalType; amount: number };
// One logged sitting — how you listened, what you put on (streaming: the track
// you picked; analog: your own words), and how much (minutes + songs).
export type ListeningEntry = { ymd: string; minutes: number; songs: number; medium: ListeningMedium; what: string };

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA"); // local day, ISO 2026-06-18
}

function readMap(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, map: Record<string, number>): void {
  // Prune anything older than KEEP_DAYS so the blob can't grow without bound.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cutoffKey = cutoff.toLocaleDateString("en-CA");
  const pruned: Record<string, number> = {};
  for (const [day, n] of Object.entries(map)) {
    if (day >= cutoffKey) pruned[day] = n;
  }
  try {
    localStorage.setItem(key, JSON.stringify(pruned));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

function bump(key: string, n: number): void {
  const v = Math.max(0, Math.round(n));
  if (v === 0) return;
  const map = readMap(key);
  const k = todayKey();
  map[k] = (map[k] ?? 0) + v;
  writeMap(key, map);
}

/** Minutes listened today (local day). */
export function minutesToday(): number {
  return Math.round(readMap(MIN_KEY)[todayKey()] ?? 0);
}
/** Songs listened today (local day). */
export function songsToday(): number {
  return Math.round(readMap(SONG_KEY)[todayKey()] ?? 0);
}
/** Add minutes to today's running total. */
export function addListeningMinutes(minutes: number): void {
  bump(MIN_KEY, minutes);
  try { window.dispatchEvent(new Event(LISTENING_LOG_EVENT)); } catch { /* ignore */ }
}
/** Add songs to today's running total. */
export function addListeningSongs(songs: number): void {
  bump(SONG_KEY, songs);
  try { window.dispatchEvent(new Event(LISTENING_LOG_EVENT)); } catch { /* ignore */ }
}

// ——— Goal: count minutes OR songs toward a daily target ———
const DEFAULT_GOAL: ListeningGoal = { type: "time", amount: 10 };
export function getListeningGoal(): ListeningGoal {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (!raw) return DEFAULT_GOAL;
    const g = JSON.parse(raw);
    const type: ListeningGoalType = g?.type === "songs" ? "songs" : "time";
    const amount = Number(g?.amount);
    return { type, amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : DEFAULT_GOAL.amount };
  } catch {
    return DEFAULT_GOAL;
  }
}
export function setListeningGoal(goal: ListeningGoal): void {
  try { localStorage.setItem(GOAL_KEY, JSON.stringify({ type: goal.type, amount: Math.max(1, Math.round(goal.amount)) })); } catch { /* ignore */ }
}
/** Today's progress toward the active goal (count + target, in the goal's unit). */
export function goalProgress(): { type: ListeningGoalType; count: number; target: number; met: boolean } {
  const g = getListeningGoal();
  const count = g.type === "songs" ? songsToday() : minutesToday();
  return { type: g.type, count, target: g.amount, met: count >= g.amount };
}

// ——— History: a short list of recent sittings ———
export function listeningHistory(): ListeningEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    // Back-compat: older entries may lack `songs`.
    return (arr as ListeningEntry[]).map((e) => ({ ...e, songs: Math.max(0, Math.round(e.songs ?? 0)) }));
  } catch {
    return [];
  }
}

/** Record a logged sitting for the history. */
export function saveListeningEntry(e: { minutes: number; songs: number; medium: ListeningMedium; what: string }): void {
  const entry: ListeningEntry = {
    ymd: todayKey(),
    minutes: Math.max(0, Math.round(e.minutes)),
    songs: Math.max(0, Math.round(e.songs)),
    medium: e.medium,
    what: e.what.trim().slice(0, 200),
  };
  try {
    const hist = listeningHistory();
    hist.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 60)));
  } catch {
    /* private mode / quota — non-fatal */
  }
}
