// Contemplation sessions — an expanded way to set up the silence.
//
// Instead of (or alongside) a single daily-minutes GOAL, a person can practice
// in SESSIONS: one, two, or three fixed sits a day, each with its own length,
// time of day, and TYPE — silent Contemplation or a Cobreathe breath. The
// canonical shape is Thomas Keating's Centering Prayer rhythm: twenty minutes in
// the morning, twenty in the evening.
//
// BETA, client-first: the mode + the session config + per-day per-session
// completion live in localStorage (the customAnchors pattern) — self-contained,
// offline, no schema collision with the parallel session. A future v2 syncs to
// the server and fires a reminder at each session's time of day.

export type SessionType = "contemplation" | "cobreathe";
export type TimeSlot = "morning" | "midday" | "afternoon" | "evening";
export type ContemplationMode = "goal" | "sessions";

export type ContemplationSession = {
  id: string;
  type: SessionType;
  minutes: number;
  slot: TimeSlot;
};

// Time-of-day catalog — label, emoji, sort order, and a default clock time for
// the (future) per-session reminder.
export const TIME_SLOTS: Array<{ slot: TimeSlot; emoji: string; label: string; order: number; time: string }> = [
  { slot: "morning", emoji: "🌅", label: "Morning", order: 0, time: "07:00" },
  { slot: "midday", emoji: "☀️", label: "Midday", order: 1, time: "12:00" },
  { slot: "afternoon", emoji: "🌤️", label: "Afternoon", order: 2, time: "15:00" },
  { slot: "evening", emoji: "🌙", label: "Evening", order: 3, time: "20:00" },
];

export const MIN_SESSION_MIN = 5;
export const MAX_SESSION_MIN = 60;
export const MAX_SESSIONS = 3;
const DEFAULT_MIN = 20; // Keating's twenty minutes

const MODE_KEY = "phoebe:contemplation-mode";
const SESSIONS_KEY = "phoebe:contemplation-sessions";
const DONE_PREFIX = "phoebe:contemplation-session-done:"; // + id + ":" + ymd

export const CONTEMPLATION_SESSIONS_EVENT = "phoebe:contemplation-sessions";
export const CONTEMPLATION_SESSION_DONE_EVENT = "phoebe:contemplation-session-done";

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function slotMeta(slot: TimeSlot) {
  return TIME_SLOTS.find((s) => s.slot === slot) ?? TIME_SLOTS[0];
}

/** "Morning session", "Evening session" … */
export function sessionLabel(slot: TimeSlot): string {
  return `${slotMeta(slot).label} session`;
}

export function getMode(): ContemplationMode {
  try {
    return localStorage.getItem(MODE_KEY) === "sessions" ? "sessions" : "goal";
  } catch {
    return "goal";
  }
}

export function setMode(mode: ContemplationMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
    window.dispatchEvent(new Event(CONTEMPLATION_SESSIONS_EVENT));
  } catch { /* non-fatal */ }
}

function isValidSlot(s: unknown): s is TimeSlot {
  return s === "morning" || s === "midday" || s === "afternoon" || s === "evening";
}
function isValidType(t: unknown): t is SessionType {
  return t === "contemplation" || t === "cobreathe";
}
function clampMinutes(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_MIN;
  return Math.max(MIN_SESSION_MIN, Math.min(MAX_SESSION_MIN, v));
}

export function getSessions(): ContemplationSession[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s) => s && typeof s.id === "string" && isValidSlot(s.slot) && isValidType(s.type))
      .slice(0, MAX_SESSIONS)
      .map((s) => ({ id: s.id, type: s.type, minutes: clampMinutes(s.minutes), slot: s.slot }));
  } catch {
    return [];
  }
}

function saveSessions(list: ContemplationSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(0, MAX_SESSIONS)));
    window.dispatchEvent(new Event(CONTEMPLATION_SESSIONS_EVENT));
  } catch { /* non-fatal */ }
}

function newId(i: number): string {
  return `s${i}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// Sensible defaults for N sessions — the Keating-style spread, all silent
// Contemplation (the user can switch any to Cobreathe). 1 → morning; 2 →
// morning + evening; 3 → morning + midday + evening.
function defaultSlotsFor(count: number): TimeSlot[] {
  if (count <= 1) return ["morning"];
  if (count === 2) return ["morning", "evening"];
  return ["morning", "midday", "evening"];
}

/** Set the number of sessions, preserving existing ones where possible and
 *  filling new ones with the default spread + 20 min silent. */
export function setSessionCount(count: number): ContemplationSession[] {
  const n = Math.max(1, Math.min(MAX_SESSIONS, Math.round(count)));
  const existing = getSessions();
  const slots = defaultSlotsFor(n);
  const next: ContemplationSession[] = [];
  for (let i = 0; i < n; i++) {
    const prev = existing[i];
    next.push(prev
      ? { ...prev, slot: prev.slot }
      : { id: newId(i), type: "contemplation", minutes: DEFAULT_MIN, slot: slots[i] });
  }
  // If we GREW from nothing, apply the default spread so the slots read right.
  if (existing.length === 0) {
    for (let i = 0; i < n; i++) next[i].slot = slots[i];
  }
  saveSessions(next);
  return next;
}

export function updateSession(id: string, patch: Partial<Omit<ContemplationSession, "id">>): void {
  const list = getSessions().map((s) => {
    if (s.id !== id) return s;
    return {
      ...s,
      ...(patch.type !== undefined && isValidType(patch.type) ? { type: patch.type } : {}),
      ...(patch.slot !== undefined && isValidSlot(patch.slot) ? { slot: patch.slot } : {}),
      ...(patch.minutes !== undefined ? { minutes: clampMinutes(patch.minutes) } : {}),
    };
  });
  saveSessions(list);
}

/** Sessions sorted by time of day (morning → evening) with their done state. */
export function getSessionsToday(): Array<ContemplationSession & { done: boolean }> {
  return getSessions()
    .map((s) => ({ ...s, done: isSessionDoneToday(s.id) }))
    .sort((a, b) => slotMeta(a.slot).order - slotMeta(b.slot).order);
}

export function isSessionDoneToday(id: string): boolean {
  try {
    return localStorage.getItem(DONE_PREFIX + id) === todayISO();
  } catch {
    return false;
  }
}

export function toggleSessionDoneToday(id: string): void {
  try {
    const k = DONE_PREFIX + id;
    if (localStorage.getItem(k) === todayISO()) localStorage.removeItem(k);
    else localStorage.setItem(k, todayISO());
    window.dispatchEvent(new Event(CONTEMPLATION_SESSION_DONE_EVENT));
  } catch { /* non-fatal */ }
}

/** Mark a session done for today (idempotent) — used when a sit/breath the
 *  session launched actually completes. */
export function markSessionDoneToday(id: string): void {
  try {
    if (localStorage.getItem(DONE_PREFIX + id) !== todayISO()) {
      localStorage.setItem(DONE_PREFIX + id, todayISO());
      window.dispatchEvent(new Event(CONTEMPLATION_SESSION_DONE_EVENT));
    }
  } catch { /* non-fatal */ }
}
