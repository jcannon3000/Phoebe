// Shared "Past 7 Days" grid computation — the SINGLE source of truth for
// both WayOfLoveTurnLearnPray.tsx (the home card) and widgetSync.ts (the
// iOS Home Screen widget), so the widget can genuinely show "exactly what's
// on the home screen" instead of a separately-maintained approximation that
// drifts. This session already hit that drift bug twice (missing
// PracticeWeekDay fields, then a Contemplative-mode field gap) from logic
// that was written in two places instead of one — extracted here so there's
// only one place left to get it right.
import { getSideLevel } from "@/lib/officePrefs";
import { getCustomAnchors, getCustomDoneDays } from "@/lib/customAnchors";
import type { RhythmState } from "@/hooks/useRhythmState";

// Carries every field GET /api/me/practice-week actually returns (see
// api-server/src/routes/users.ts).
export type PracticeWeekDay = {
  ymd: string; morning: boolean; evening: boolean; compline: boolean;
  contemplation: boolean; reflection: boolean; examen: boolean; cobreathe: boolean;
  listening: boolean; reading: boolean; podcasts: boolean; walk: boolean; prayerList: boolean;
  // Not folded into `reflection` (which is deliberately fdd/ssje/cac only)
  // so Dean's Commentary can be reported on specifically.
  vts: boolean;
  // "Started but short of the goal" — the weekly grid's half-shaded
  // Contemplative dot, computed server-side against the CURRENT goal for
  // past days too (not just today). Owner: "it was half shaded, but now
  // that it's in the past its full colored, it needs to be half colored."
  contemplationPartial: boolean;
};

// Which office levels actually carry a real lectionary lesson — Praying the
// Psalms doesn't, and neither do Contemplation, the Examen, Simple Guided
// Prayer (PACT), or a custom practice.
export const SCRIPTURE_LEVELS = new Set(["office", "devotion", "fdd", "readings"]);

export function readTurnedOn(ymd: string): boolean {
  try { return localStorage.getItem(`phoebe:turn-opened:${ymd}`) === "1"; } catch { return false; }
}

// `partial` marks a dot as "started but not yet met the day's quota" —
// owner: "if someone is partly done with their contemplation quota, have
// the weekly dot half shaded in." Only ever true for TODAY's column (past
// days are recorded as a plain done/not-done boolean server-side, with no
// minutes-vs-goal history to reconstruct a partial state from) and only on
// the Contemplative row, the one row backed by an actual minutes quota.
export type WeeklyGridRow = { emoji: string; label: string; kept: boolean[]; partial: boolean[] };
export type WeeklyGridData = { rows: WeeklyGridRow[]; dayInitials: string[]; ymds: string[] };

/** Oldest first, today last — matches the server's own chronological order
 *  and reads left-to-right like a calendar week, ending on today. Built
 *  client-side so there are always 7 columns to draw, never blank while
 *  the practice-week fetch is in flight. */
function computeWindowDays(week: { days: PracticeWeekDay[] } | undefined): PracticeWeekDay[] {
  const serverByYmd = new Map((week?.days ?? []).map((d) => [d.ymd, d]));
  const EMPTY_DAY: PracticeWeekDay = {
    ymd: "", morning: false, evening: false, compline: false, contemplation: false,
    reflection: false, examen: false, cobreathe: false,
    listening: false, reading: false, podcasts: false, walk: false, prayerList: false,
    vts: false, contemplationPartial: false,
  };
  return Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i;
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const ymd = d.toLocaleDateString("en-CA");
    return serverByYmd.get(ymd) ?? { ...EMPTY_DAY, ymd };
  });
}

/** Computes the exact same 3-row x 7-day grid the home card renders —
 *  respects the Turn/Learn/Pray vs Morning/Contemplative/Evening Settings
 *  toggle, and resolves TODAY's column from the live rhythm state (not the
 *  practice-week snapshot, which can lag a few seconds behind a
 *  just-finished practice) exactly like the card does. */
