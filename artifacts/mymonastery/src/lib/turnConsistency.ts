// Turn — the forgiving consistency spine of the Way of Love.
//
// Turn is metanoia: the daily return, enacted BY doing any other practice. It
// is NOT a practice you "set" or tick — it's KEPT on any day you engaged in a
// tracked practice (an office prayed, a contemplation sit, a reflection read,
// the Examen, a gratitude note, the prayer list, or any weekly practice marked
// done). `practice_completion` is the unified engagement log and the daily
// office also counts, so this module turns that day-set into a gracious,
// CUMULATIVE consistency — never a brittle, loss-anxiety streak.
//
// Grace is a constant: one missed day per rolling week doesn't break the run,
// and we always lead with what's been KEPT ("you've made space N times / kept
// N weeks"), not what could be lost.

export const GRACE_DAYS_PER_WEEK = 1;

function pad(n: number): string { return String(n).padStart(2, "0"); }
function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sundayStart(d: Date): Date { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }

export type EngagementOfficeDay = { ymd: string; morning: boolean; evening: boolean };

// The engagement-day set: any practice_completion row's local date + any day an
// office was prayed. Other app signals credit Turn by logging a completion row
// (see the propagation layer), so they flow in here for free.
export function engagementDays(
  completionDates: readonly string[],
  officeDays: readonly EngagementOfficeDay[],
): Set<string> {
  const s = new Set<string>();
  for (const d of completionDates) if (d) s.add(d);
  for (const o of officeDays) if (o.morning || o.evening) s.add(o.ymd);
  return s;
}

export type TurnConsistency = {
  madeSpaceCount: number; // cumulative — total days space was made (the headline)
  currentRunDays: number; // forgiving run back from today (1 grace day / rolling week)
  weeksKept: number;      // consecutive weeks (back from this week) with ≥1 engaged day
  engagedToday: boolean;
};

export function computeTurnConsistency(engaged: Set<string>, now: Date = new Date()): TurnConsistency {
  const engagedToday = engaged.has(ymd(startOfDay(now)));
  const madeSpaceCount = engaged.size;

  // ── Forgiving day run ──
  // Walk back from today. Today not engaged yet doesn't break the run (the day
  // isn't over). A past unengaged day is forgiven up to GRACE_DAYS_PER_WEEK in
  // any trailing 7-day window; a second miss inside that window ends the run.
  let currentRunDays = 0;
  const graceAt: number[] = [];
  let cur = startOfDay(now);
  for (let i = 0; i < 366; i++) {
    const key = ymd(cur);
    if (engaged.has(key)) {
      currentRunDays++;
    } else if (i === 0) {
      // today, in progress — neither counts nor breaks
    } else {
      const graceInWindow = graceAt.filter((g) => i - g < 7).length;
      if (graceInWindow < GRACE_DAYS_PER_WEEK) graceAt.push(i); // forgiven, run continues
      else break;
    }
    cur = addDays(cur, -1);
  }

  // ── Weeks kept ── consecutive weeks (back from this one) with ≥1 engaged day.
  // The current week, still in progress, never counts against the run.
  let weeksKept = 0;
  let ws = sundayStart(now);
  for (let i = 0; i < 260; i++) {
    let any = false;
    for (let d = 0; d < 7; d++) {
      if (engaged.has(ymd(addDays(ws, d)))) { any = true; break; }
    }
    if (any) weeksKept++;
    else if (i > 0) break; // a past empty week ends the run; the current one is grace
    ws = addDays(ws, -7);
  }

  return { madeSpaceCount, currentRunDays, weeksKept, engagedToday };
}
