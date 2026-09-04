// ── "The Power of Daily Prayer", as eight days ───────────────────────────────
//
// Owner: "what if we make it a daily onboarding course for new users, they
// would read one thing at a time over the course of 8 days" — built here as a
// DEMO, admins only, so it can be walked before anyone decides whether it
// really is what a new person meets.
//
// NOT AN INTRO SPLASH. Those were retired in July ("no intro slides on first
// download") and the new-user shell is deliberately quiet. This is a card that
// sits in the rhythm beside the day's prayer, offers one beat, and is gone on
// the ninth day — teaching by being a practice rather than by explaining one,
// which is the argument the sermon itself makes.
//
// A DAY IS A CALENDAR DAY, not a tap. Reading ahead is what turns a rhythm
// into a binge, and the whole point is the return; so day N unlocks on the Nth
// day and not before. The demo switcher (see setDemoDay) is the one exception,
// and it exists so eight days can be reviewed in a sitting.
import { DAILY_PRAYER_SERMON } from "@/lib/sermonDailyPrayer";
import type { ImprintSlide } from "@/components/ImprintSlideshow";

export const COURSE_DAYS: ImprintSlide[] = DAILY_PRAYER_SERMON;
export const COURSE_LENGTH = COURSE_DAYS.length;
export const COURSE_TITLE = "The Power of Daily Prayer";

const START_KEY = "phoebe:dp-course:start";     // YYYY-MM-DD of day 1
const READ_KEY = "phoebe:dp-course:read";       // JSON: day numbers read
const DEMO_KEY = "phoebe:dp-course:demo-day";   // the demo switcher's override

/** Fires when a day is read or the course is reset, so a mounted card re-reads. */
export const COURSE_EVENT = "phoebe:dp-course";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

/** Day 1's date — written the first time anyone asks, so opening the course IS
 *  starting it. */
export function courseStart(): string {
  try {
    const existing = localStorage.getItem(START_KEY);
    if (existing) return existing;
    const today = todayYmd();
    localStorage.setItem(START_KEY, today);
    return today;
  } catch { return todayYmd(); }
}

/** Whether the course has ever been opened. Read-only — unlike courseStart it
 *  never begins one, so a card can ask without starting anything. */
export function courseStarted(): boolean {
  try { return !!localStorage.getItem(START_KEY); } catch { return false; }
}

function daysSince(ymd: string): number {
  const then = new Date(`${ymd}T12:00:00`);
  const now = new Date(`${todayYmd()}T12:00:00`);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86_400_000));
}

/** The furthest day unlocked today (1…8), or the demo override. */
export function currentDay(): number {
  const demo = read<number | null>(DEMO_KEY, null);
  if (demo && demo >= 1 && demo <= COURSE_LENGTH) return demo;
  return Math.min(COURSE_LENGTH, daysSince(courseStart()) + 1);
}

export function readDays(): number[] {
  return read<number[]>(READ_KEY, []).filter((n) => typeof n === "number");
}
export function isDayRead(day: number): boolean {
  return readDays().includes(day);
}
export function markDayRead(day: number): void {
  try {
    const next = [...new Set([...readDays(), day])].sort((a, b) => a - b);
    localStorage.setItem(READ_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(COURSE_EVENT));
  } catch { /* private mode */ }
}
/** Every day read — the card stops appearing. */
export function isCourseFinished(): boolean {
  return readDays().length >= COURSE_LENGTH;
}
/** Today's beat is read (or today's day is past the end). */
export function isTodayRead(): boolean {
  return isDayRead(currentDay());
}

/** DEMO ONLY — jump the course to a day, so all eight can be reviewed in a
 *  sitting. Null clears the override and the calendar takes over again. */
export function setDemoDay(day: number | null): void {
  try {
    if (day == null) localStorage.removeItem(DEMO_KEY);
    else localStorage.setItem(DEMO_KEY, JSON.stringify(day));
    window.dispatchEvent(new Event(COURSE_EVENT));
  } catch { /* private mode */ }
}
export function demoDay(): number | null {
  return read<number | null>(DEMO_KEY, null);
}

/** Back to before day 1 — the demo's own way out. */
export function resetCourse(): void {
  try {
    localStorage.removeItem(START_KEY);
    localStorage.removeItem(READ_KEY);
    localStorage.removeItem(DEMO_KEY);
    window.dispatchEvent(new Event(COURSE_EVENT));
  } catch { /* private mode */ }
}
