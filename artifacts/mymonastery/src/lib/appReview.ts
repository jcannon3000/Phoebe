import { isNativeShell } from "@/lib/isNativeShell";

// ── Asking to be rated, once ─────────────────────────────────────────────────
//
// Owner, 2026-09-30: "Could we do the pop up once for people do rate the app 5
// stars on ios?"
//
// THE ONCE IS OURS. The FIVE STARS ISN'T, and can't be: App Review forbids
// asking for a particular rating, and iOS's prompt is drawn by iOS — we can't
// word it, style it, or learn what the person did. So this file decides only
// WHEN to hand the request over, and never hands it over twice.
//
// WHEN. Not on launch, and not mid-practice. A prompt over the closing slide of
// an office is exactly the interruption that earns one star, and a prompt on
// the first open asks someone who has no opinion yet. So:
//
//   · three separate DAYS on which something was kept — a person who has come
//     back twice has an actual view of the app, and nobody is asked on the day
//     they installed it;
//   · then the ask waits for the NEXT quiet opening and rides the splash's own
//     "done" event, so it lands on the home with nothing in progress behind it.
//
// iOS then applies its own limits on top: at most three prompts a year per
// person, and none at all in a TestFlight build. A build that shows nothing is
// therefore normal — see PhoebeReviewPlugin.swift.

/** Set the moment we hand the request to iOS. Nothing clears it. */
const ASKED_KEY = "phoebe:app-review-asked";
/** The local days something was kept on, oldest first, capped at DAYS_NEEDED. */
const DAYS_KEY = "phoebe:app-review-days";
/** Set when the threshold is met; read and cleared by the next opening. */
const PENDING_KEY = "phoebe:app-review-pending";

const DAYS_NEEDED = 3;
/** A beat after the splash, so the ask follows the home rather than racing it. */
const ASK_DELAY_MS = 2500;

function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode / quota */ }
}

function alreadyAsked(): boolean {
  return read(ASKED_KEY) !== null;
}

function keptDays(): string[] {
  const raw = read(DAYS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

/**
 * A practice was just freshly kept. Called from lib/recentCompletion's
 * markRecentCompletion — the one funnel every completion already goes through
 * (offices, contemplation, reflections, custom anchors, optional practices), so
 * this counts the same moments the home's completion animation does rather than
 * a second, drifting definition of "kept".
 *
 * Counts DAYS, not completions: three practices in one morning is one day's
 * worth of opinion about the app.
 */
export function noteKeptPractice(): void {
  if (!isNativeShell() || alreadyAsked()) return;
  const today = todayLocalISO();
  const days = keptDays();
  if (days.includes(today)) return;
  const next = [...days, today].slice(-DAYS_NEEDED);
  write(DAYS_KEY, JSON.stringify(next));
  // The threshold is met by a day that has just BEGUN, so the ask waits for the
  // next opening rather than interrupting whatever was just finished.
  if (next.length >= DAYS_NEEDED) write(PENDING_KEY, today);
}

/**
 * Arm the ask for this session. Called once from main.tsx.
 *
 * Hung on `phoebe:splash-done` rather than a timer from boot: that event fires
 * when the splash has faded and the home is showing, which is the quiet moment
 * this wants and the one place that knows it has arrived. A launch with no
 * splash (a brand-new device, a remount) simply never fires it, and the ask
 * waits for an opening that does — there is no hurry.
 */
export function initAppReview(): void {
  if (!isNativeShell()) return;
  const ask = () => {
    // Re-read rather than close over: minutes may have passed, and another tab
    // or an earlier listener in this same session may have asked already.
    if (alreadyAsked() || read(PENDING_KEY) === null) return;
    // Stamped BEFORE the call, not after. If this throws, or the app is killed
    // mid-prompt, "asked" is still true — once means once, and the cost of
    // never asking someone is nothing next to asking them twice.
    write(ASKED_KEY, new Date().toISOString());
    try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    const native = (window as {
      PhoebeNative?: { requestAppReview?: () => Promise<boolean> };
    }).PhoebeNative;
    void native?.requestAppReview?.();
  };
  window.addEventListener("phoebe:splash-done", () => {
    window.setTimeout(ask, ASK_DELAY_MS);
  }, { once: true });
}
