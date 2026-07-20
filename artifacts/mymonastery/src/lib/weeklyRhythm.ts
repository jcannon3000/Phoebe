// The WEEKLY rhythm of Bishop Michael Curry's Way of Love — kept as private
// self-logs (the Audio Divina model).
//
// Phoebe already carries the daily three — Turn (contemplation), Pray (the
// office), Learn (reflection). These are the weekly four: Commune, Go, Bless,
// Rest. You keep them the way you keep Audio Divina: a quiet log, for yourself.
// You note it; the app only helps you stay in the way. No sharing, no streak,
// no "you missed church → you failed" — a rule of life is a gift, not an
// achievement (artifacts/principles-across-surfaces.md).
//
// Commune is our reframe of Curry's "Worship": worship together OR simply
// connect with someone from your faith community this week — what matters is
// that you don't go the week untethered from your people. Rest is different in
// mechanism — you SET the day you'll rest (reusing the phone-sabbath `restDays`)
// and the app helps you keep it.
//
// These ride the generic, strictly-private practice-log table (one entry per
// `kind`); "kept this week" is derived from an entry's `day`. See the server
// allow-list in artifacts/api-server/src/routes/practice-log.ts.

import { pushRoutineConfig } from "./routineSync";

export type WeeklyKind = "commune" | "go" | "bless" | "rest";

export type WeeklyPractice = {
  kind: WeeklyKind;
  label: string;
  /** The log sheet's question — "Did you …?" (tap-to-log, like a custom practice). */
  question: string;
  /** The daily rhythm-card ramp color (R,G,B) for the left bar + pill. */
  rgb: string;
  emoji: string;
  // The quiet one-line invitation shown on the card.
  prompt: string;
  // What the log sheet asks for (the "what" field).
  askLabel: string;
  askPlaceholder: string;
  // Past-tense confirmation once kept this week.
  keptLabel: string;
};

export const WEEKLY_PRACTICES: WeeklyPractice[] = [
  {
    kind: "commune",
    question: "Did you commune this week — worship together, or reach out to someone from your community?",
    rgb: "108,162,124",
    label: "Commune",
    emoji: "🤝🏽",
    prompt: "Worship together, or reach out to someone from your community.",
    askLabel: "Who did you commune with?",
    askPlaceholder: "A name, your parish, a gathering…",
    keptLabel: "Communed this week",
  },
  {
    kind: "go",
    question: "Did you go this week — cross a boundary, serve, listen?",
    rgb: "120,160,120",
    label: "Go",
    emoji: "🚶🏽",
    prompt: "Cross a boundary — go to someone, serve, listen.",
    askLabel: "Where did you go this week?",
    askPlaceholder: "Who you went toward, where you served…",
    keptLabel: "Went this week",
  },
  {
    kind: "bless",
    question: "Did you bless someone this week — with your time, your means, your faith?",
    rgb: "143,170,150",
    label: "Bless",
    emoji: "🎁",
    prompt: "Share something — your time, your means, your faith.",
    askLabel: "How did you bless someone?",
    askPlaceholder: "What you gave, shared, or offered…",
    keptLabel: "Blessed this week",
  },
  {
    kind: "rest",
    question: "Did you keep your rest this week?",
    rgb: "124,116,196",
    label: "Rest",
    emoji: "🌙",
    prompt: "Set the day you'll rest, and keep it.",
    askLabel: "How did you rest?",
    askPlaceholder: "Optional — a word about your sabbath…",
    keptLabel: "Rested this week",
  },
];

// MONDAY on-or-before today, local time, YYYY-MM-DD. The weekly practices run
// Monday → Sunday and reset each Monday (owner). NOTE: this is deliberately a
// DIFFERENT boundary from the daily rhythm's Sunday-based week
// (lib/practiceCompletion.ts weekStartLocalISO), which must stay Sunday to match
// the server's prayed-with week — only the Way of Love weekly band uses this.
export function weekStartISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun..6=Sat. Days since the most recent Monday: Mon→0 … Sun→6.
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d.toLocaleDateString("en-CA");
}

// Today as the caller's LOCAL day (YYYY-MM-DD) — what we stamp a log with.
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

export type PracticeLogEntry = {
  id: number;
  day: string; // YYYY-MM-DD (local day it was logged for)
  what: string | null;
  notes: string | null;
  createdAt: string;
};

// A weekly practice counts as kept if it has any entry dated within the current
// week (Monday → today). `day` is a zero-padded ISO date, so a lexical compare
// works. Entries arrive newest-first, so the first match is the most recent.
// The upper bound (<= today) guards against a future-dated entry — clock skew
// or a direct API write — falsely marking the week kept.
export function keptThisWeek(entries: PracticeLogEntry[] | undefined): PracticeLogEntry | null {
  if (!entries || entries.length === 0) return null;
  const start = weekStartISO();
  const today = todayISO();
  for (const e of entries) {
    if (typeof e.day === "string" && e.day >= start && e.day <= today) return e;
  }
  return null;
}

