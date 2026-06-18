import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  hasReadCacToday, hasReadFddToday, hasReadSsjeToday,
  CAC_READ_EVENT, FDD_READ_EVENT, SSJE_READ_EVENT,
} from "@/lib/cacReadState";
import { hasPracticeDoneToday, PRACTICE_DONE_EVENT } from "@/lib/practiceCompletion";
import { getCustomAnchors, isCustomDoneToday, isCustomSkippedToday, CUSTOM_ANCHORS_EVENT, CUSTOM_DONE_EVENT, type CustomSlot } from "@/lib/customAnchors";
import { OFFICE_DONE_EVENT } from "@/lib/officeManualLog";
import { getSideLevel, useEffectiveReflectionSource } from "@/lib/officePrefs";
import { useDailySteps } from "@/lib/appleHealth";
import { useAuth } from "@/hooks/useAuth";

// How the user has chosen to pray the daily office — drives whether the
// Morning/Evening anchor reads "Prayer", "Devotion", or "Pray together".
export type PrayerKind = "office" | "devotion" | "community";

// ── useRhythmState ───────────────────────────────────────────────────────────
//
// The shared source of truth for "today's rhythm": the four daily anchors
// (Morning · Reflect · Silence · Evening) and the streak / garden counts.
// Extracted from the TodaysRhythm card so three surfaces can agree without
// duplicating the logic:
//   • TodaysRhythm (the full card — home was, now the closing slide + page)
//   • the header "Daily progress" pill (renders four dots from the done flags)
//   • the /daily-progress page
// Every queryKey matches what the dashboard / contemplation page already
// fetch, so React Query dedupes — calling this hook in several places adds no
// network. Reflection state is localStorage-only and live-updates off the
// read events the reflection cards fire.

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Did the user finish an office on a given side today, per the localStorage
// flags the office viewer writes synchronously (before the server query lands)?
function officeLocalDone(sides: string[]): boolean {
  const day = localDay();
  try {
    return sides.some((s) => localStorage.getItem(`phoebe:office-completed:${s}:${day}`) !== null);
  } catch {
    return false;
  }
}

export type RhythmState = {
  /** Have the done-state queries settled? Consumers fade in their first paint
   *  on this so the Next/Done split doesn't visibly reshuffle as data lands. */
  ready: boolean;
  morningDone: boolean;
  reflectDone: boolean;
  silenceDone: boolean;
  eveningDone: boolean;
  /** Whether the evening office is part of the rhythm (evening pref != "none").
   *  Off by default, so an un-set-up user's rhythm is 3 anchors, not 4. */
  eveningActive: boolean;
  /** Whether each core anchor is part of the rhythm: morning prayer (morning
   *  pref != "none"), contemplation (a goal is set), reflection (a source is
   *  chosen). A user who turns one off drops its card + dot + weekly row. */
  morningActive: boolean;
  silenceActive: boolean;
  reflectActive: boolean;
  /** Optional practices the user added from the Customize flow (visible on the
   *  home layout) — each adds a checkmark to Daily progress. */
  gratitudeActive: boolean;
  examenActive: boolean;
  stepsActive: boolean;
  gratitudeDone: boolean;
  examenDone: boolean;
  stepsDone: boolean;
  /** Today's step count + the daily goal (0 = no goal) — for the Daily steps
   *  anchor's progress bar. */
  stepsToday: number;
  stepsGoal: number;
  /** User-defined custom practices (title + emoji + a per-day check) — each an
   *  extra anchor: shows as a Daily-progress card and counts as a dot. */
  customAnchors: Array<{ id: string; title: string; emoji: string; slot: CustomSlot; done: boolean; skipped: boolean }>;
  /** How many anchors exist for this user — the four core ones plus any
   *  active optional practices (gratitude / examen). The denominator of the
   *  "N of X kept" header. */
  totalAnchors: number;
  /** How many anchors are kept today (out of totalAnchors). */
  doneCount: number;
  streak: number;
  last7: number;
  keptToday: boolean;
  gardenCount: number;
  cobreatheCount: number;
  /** Office / Devotion / community — so the Morning & Evening labels match
   *  what the user actually prays (their Customize-home / Rule of Life pick). */
  prayerKind: PrayerKind;
  /** Today's contemplation minutes and the daily goal (0 = no goal) — for the
   *  Contemplation card's goal progress. */
  contemplationMin: number;
  contemplationGoalMin: number;
};

