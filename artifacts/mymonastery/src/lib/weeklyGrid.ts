// Shared "Past 7 Days" grid computation — the SINGLE source of truth for
// both WayOfLoveTurnLearnPray.tsx (the home card) and widgetSync.ts (the
// iOS Home Screen widget), so the widget can genuinely show "exactly what's
// on the home screen" instead of a separately-maintained approximation that
// drifts. This session already hit that drift bug twice (missing
// PracticeWeekDay fields, then a Contemplative-mode field gap) from logic
// that was written in two places instead of one — extracted here so there's
// only one place left to get it right.
import { getSideLevel } from "@/lib/officePrefs";
import { getCustomAnchors, getCustomDoneDays, anchorOnDay } from "@/lib/customAnchors";
import type { RhythmState } from "@/hooks/useRhythmState";

// Carries every field GET /api/me/practice-week actually returns (see
// api-server/src/routes/users.ts).
export type PracticeWeekDay = {
  ymd: string; morning: boolean; evening: boolean; compline: boolean;
  // A side's SECOND practice, reported separately because the anchor's own
  // flag deliberately excludes it (see countsForAnchor in the route).
  morningExtra?: boolean; eveningExtra?: boolean;
  contemplation: boolean; reflection: boolean; examen: boolean; cobreathe: boolean;
  listening: boolean; reading: boolean; podcasts: boolean; walk: boolean; prayerList: boolean;
  visio?: boolean;
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
  // Weekday-scoped anchors only count toward a day they're actually kept on —
  // otherwise a weekdays-only practice would be asked for on Saturday and leave
  // a dot that could never fill.
  const customAnchorsForGrid = getCustomAnchors();
  const customAnchorIds = customAnchorsForGrid.map((a) => a.id);
  const prayedOnCustom = (ymd: string) => {
    const d = new Date(`${ymd}T12:00:00`);
    return customAnchorsForGrid.some((a) => anchorOnDay(a, d) && getCustomDoneDays(a.id).has(ymd));
  };
  const prayedOn = (d: PracticeWeekDay) =>
    d.morning || d.evening || d.compline || d.contemplation || d.examen || d.cobreathe
    // A day kept ONLY as a side's second practice is still a day you prayed.
    // The anchor's flag excludes it on purpose, so without these a person who
    // prayed their additional practice and nothing else read as having prayed
    // nothing at all.
    || !!d.morningExtra || !!d.eveningExtra
    || d.listening || d.reading || d.podcasts || d.walk || d.prayerList || !!d.visio
    || prayedOnCustom(d.ymd);

  const learnFromReflection = rhythm.reflections.some((r) => r.done);
  const learnFromMorning = rhythm.morningDone && morningIsScripture;
  const learnFromEvening = rhythm.eveningDone && eveningIsScripture;
  const learned = learnFromReflection || learnFromMorning || learnFromEvening;
  const prayed = rhythm.doneCount > 0;

  /**
   * A side whose whole practice IS its contemplation.
   *
   * Reported on the VTS rule: the home said "Creation Prayer — kept today" and
   * the Anchor-practices card agreed, while the Evening row in this very grid
   * showed today's dot hollow. Same screen, two answers.
   *
   * Creation-Prayer-as-the-evening is stored as that SIDE's contemplation with
   * no office level, so `eveningDone` — which reads the office flags — is
   * false all day and the row could never fill. turn-learn-pray.tsx already
   * handles exactly this (see its note on the same rule); this grid was never
   * brought along, and its own contemplativeActive comment claims to mirror
   * that file. Now it does.
   *
   * The row also takes that practice's NAME and emoji, so a rule whose evening
   * is Creation Prayer stops showing a moon.
   */
  const morningIsContemplation = rhythm.morningContemplationActive && !rhythm.morningActive;
  const eveningIsContemplation = rhythm.eveningContemplationActive && !rhythm.eveningActive;
  // PER SIDE — the rule can hold the breath on one side and silence on the
  // other now (owner: "let's separate creation prayer and contemplative
  // prayer"), so a grid that asked one global question for both sides would
  // read the wrong column for one of them.
  const sideKind = (side: "morning" | "evening") =>
    side === "morning" ? rhythm.morningContemplationKind : rhythm.eveningContemplationKind;
  // History for such a side: the practice-week has no per-side contemplation
  // column, so read the flag for the practice it actually is.
  const sideContemplationOn = (side: "morning" | "evening") => (d: PracticeWeekDay) =>
    sideKind(side) === "creation" ? d.cobreathe : d.contemplation;

  /**
   * A PAST day's dot reports what you kept THAT DAY — it never re-judges your
   * history against the rule you keep now.
   *
   * Owner, and this is the invariant: "the weekly practice dots should reflect
   * if you completed what your anchor practice was on that day, NOT
   * retroactively applying your routine to your past activity."
   *
   * The bug that broke it was a switch, not a union: whichever column of a
   * past day's record got consulted was chosen by TODAY's rule. Move your
   * morning to Creation Prayer and every earlier morning — Morning Prayer,
   * kept, recorded — started reading its `cobreathe` flag instead of its
   * `morning` flag, went false, and a week of kept mornings emptied out.
   *
   * So: ANY practice recorded on that side that day fills it. Every term here
   * is something the person actually did, so this can only restore dots that
   * were genuinely earned, never invent one. The row's NAME still follows today's rule
   * (the rows are your rule; the dots are your history) — what it can no
   * longer do is disqualify a day for not matching it.
   *
   * The limit worth knowing: the practice-week has no per-side contemplation
   * column, so a sit can only be attributed to a side when today's rule says
   * that side IS contemplation. A truer fix needs the server to record which
   * anchor was in force on the day.
   */
  const morningPracticeOn = (d: PracticeWeekDay) =>
    d.morning || !!d.morningExtra || (morningIsContemplation && sideContemplationOn("morning")(d));
  const eveningPracticeOn = (d: PracticeWeekDay) =>
    d.evening || !!d.eveningExtra || (eveningIsContemplation && sideContemplationOn("evening")(d));
  /**
   * WHATEVER their contemplative practice is, it counts here.
   *
   * Owner: "if they have something other than timed silence, whatever their
   * practice is, it needs to count on the weekly card." This row used to read
   * only the silent sit and the breath, so someone whose practice is a
   * Contemplative Walk, Audio Divina, the Examen, or one they named themselves
   * had a Contemplative row that could never fill — and, worse, never appeared
   * at all (see contemplativeActive below, which gated on the same two).
   *
   * Custom anchors count ONLY when nothing named is active. Nothing
   * distinguishes a custom anchor made as a contemplative practice from one
   * made for anything else, so folding them in unconditionally would let an
   * unrelated custom practice fill a silence-keeper's contemplative row. This
   * way the person whose ONLY contemplative practice is their own still gets a
   * row that fills, and nobody else's is polluted.
   */
  const namedContemplativeActive = rhythm.silenceActive || rhythm.cobreatheStandaloneActive
    || rhythm.walkActive || rhythm.listeningActive || rhythm.examenActive || rhythm.visioActive;
  const contemplativePracticeOn = (d: PracticeWeekDay) =>
    d.contemplation || d.cobreathe || d.walk || d.listening || d.examen || !!d.visio
    || (!namedContemplativeActive && prayedOnCustom(d.ymd));
  const morningPractice = morningIsContemplation
    ? rhythm.morningContemplationDone
    : (rhythm.morningDone || rhythm.morningExtraDone);
  const eveningPractice = eveningIsContemplation
    ? rhythm.eveningContemplationDone
    : (rhythm.eveningDone || rhythm.eveningExtraDone);
  /**
   * Silence is kept when the DAY'S RULE is met, not when any sit happened.
   *
   * Reported: "I've only done some of the contemplation yet it is fully shaded
   * today" — 8 of 60 minutes, a full dot. The old OR filled the dot on
   * `morningContemplationDone`, which is a per-SIDE flag set by finishing any
   * sit on that side, whatever its length. For someone whose contemplation is a
   * daily minutes quota, one 8-minute sit therefore read as the whole day kept,
   * and the half-shaded state could never appear.
   *
   * rhythm.silenceDone already draws that distinction correctly — a minutes
   * goal is met by MINUTES, per-side cards are met by keeping the sides — so
   * use it rather than a second, looser copy of the same idea.
   */
  const contemplativePractice = rhythm.silenceDone || rhythm.cobreatheDone
    || rhythm.walkDone || rhythm.listeningDone || rhythm.examenDone || rhythm.visioDone
    || (!namedContemplativeActive && customAnchorIds.some((id) => getCustomDoneDays(id).has(todayYmd)));
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
  // …and the row APPEARS for any of them. Gating on silence-or-breath alone is
  // what hid a walker's practice from this card entirely.
  const contemplativeActive = namedContemplativeActive || customAnchorIds.length > 0;
  const newsletterActive = rhythm.reflections.length > 0;
  const middleIsNewsletter = !contemplativeActive && newsletterActive;
  // `d.reflection` is deliberately fdd/ssje/cac only, with Dean's Commentary
  // reported separately as `d.vts` — so a VTS-only reader needs both, or their
  // row would be blank every day while they kept it.
  const newsletterOn = (d: PracticeWeekDay) => d.reflection || d.vts;

  /**
   * No middle row at all when there is nothing to put in it.
   *
   * Owner: "I did a routine where it only had morning and evening prayer, yet
   * the weekly card is still showing three rows — it should collapse to two."
   * An always-present Contemplative row asked someone to account for a
   * practice they never chose, and showed them an empty week for it every
   * single day. Silence wins the slot when they keep it, a newsletter takes it
   * when they don't, and when they keep neither the card is simply two rows.
   */
  const middleRow = middleIsNewsletter
    ? { emoji: "📖", label: "Reflection", done: learnFromReflection, historyFor: newsletterOn }
    : contemplativeActive
      ? { emoji: "🕯️", label: "Contemplative", done: contemplativePractice, historyFor: contemplativePracticeOn, partialToday: contemplativePartialToday, partialFor: contemplativePartialFor }
      : null;

  const raw: Array<{ emoji: string; label: string; done: boolean; historyFor: (d: PracticeWeekDay) => boolean; partialToday?: boolean; partialFor?: (d: PracticeWeekDay) => boolean }> = practiceMode ? [
    { emoji: morningIsContemplation && sideKind("morning") === "creation" ? "🌍" : "🌅", label: "Morning", done: morningPractice, historyFor: morningPracticeOn },
    ...(middleRow ? [middleRow] : []),
    { emoji: eveningIsContemplation && sideKind("evening") === "creation" ? "🌍" : "🌙", label: "Evening", done: eveningPractice, historyFor: eveningPracticeOn },
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