// ── The rest WINDOW — "an event to rest" ──────────────────────────────
// Optional: alongside the day you'll rest (users.restDays), you can set a
// TIME WINDOW for it — e.g. Saturday 2:00–6:00 PM — so rest is held like an
// appointment, not an afterthought. Stored as a routine key (ROUTINE_KEYS in
// lib/routineSync), so it syncs across devices and rides community rules /
// preset links: a rule of life can carry its rest window.
const REST_WINDOW_KEY = "phoebe:rest-window";
export type RestWindow = { start: string; end: string }; // "HH:MM" 24h

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function getRestWindow(): RestWindow | null {
  try {
    const raw = localStorage.getItem(REST_WINDOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestWindow;
    if (parsed && HHMM_RE.test(parsed.start ?? "") && HHMM_RE.test(parsed.end ?? "")) return parsed;
  } catch { /* ignore */ }
  return null;
}

export function setRestWindow(w: RestWindow | null): void {
  try {
    if (w && HHMM_RE.test(w.start) && HHMM_RE.test(w.end)) {
      localStorage.setItem(REST_WINDOW_KEY, JSON.stringify({ start: w.start, end: w.end }));
    } else {
      localStorage.removeItem(REST_WINDOW_KEY);
    }
    window.dispatchEvent(new Event(WEEKLY_ENABLED_EVENT));
  } catch { /* private mode */ }
}

// "14:00" → "2:00 PM" (the card + sheet display format).
export function formatHHMM(hhmm: string): string {
  const [hStr, m] = hhmm.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}
/** "HH:MM" + n hours → "HH:MM" (wraps past midnight). */
export function addHours(start: string, hours: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = ((h ?? 0) * 60 + (m ?? 0) + hours * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** A window's length in whole hours (rounded; wraps past midnight). */
export function windowHours(win: RestWindow): number {
  const [sh, sm] = win.start.split(":").map(Number);
  const [eh, em] = win.end.split(":").map(Number);
  let mins = ((eh ?? 0) * 60 + (em ?? 0)) - ((sh ?? 0) * 60 + (sm ?? 0));
  if (mins <= 0) mins += 24 * 60;
  return Math.max(1, Math.round(mins / 60));
}

export function formatWindow(w: RestWindow): string {
  return `${formatHHMM(w.start)}–${formatHHMM(w.end)}`;
}

// ── Which weekly practices are turned on ──────────────────────────────
// Opt-in, like the daily extras: a practice only appears in the "This week"
// band once the user enables it in the customizer. Stored on its own
// localStorage key — DELIBERATELY independent of the home-layout / office-prefs
// the customizer's commit() writes, so toggling weekly practices can never
// disturb (or be disturbed by) that data-loss-prone path.
const ENABLED_KEY = "phoebe:weekly-practices";
export const WEEKLY_ENABLED_EVENT = "phoebe:weekly-practices-changed";
const ALL_KINDS: WeeklyKind[] = WEEKLY_PRACTICES.map((p) => p.kind);

// GLOBAL KILL SWITCH — weekly practices (the home "This week" band: Commune ·
// Go · Bless · Rest) are turned OFF for everyone for now (owner). Flip to true
// to bring them back: each user's saved enabled set is left untouched in
// localStorage, so it returns exactly as they had it. While false,
// getEnabledWeekly() reports nothing enabled — which hides the band everywhere
// (WeeklyRhythm, BetaRhythmExtras) since they all derive from it — and the
// enable UI (settings toggle + customizer "weekly" step) is hidden too.
export const WEEKLY_PRACTICES_ENABLED = false;

export function getEnabledWeekly(): WeeklyKind[] {
  if (!WEEKLY_PRACTICES_ENABLED) return [];
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return ALL_KINDS.filter((k) => parsed.includes(k));
  } catch {
    return [];
  }
}

export function setEnabledWeekly(kinds: WeeklyKind[]): void {
  const clean = ALL_KINDS.filter((k) => kinds.includes(k));
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(clean));
    window.dispatchEvent(new Event(WEEKLY_ENABLED_EVENT));
    // The enabled set is a ROUTINE_KEY, so push it to the account now — otherwise
    // toggling weekly practices on/off wouldn't reach the user's other devices
    // until some unrelated routine change happened to flush.
    void pushRoutineConfig();
  } catch {
    /* private mode / quota — non-fatal */
  }
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The user's set sabbath weekday (the first restDay), or null. We keep Rest's
// "when" in the existing phone-sabbath `restDays` so the two stay in sync.
export function primarySabbathDay(restDays: number[] | undefined): number | null {
  if (!Array.isArray(restDays) || restDays.length === 0) return null;
  const d = restDays.find((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return d === undefined ? null : d;
}