// Keep in sync with dashboard.tsx — only a current-version saved layout is
// honored on the home screen, so the rhythm must use the same gate or it
// would show an anchor the home doesn't render.
const HOME_LAYOUT_VERSION = 2;

// Is an optional-practice card surfaced on the user's home layout? A card
// counts as active when the layout is the current version AND the key is in
// the saved order and NOT hidden — the same rule the dashboard applies. Cards
// absent from the order are opt-in-hidden, so a user who never added
// gratitude/examen has no extra anchor.
function homeCardActive(
  homeLayout: { order?: string[]; hidden?: string[]; v?: number } | null | undefined,
  key: string,
): boolean {
  if (!homeLayout || homeLayout.v !== HOME_LAYOUT_VERSION) return false;
  const order = homeLayout.order ?? [];
  const hidden = new Set(homeLayout.hidden ?? []);
  return order.includes(key) && !hidden.has(key);
}

export function useRhythmState(): RhythmState {
  const day = localDay();
  const { user } = useAuth();

  // Reflection read-state. localStorage is per-device and flips instantly, but
  // doesn't sync across devices (read CAC on mobile → web wouldn't know). CAC
  // reads are also logged server-side, so we OR in a server check below; the
  // local flags keep the anchor responsive on the device that did the reading.
  const [reflectLocal, setReflectLocal] = useState(
    () => hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday(),
  );
  useEffect(() => {
    const recheck = () => setReflectLocal(hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday());
    // The reflection is read on a separate surface (often the in-app browser),
    // which stamps localStorage + fires a read-event. We re-check on those
    // events, but iOS WebViews don't fire `visibilitychange` reliably when the
    // in-app browser is dismissed — so the anchor "sometimes" didn't flip on
    // return. Listen on the broader set of return-to-app signals (focus,
    // pageshow, the native resume event) plus the storage event so the check
    // is robust however the read landed.
    window.addEventListener(CAC_READ_EVENT, recheck);
    window.addEventListener(FDD_READ_EVENT, recheck);
    window.addEventListener(SSJE_READ_EVENT, recheck);
    window.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    // Native shell signals: the app returning to the foreground, and — the
    // important one for reflections — the in-app browser being dismissed
    // (a reflection opened externally stamps read-state, then fires this).
    window.addEventListener("phoebe:appactive", recheck);
    window.addEventListener("phoebe:browserfinished", recheck);
    return () => {
      window.removeEventListener(CAC_READ_EVENT, recheck);
      window.removeEventListener(FDD_READ_EVENT, recheck);
      window.removeEventListener(SSJE_READ_EVENT, recheck);
      window.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
      window.removeEventListener("phoebe:browserfinished", recheck);
    };
  }, []);

  // Optional-practice completion (gratitude / examen). Instant local flags flip
  // the anchor the moment the user finishes; we re-check on the shared event +
  // return-to-app signals, and OR in the server rows below for cross-device.
  const [practiceLocal, setPracticeLocal] = useState(() => ({
    gratitude: hasPracticeDoneToday("gratitude"),
    examen: hasPracticeDoneToday("examen"),
  }));
  useEffect(() => {
    const recheck = () => setPracticeLocal({
      gratitude: hasPracticeDoneToday("gratitude"),
      examen: hasPracticeDoneToday("examen"),
    });
    window.addEventListener(PRACTICE_DONE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    return () => {
      window.removeEventListener(PRACTICE_DONE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
    };
  }, []);

  // Custom user-defined practices (title + emoji + a per-day check). Re-read the
  // list AND each check on the custom-anchor events + return-to-app signals so a
  // tick — here or on another surface — flips the dot live.
  const [customAnchors, setCustomAnchors] = useState(() =>
    getCustomAnchors().map((a) => ({ ...a, done: isCustomDoneToday(a.id), skipped: isCustomSkippedToday(a.id) })),
  );
  useEffect(() => {
    const recheck = () =>
      setCustomAnchors(getCustomAnchors().map((a) => ({ ...a, done: isCustomDoneToday(a.id), skipped: isCustomSkippedToday(a.id) })));
    window.addEventListener(CUSTOM_ANCHORS_EVENT, recheck);
    window.addEventListener(CUSTOM_DONE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    return () => {
      window.removeEventListener(CUSTOM_ANCHORS_EVENT, recheck);
      window.removeEventListener(CUSTOM_DONE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
    };
  }, []);

  // Office completion — the instant local flags the office viewer AND the
  // physical-book quick-log write. ORed with the server office-history below;
  // the local flag flips the anchor the moment the office is logged, and the
  // OFFICE_DONE_EVENT lets an in-place quick-log refresh the home without a nav.
  const [officeLocal, setOfficeLocal] = useState(() => ({
    morning: officeLocalDone(["morning", "morning-devotion"]),
    evening: officeLocalDone(["evening", "early-evening-devotion", "compline"]),
  }));
  useEffect(() => {
    const recheck = () => setOfficeLocal({
      morning: officeLocalDone(["morning", "morning-devotion"]),
      evening: officeLocalDone(["evening", "early-evening-devotion", "compline"]),
    });
    window.addEventListener(OFFICE_DONE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    return () => {
      window.removeEventListener(OFFICE_DONE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
    };
  }, []);

  const { data: officeHistory } = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean }> }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    staleTime: 30_000,
  });

  // Server-backed completion rows for the optional practices (cross-device).
  // Only fetched/used for the practices the user has actually added.
  const gratitudeActive = homeCardActive(user?.homeLayout, "gratitude");
  const examenActive = homeCardActive(user?.homeLayout, "examen");
  const anyExtraActive = gratitudeActive || examenActive;
  // Server filters rows on weekStart >= since, and today's row carries THIS
  // week's Sunday as weekStart — so we ask from the week start, then match the
  // exact localDate below. (Passing today would drop the row on any non-Sunday.)
  const weekStartDay = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    return d.toLocaleDateString("en-CA");
  }, []);
  const { data: completions } = useQuery<{ completions: Array<{ section: string; localDate: string }> }>({
    queryKey: ["/api/practice-completion", weekStartDay],
    queryFn: () => apiRequest("GET", `/api/practice-completion?since=${weekStartDay}`),
    staleTime: 30_000,
    enabled: anyExtraActive,
  });
  const serverDone = (section: string) =>
    !!completions?.completions?.some((c) => c.section === section && c.localDate === day);

  const todaySince = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, []);
  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }, []);
  const { data: contStats } = useQuery<{ todaySeconds: number; healthMinutesToday: number }>({
    queryKey: ["/api/me/contemplation-stats", todaySince.slice(0, 10), tz],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-stats?todaySince=${encodeURIComponent(todaySince)}&tz=${encodeURIComponent(tz)}`),
    staleTime: 30_000,
  });

  const { data: cobreathe } = useQuery<{ done: boolean; count: number }>({
    queryKey: ["/api/breath/today", day],
    queryFn: () => apiRequest("GET", `/api/breath/today?day=${day}`),
    staleTime: 60_000,
  });

  const { data: rhythm } = useQuery<{ streak: number; last7: number; keptToday: boolean }>({
    queryKey: ["/api/me/prayer-days", tz],
    queryFn: () => apiRequest("GET", `/api/me/prayer-days?tz=${encodeURIComponent(tz)}`),
    staleTime: 60_000,
  });

  const { data: prayerStreak } = useQuery<{ gardenPrayedTodayCount?: number }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    staleTime: 60_000,
  });

  // Server-backed reflection reads (CAC + FDD + SSJE) for today — so the
  // Reflect anchor is correct on a device that didn't do the reading (e.g. web,
  // after reading on mobile). OR'd with the instant local flag below.
  const { data: reflRead } = useQuery<{ cac: boolean; fdd: boolean; ssje: boolean }>({
    queryKey: ["/api/me/reflections-read", day],
    queryFn: () => apiRequest("GET", `/api/me/reflections-read?ymd=${day}`),
    staleTime: 60_000,
  });

  const reflectDone = reflectLocal || !!reflRead?.cac || !!reflRead?.fdd || !!reflRead?.ssje;

  // What the user prays for the office — global default (office-prefs) OR a
  // per-side override. Mirrors the home prayer card's resolution, so the
  // Morning/Evening anchors read "Devotion"/"Prayer"/"Pray together" to match.
  const { data: officePrefs } = useQuery<{ defaultPrayerLevel?: "devotion" | "office" | "intercessions"; contemplationGoalMinutes?: number; dailyStepGoal?: number; dailyStepReachedDate?: string | null; morning?: string; evening?: string }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
  });
  const dpl = officePrefs?.defaultPrayerLevel;
  const ml = getSideLevel("morning");
  const el = getSideLevel("evening");
  const prayerKind: PrayerKind =
    (dpl === "office" || ml === "office" || el === "office") ? "office"
    : (dpl === "devotion" || ml === "devotion" || el === "devotion") ? "devotion"
    : (dpl === "intercessions" || ml === "intercessions" || el === "intercessions") ? "community"
    : "devotion";

  const todayOffice = officeHistory?.days?.[officeHistory.days.length - 1];
  const morningDone = !!todayOffice?.morning || officeLocal.morning;
  const eveningDone = !!todayOffice?.evening || officeLocal.evening;

  // Contemplation (was "Silence"): today's minutes = Phoebe sits + any external
  // Apple Health mindful minutes (a Cobreathe breath logs a contemplation sit,
  // so it's already counted here). It only counts as KEPT once the daily goal is
  // met — if no goal is set, any silence counts.
  const contemplationMin = Math.floor((contStats?.todaySeconds ?? 0) / 60) + (contStats?.healthMinutesToday ?? 0);
  const contemplationGoalMin = officePrefs?.contemplationGoalMinutes ?? 0;
  const silenceDone = contemplationGoalMin > 0
    ? contemplationMin >= contemplationGoalMin
    : contemplationMin > 0;

  const gratitudeDone = gratitudeActive && (practiceLocal.gratitude || serverDone("gratitude"));
  const examenDone = examenActive && (practiceLocal.examen || serverDone("examen"));

  // Daily steps (optional practice). Active only when the card is on the home
  // AND a step goal is set. We read today's steps from HealthKit ONLY while
  // active (the hook is gated), and treat the day as kept when the live count
  // reaches the goal OR the server already stamped today's reached-date (the
  // cross-device / web signal, set on the first synced crossing).
  const stepsGoal = officePrefs?.dailyStepGoal ?? 0;
  const stepsActive = homeCardActive(user?.homeLayout, "steps") && stepsGoal > 0;
  const { steps: stepsToday } = useDailySteps(stepsActive);
  const stepsReachedToday = (officePrefs?.dailyStepReachedDate ?? null) === day;
  const stepsDone = stepsActive && (stepsReachedToday || stepsToday >= stepsGoal);

  // The four core anchors plus whichever optional practices the user added.
  // Evening is an OPT-IN anchor — off by default (evening office pref "none"),
  // so an un-set-up user keeps three dots: morning · contemplation · reflection.
  // The customizer (rule-of-life) sets the evening pref to a level when enabled,
  // which flips this on. While prefs load, treat evening as off (no flash).
  // Each core anchor is part of the rhythm only when the user keeps it:
  // morning/evening prayer when the office pref isn't "none", contemplation
  // when a goal is set, reflection when a source is chosen. While prefs load we
  // fall back to each anchor's SERVER default (morning "devotion", goal 5 min,
  // reflection on, evening off) so the default-on anchors don't pop in once the
  // prefs query lands — only the genuinely-off ones stay hidden.
  const reflectionSource = useEffectiveReflectionSource();
  // Whether an office is part of the rhythm must come from its CHOSEN LEVEL
  // (set by the customizer's setSideLevel), NOT the `morning`/`evening` reminder
  // field — `commit` writes that reminder field to "none" whenever the user
  // declines a reminder, which was hiding the office anchor for anyone who
  // picked the office but no reminder. A real level (anything but "ask"/"none")
  // means the office is in the rhythm; otherwise fall back to the server pref
  // (cross-device + the un-set-up morning-on default).
  // A chosen office level (anything but the "ask"/not-chosen sentinel or null)
  // means the office is in the rhythm. null falls back to the server pref.
  const isActiveLevel = (l: typeof ml) => l != null && l !== "ask";
  const morningActive = isActiveLevel(ml) || (officePrefs?.morning ?? "devotion") !== "none";
  const eveningActive = isActiveLevel(el) || (officePrefs?.evening ?? "none") !== "none";
  const silenceActive = (officePrefs?.contemplationGoalMinutes ?? 5) > 0;
  const reflectActive = reflectionSource !== "none";
  const coreFlags = [
    ...(morningActive ? [morningDone] : []),
    ...(reflectActive ? [reflectDone] : []),
    ...(silenceActive ? [silenceDone] : []),
    ...(eveningActive ? [eveningDone] : []),
  ];
  const extraFlags = [
    ...(gratitudeActive ? [gratitudeDone] : []),
    ...(examenActive ? [examenDone] : []),
    ...(stepsActive ? [stepsDone] : []),
    // "Not today" customs drop out entirely — no dot, not counted.
    ...customAnchors.filter((a) => !a.skipped).map((a) => a.done),
  ];
  const allFlags = [...coreFlags, ...extraFlags];
  const totalAnchors = allFlags.length;
  const doneCount = allFlags.filter(Boolean).length;

  // Have the queries that determine each card's done-state resolved? Until
  // they have, every "*Done" flag reads false, so the cards would all render
  // under "Next" and then visibly jump into "Done" as the data lands. Consumers
  // gate their first paint on this to fade in the settled split instead of
  // animating that reshuffle. (Cached navigations resolve synchronously, so
  // this is true on the first render and the fade just plays once.)
  const ready =
    officeHistory !== undefined &&
    contStats !== undefined &&
    reflRead !== undefined &&
    officePrefs !== undefined &&
    (!anyExtraActive || completions !== undefined);

  return {
    ready,
    morningDone,
    reflectDone,
    silenceDone,
    eveningDone,
    eveningActive,
    morningActive,
    silenceActive,
    reflectActive,
    gratitudeActive,
    examenActive,
    stepsActive,
    gratitudeDone,
    examenDone,
    stepsDone,
    stepsToday,
    stepsGoal,
    customAnchors,
    totalAnchors,
    doneCount,
    streak: rhythm?.streak ?? 0,
    last7: rhythm?.last7 ?? 0,
    keptToday: !!rhythm?.keptToday,
    gardenCount: prayerStreak?.gardenPrayedTodayCount ?? 0,
    cobreatheCount: cobreathe?.count ?? 0,
    prayerKind,
    contemplationMin,
    contemplationGoalMin,
  };
}