export function computeWeeklyGrid(params: {
  rhythm: RhythmState;
  week: { days: PracticeWeekDay[] } | undefined;
  practiceMode: boolean;
  turned: boolean;
}): WeeklyGridData {
  const { rhythm, week, practiceMode, turned } = params;
  const windowDays = computeWindowDays(week);
  const todayYmd = new Date().toLocaleDateString("en-CA");
  const dayInitials = windowDays.map((d) => {
    const wd = new Date(`${d.ymd}T12:00:00`).getDay();
    return Number.isNaN(wd) ? "" : ["S", "M", "T", "W", "T", "F", "S"][wd];
  });

  const morningIsScripture = SCRIPTURE_LEVELS.has(getSideLevel("morning") ?? "");
  const eveningIsScripture = SCRIPTURE_LEVELS.has(getSideLevel("evening") ?? "");
  const learnedOn = (d: PracticeWeekDay) => d.reflection || (morningIsScripture && d.morning) || (eveningIsScripture && d.evening);
  const customAnchorIds = getCustomAnchors().map((a) => a.id);
  const prayedOnCustom = (ymd: string) => customAnchorIds.some((id) => getCustomDoneDays(id).has(ymd));
  const prayedOn = (d: PracticeWeekDay) =>
    d.morning || d.evening || d.compline || d.contemplation || d.examen || d.cobreathe
    || d.listening || d.reading || d.podcasts || d.walk || d.prayerList
    || prayedOnCustom(d.ymd);

  const learnFromReflection = rhythm.reflections.some((r) => r.done);
  const learnFromMorning = rhythm.morningDone && morningIsScripture;
  const learnFromEvening = rhythm.eveningDone && eveningIsScripture;
  const learned = learnFromReflection || learnFromMorning || learnFromEvening;
  const prayed = rhythm.doneCount > 0;

  const morningPracticeOn = (d: PracticeWeekDay) => d.morning;
  const eveningPracticeOn = (d: PracticeWeekDay) => d.evening;
  const contemplativePracticeOn = (d: PracticeWeekDay) => d.contemplation || d.cobreathe;
  const morningPractice = rhythm.morningDone;
  const eveningPractice = rhythm.eveningDone;
  const contemplativePractice = rhythm.morningContemplationDone || rhythm.eveningContemplationDone
    || rhythm.silenceGoalCardDone || rhythm.cobreatheDone;
  // Today — some minutes logged, but short of the daily goal, read from the
  // LIVE rhythm state (more current than the practice-week snapshot, which
  // can lag a just-finished sit by a few seconds). Never true once
  // contemplativePractice itself is true (that's the full dot, not the
  // half one). Owner: "if someone is partly done with their contemplation
  // quota, have the weekly dot half shaded in."
  const contemplativePartialToday = !contemplativePractice
    && rhythm.contemplationGoalMin > 0
    && rhythm.contemplationMin > 0
    && rhythm.contemplationMin < rhythm.contemplationGoalMin;
  // Past days — the server already judges contemplationPartial against the
  // CURRENT goal (see /me/practice-week), so a day that was short of the
  // goal keeps reading as half-shaded once it rolls out of "today" instead
  // of silently flipping to fully kept. Owner: "it was half shaded, but now
  // that it's in the past its full colored, it needs to be half colored."
  const contemplativePartialFor = (d: PracticeWeekDay) => d.contemplationPartial;

  /**
   * The MIDDLE row follows what the person actually keeps.
   *
   * Owner: "if someone has a newsletter but not a contemplation practice,
   * let's make that the middle role of the widget, both on the home screen and
   * also the widget."
   *
   * The middle slot is the day's centre — between rising and resting — and for
   * a reader whose centre is the day's reflection, a permanently empty
   * Contemplative row was a standing reproach for a practice they never chose,
   * while the thing they DO keep went uncounted. Silence still wins the slot
   * whenever it's part of the rhythm; the newsletter only takes it when the
   * slot would otherwise sit empty.
   *
   * Both surfaces get this for free — the home card and the iOS widget both
   * render from this function, which is the whole reason it exists.
   */
  const contemplativeActive = rhythm.silenceActive || rhythm.cobreatheStandaloneActive;
  const newsletterActive = rhythm.reflections.length > 0;
  const middleIsNewsletter = !contemplativeActive && newsletterActive;
  // `d.reflection` is deliberately fdd/ssje/cac only, with Dean's Commentary
  // reported separately as `d.vts` — so a VTS-only reader needs both, or their
  // row would be blank every day while they kept it.
  const newsletterOn = (d: PracticeWeekDay) => d.reflection || d.vts;

  const middleRow = middleIsNewsletter
    ? { emoji: "📖", label: "Reflection", done: learnFromReflection, historyFor: newsletterOn }
    : { emoji: "🕯️", label: "Contemplative", done: contemplativePractice, historyFor: contemplativePracticeOn, partialToday: contemplativePartialToday, partialFor: contemplativePartialFor };

  const raw: Array<{ emoji: string; label: string; done: boolean; historyFor: (d: PracticeWeekDay) => boolean; partialToday?: boolean; partialFor?: (d: PracticeWeekDay) => boolean }> = practiceMode ? [
    { emoji: "🌅", label: "Morning", done: morningPractice, historyFor: morningPracticeOn },
    middleRow,
    { emoji: "🌙", label: "Evening", done: eveningPractice, historyFor: eveningPracticeOn },
  ] : [
    { emoji: "🔄", label: "Turn", done: turned, historyFor: (d) => readTurnedOn(d.ymd) },
    { emoji: "📖", label: "Learn", done: learned, historyFor: learnedOn },
    { emoji: "🙏🏽", label: "Pray", done: prayed, historyFor: prayedOn },
  ];

  const lastIndex = windowDays.length - 1;
  const rows: WeeklyGridRow[] = raw.map((r) => ({
    emoji: r.emoji,
    label: r.label,
    kept: windowDays.map((d) => (d.ymd === todayYmd ? r.done : r.historyFor(d))),
    partial: windowDays.map((d, i) =>
      d.ymd === todayYmd ? (i === lastIndex && !!r.partialToday) : !!r.partialFor?.(d),
    ),
  }));

  return { rows, dayInitials, ymds: windowDays.map((d) => d.ymd) };
}
