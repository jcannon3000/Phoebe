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

export type WeeklyKind = "commune" | "go" | "bless" | "rest";

export type WeeklyPractice = {
  kind: WeeklyKind;
  label: string;
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
    label: "Commune",
    emoji: "🤝",
    prompt: "Worship together, or reach out to someone from your community.",
    askLabel: "Who did you commune with?",
    askPlaceholder: "A name, your parish, a gathering…",
    keptLabel: "Communed this week",
  },
  {
    kind: "go",
    label: "Go",
    emoji: "🚶",
    prompt: "Cross a boundary — go to someone, serve, listen.",
    askLabel: "Where did you go this week?",
    askPlaceholder: "Who you went toward, where you served…",
    keptLabel: "Went this week",
  },
  {
    kind: "bless",
    label: "Bless",
    emoji: "🎁",
    prompt: "Share something — your time, your means, your faith.",
    askLabel: "How did you bless someone?",
    askPlaceholder: "What you gave, shared, or offered…",
    keptLabel: "Blessed this week",
  },
  {
    kind: "rest",
    label: "Rest",
    emoji: "🌙",
    prompt: "Set the day you'll rest, and keep it.",
    askLabel: "How did you rest?",
    askPlaceholder: "Optional — a word about your sabbath…",
    keptLabel: "Rested this week",
  },
];

// Sunday on-or-before today, local time, YYYY-MM-DD — the same week boundary
// the daily rhythm uses (lib/practiceCompletion.ts weekStartLocalISO).
export function weekStartISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // 0 = Sunday
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
// week (Sunday → today). `day` is a zero-padded ISO date, so a lexical compare
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

// ── Which weekly practices are turned on ──────────────────────────────
// Opt-in, like the daily extras: a practice only appears in the "This week"
// band once the user enables it in the customizer. Stored on its own
// localStorage key — DELIBERATELY independent of the home-layout / office-prefs
// the customizer's commit() writes, so toggling weekly practices can never
// disturb (or be disturbed by) that data-loss-prone path.
const ENABLED_KEY = "phoebe:weekly-practices";
export const WEEKLY_ENABLED_EVENT = "phoebe:weekly-practices-changed";
const ALL_KINDS: WeeklyKind[] = WEEKLY_PRACTICES.map((p) => p.kind);

export function getEnabledWeekly(): WeeklyKind[] {
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
