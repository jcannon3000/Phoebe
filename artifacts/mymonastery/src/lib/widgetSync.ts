/**
 * Feeds the iOS Home/Lock-Screen widget (PhoebeWidget) the SAME "what's next"
 * the home screen shows. Rather than re-deriving the rhythm (which drifted as new
 * practices were added), it reads the SINGLE source of truth — useRhythmState —
 * and orders every ACTIVE practice by its time-of-day slot exactly the way
 * DailyProgressBody does, then pushes the first still-to-do one (skipping
 * practices whose slot has already passed — those are "tomorrow", not "next").
 *
 * Native only: on web `PhoebeNative` is undefined and the push is a no-op. Mount
 * <WidgetSync /> once where the app lands. The payload FIELD SET is unchanged, so
 * the Swift widget needs no rebuild — only the values it renders improve.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";
import { getSideLevel, getSideCustomName } from "@/lib/officePrefs";
import { getPracticeSlot, SLOT_RANK, isSlotPast, type CustomSlot } from "@/lib/customAnchors";
import { useRhythmState } from "@/hooks/useRhythmState";
import { computeWeeklyGrid, type PracticeWeekDay } from "@/lib/weeklyGrid";

type WidgetState = {
  heroKind: "office" | "reflect" | "summary";
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCta: string;        // "" → no button (summary state)
  heroDeepLink: string;
  streakDays: number;
  prayedToday: boolean;
  nextOffice: string;
  newPrayersCount: number;
  doneCount: number;
  totalAnchors: number;
  dots: number[];
  morningDone: boolean;
  reflectDone: boolean;
  eveningDone: boolean;
  reflectAvailable: boolean;
  contemplationMin: number;
  contemplationGoalMin: number;
  // "Past 7 Days" grid — the SAME data + row-label mode
  // (Turn/Learn/Pray vs Morning/Contemplative/Evening) the home card shows,
  // via the shared computeWeeklyGrid (lib/weeklyGrid.ts). weeklyGrid[row][day],
  // oldest day first / today last, matching the home card's column order.
  weeklyLabels: string[];
  weeklyEmoji: string[];
  weeklyGrid: boolean[][];
  weeklyDayInitials: string[];
  updatedAt: string;
};
type WidgetBridge = { updateWidget?: (s: Partial<WidgetState>) => void };

// The reflection card's headline name, by source — mirrors the home reflection cards.
const REFLECTION_NAME: Record<string, string> = {
  cac: "CAC Daily Reflection",
  fdd: "Forward Day by Day",
  ssje: "Brother, Give Us a Word",
};

const HOME_URL = "https://withphoebe.app/";

// One entry per practice that can be "next". `kind` only tunes the widget's
// accent colour (office green / reflect teal); `slot` drives the ordering.
type NextItem = {
  active: boolean;
  done: boolean;
  slot: CustomSlot;
  title: string;
  eyebrow: string;
  subtitle: string;
  cta: string;
  kind: "office" | "reflect";
  // True only for the morning/evening slot's actual anchor (the office
  // itself, or a novena standing in for it in "replace" mode) — sorted
  // ahead of anything else sharing that slot so "what's next" always
  // surfaces the office over an add-on like Contemplation or the Examen.
  isPrimary?: boolean;
};

export function useWidgetSync(): void {
  const { user } = useAuth();
  const native = isNativeShell();
  const enabled = !!user && native;

  // The single source of truth for the rhythm — same flags the home renders.
  const r = useRhythmState();

  // Community summary counts (for the "day is kept" hero) + new prayer requests
  // (the lock-screen rectangular leads with these) — not part of useRhythmState.
  const prayedWithQ = useQuery<{ people?: unknown[]; total?: number }>({
    queryKey: ["/api/prayer-streak/community-prayed-week"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak/community-prayed-week"),
    enabled, staleTime: 5 * 60_000,
  });
  const coPrayersQ = useQuery<{ people?: unknown[] }>({
    queryKey: ["/api/prayer-streak/co-prayers-week"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak/co-prayers-week"),
    enabled, staleTime: 5 * 60_000,
  });
  const prayerReqsQ = useQuery<Array<{ isAnswered?: boolean; isOwnRequest?: boolean; closedAt?: string | null; myAmenedEver?: boolean }>>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled, staleTime: 60_000,
  });
  // Today's CAC headline for the reflect hero's subtitle (only source with a
  // per-day title endpoint; fdd/ssje fall back to a generic line).
  const cacSource = r.reflections.some((x) => x.source === "cac");
  const cacMetaQ = useQuery<{ title?: string }>({
    queryKey: ["/api/cac/today-meta"],
    queryFn: () => apiRequest("GET", "/api/cac/today-meta"),
    enabled: enabled && cacSource, staleTime: 30 * 60_000,
  });
  // Same tz + query key WayOfLoveTurnLearnPray.tsx uses for the identical
  // fetch, so React Query shares the one cached result instead of doubling
  // the request — this hook and the home card end up reading the exact
  // same server response.
  const weekTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const weekQ = useQuery<{ days: PracticeWeekDay[] }>({
    queryKey: ["/api/me/practice-week", weekTz],
    queryFn: () => apiRequest("GET", `/api/me/practice-week?tz=${encodeURIComponent(weekTz)}`),
    enabled, staleTime: 60_000,
  });
  // Same key WayOfLoveTurnLearnPray / settings.tsx read/write
  // (TLP_MODE_KEY) — kept as a literal here rather than importing from
  // pages/settings.tsx, matching how HIDE_TLP_KEY is already duplicated as
  // a literal between settings.tsx and the component instead of shared.
  // Defaults ON (Morning/Contemplative/Evening) — only an explicit "0" (the
  // user toggled it off in Settings) reads as Turn/Learn/Pray.
  const practiceMode = (() => { try { return localStorage.getItem("phoebe:tlp-row-mode") !== "0"; } catch { return true; } })();

  // Stable signatures for the array-valued rhythm state, so the push effect
  // re-runs only when the reflections / custom anchors actually change (their
  // refs are fresh every render).
  const reflSig = r.reflections.map((x) => `${x.source}:${x.done ? 1 : 0}`).join(",");
  const customSig = r.customAnchors.map((a) => `${a.id}:${a.done ? 1 : 0}:${a.slot}:${a.skipped ? 1 : 0}`).join(",");

  useEffect(() => {
    if (!enabled) return;
    const now = new Date();
    const withYou = prayedWithQ.data?.total ?? prayedWithQ.data?.people?.length ?? 0;
    const youFor = coPrayersQ.data?.people?.length ?? 0;
    const newPrayersCount = (prayerReqsQ.data ?? []).filter(
      (x) => !x.isAnswered && !x.isOwnRequest && !x.closedAt && !x.myAmenedEver,
    ).length;

    // Office title, matching DailyProgressBody.officeTitle (Psalms / Devotion /
    // Prayer / Pray together, per the side's level + the effective prayer kind).
    const officeTitle = (side: "Morning" | "Evening"): string => {
      const lvl = getSideLevel(side.toLowerCase() as "morning" | "evening");
      if (lvl === "psalms") return `${side} Psalms`;
      // The Examen / Simple Guided Prayer / Contemplation IS this side's
      // anchor → name the card after the practice, matching officeSubtitle
      // below and DailyProgressBody.officeTitle (which this mirrors).
      if (lvl === "reflect-sit") return "Contemplation";
      if (lvl === "examen") return "The Examen";
      if (lvl === "guided-prayer") return "Guided Prayer";
      // A user's own named practice IS this side's prayer — the widget
      // names the card after what they typed, matching the home card.
      if (lvl === "custom") return getSideCustomName(side.toLowerCase() as "morning" | "evening").trim() || `${side} Practice`;
      if (r.prayerKind === "community") return "Pray together";
      if (r.prayerKind === "devotion") return `${side} Devotion`;
      return `${side} Prayer`;
    };
    // Eyebrow follows the same per-side level check as officeTitle — "Book of
    // Common Prayer" only fits when the side's anchor actually IS the office.
    const officeEyebrow = (side: "Morning" | "Evening"): string => {
      const lvl = getSideLevel(side.toLowerCase() as "morning" | "evening");
      if (lvl === "reflect-sit") return "Contemplative Prayer";
      if (lvl === "examen") return "Review the day";
      if (lvl === "guided-prayer") return "Three Minutes to Start Your Day";
      if (lvl === "custom") return "Your own practice";
      return "Book of Common Prayer";
    };
    const officeSubtitle = (isMorning: boolean): string =>
      withYou > 0
        ? `${withYou} ${withYou === 1 ? "person" : "people"} prayed with you this week`
        : isMorning ? "Begin the day with the office" : "Mark the day's end with the office";

    // Every active practice, in DailyProgressBody's base order. A stable sort by
    // slot rank then reproduces the home's time-of-day ordering; within a slot
    // the base order below is preserved.
    const items: NextItem[] = [
      { active: r.morningActive && !r.novenaReplacesMorning, done: r.morningDone, slot: "morning", title: officeTitle("Morning"), eyebrow: officeEyebrow("Morning"), subtitle: officeSubtitle(true), cta: "Begin prayer", kind: "office", isPrimary: true },
      // A novena in "replace" mode takes over its slot's item entirely — same
      // gate as the rawCards/dotDefs replace-mode entries — so it's primary too.
      { active: !!(r.novenaReplacesMorning && r.novenaActive), done: r.novenaDone, slot: "morning", title: r.novena?.title ?? "Novena", eyebrow: "Novena", subtitle: r.novena ? `Day ${r.novena.currentDay} of ${r.novena.dayCount}` : "", cta: "Begin", kind: "office", isPrimary: true },
      ...r.reflections.map((rf) => ({
        active: true, done: rf.done, slot: "morning" as CustomSlot,
        title: REFLECTION_NAME[rf.source] ?? "Today's reflection",
        eyebrow: REFLECTION_NAME[rf.source] ?? "Today's reflection",
        subtitle: (rf.source === "cac" && cacMetaQ.data?.title) ? cacMetaQ.data.title : "A few minutes with the day's word",
        cta: "Read", kind: "reflect" as const,
      })),
      { active: r.morningContemplationActive, done: r.morningContemplationDone, slot: "morning", title: "Morning Contemplation", eyebrow: "Contemplative Prayer", subtitle: "Loving God in silence", cta: "Begin", kind: "office" },
      // The solo "Silence" goal card — shown whenever there's a minutes goal
      // but no per-side contemplation card carries it (same gate as rawCards'
      // "silence" card in DailyProgressBody). Was missing entirely, which
      // undercounted totalAnchors/dots for the default guest shape.
      { active: r.silenceGoalCardActive, done: r.silenceGoalCardDone, slot: "anytime", title: "Contemplation", eyebrow: "Contemplative Prayer", subtitle: "Loving God in silence", cta: "Begin", kind: "office" },
      // cobreatheStandaloneActive (not raw cobreatheActive) — when Creation
      // Prayer is riding as the per-side Morning/Evening Contemplation card
      // instead, the standalone card above is suppressed (same gate as
      // rawCards), so this must be too or it double-counts.
      { active: r.cobreatheStandaloneActive, done: r.cobreatheDone, slot: getPracticeSlot("cobreathe"), title: "Creation Prayer", eyebrow: "A prayer for the earth", subtitle: "Twelve breaths, prayed together", cta: "Begin", kind: "office" },
      { active: r.listeningActive, done: r.listeningDone, slot: getPracticeSlot("listening"), title: "Audio Divina", eyebrow: "Sacred listening", subtitle: "Music as a way of prayer", cta: "Begin", kind: "reflect" },
      { active: r.podcastsActive, done: r.podcastsDone, slot: "afternoon" as CustomSlot, title: "Way of Love", eyebrow: "A podcast episode", subtitle: "Listen to today's episode", cta: "Listen", kind: "reflect" },
      { active: r.walkActive, done: r.walkDone, slot: getPracticeSlot("walk"), title: "Contemplative Walk", eyebrow: "Prayer in motion", subtitle: "Walk and pray", cta: "Log", kind: "office" },
      // Compline rides the evening slot — same fixed placement the home card
      // and the header dot use (it IS the night office, so no slot picker).
      { active: r.complineActive, done: r.complineDone, slot: "evening", title: "Compline", eyebrow: "The night office", subtitle: "Hand the day to God", cta: "Begin", kind: "office" },
      { active: r.readingActive, done: r.readingDone, slot: getPracticeSlot("reading"), title: "Reading", eyebrow: "Your reading rule", subtitle: "Log today's reading", cta: "Log", kind: "office" },
      // Prayer List is NOT a routine anchor here either — same exclusion as
      // DailyProgressBody.tsx (see its comment there): it's woven into the
      // offices and gets its own always-visible section, not a Next/Done slot,
      // so it must never preempt the real next-up item (it used to, via its
      // "anytime" slot outranking Evening Prayer for any account with an
      // active, undone list).
      // Suppressed when a side's own anchor IS the Examen (already rendered
      // above via officeTitle's "The Examen" rename) — same gate as
      // rawCards' standalone Examen card, else the widget could show it twice.
      { active: r.examenActive && getSideLevel("morning") !== "examen" && getSideLevel("evening") !== "examen", done: r.examenDone, slot: getPracticeSlot("examen"), title: "The Examen", eyebrow: "Review the day", subtitle: "Look back with God", cta: "Begin", kind: "office" },
      // The active novena — same novenaActive/Done DailyProgressBody's card
      // and the header pill's dot use, so the widget can't drift from either.
      { active: !!(r.novenaActive && !r.novenaReplacesMorning && !r.novenaReplacesEvening), done: r.novenaDone, slot: "anytime", title: r.novena?.title ?? "Novena", eyebrow: "Novena", subtitle: r.novena ? `Day ${r.novena.currentDay} of ${r.novena.dayCount}` : "", cta: "Begin", kind: "office" },
      { active: r.eveningContemplationActive, done: r.eveningContemplationDone, slot: "evening", title: "Evening Contemplation", eyebrow: "Contemplative Prayer", subtitle: "Loving God in silence", cta: "Begin", kind: "office" },
      { active: r.eveningActive && !r.novenaReplacesEvening, done: r.eveningDone, slot: "evening", title: officeTitle("Evening"), eyebrow: officeEyebrow("Evening"), subtitle: officeSubtitle(false), cta: "Begin prayer", kind: "office", isPrimary: true },
      { active: !!(r.novenaReplacesEvening && r.novenaActive), done: r.novenaDone, slot: "evening", title: r.novena?.title ?? "Novena", eyebrow: "Novena", subtitle: r.novena ? `Day ${r.novena.currentDay} of ${r.novena.dayCount}` : "", cta: "Begin", kind: "office", isPrimary: true },
      ...r.customAnchors.filter((a) => !a.skipped).map((a) => ({
        active: true, done: !!a.done, slot: a.slot,
        title: a.title, eyebrow: "Your practice", subtitle: "A daily practice", cta: "Log", kind: "office" as const,
      })),
    ];

    const active = items.filter((i) => i.active);
    // Stable sort by time-of-day slot (Array.prototype.sort is stable), then —
    // within a slot — the office/replacing-novena item first, so "what's next"
    // always surfaces the morning/evening anchor over an add-on sharing that
    // slot (e.g. Morning Contemplation as an extra, alongside Morning Prayer).
    const ordered = [...active].sort((a, b) => {
      const slotDiff = SLOT_RANK[a.slot] - SLOT_RANK[b.slot];
      if (slotDiff !== 0) return slotDiff;
      return (a.isPrimary ? 0 : 1) - (b.isPrimary ? 0 : 1);
    });
    // "Next" = the first not-done practice whose slot HASN'T already passed
    // today (a passed slot is "tomorrow", not next). Falls back to summary.
    const next = ordered.find((i) => !i.done && !isSlotPast(i.slot, now)) ?? null;

    // One dot per active anchor in the person's ACTUAL routine — the same
    // `ordered` list "next" is resolved from, so the widget can never show a
    // different count than the real home screen. This used to be a hardcoded
    // 4-slot set (morning/reflection/a stale "silence" field/evening) that
    // silently dropped cobreathe, listening, walk, reading, examen, per-side
    // contemplation, and custom anchors from the count.
    const dots: number[] = ordered.map((i) => (i.done ? 1 : 0));
    const totalAnchors = dots.length;
    const doneCount = dots.filter((d) => d === 1).length;

    let heroKind: WidgetState["heroKind"];
    let heroEyebrow: string;
    let heroTitle: string;
    let heroSubtitle: string;
    let heroCta: string;
    let nextOffice = "";
    if (next) {
      heroKind = next.kind === "reflect" ? "reflect" : "office";
      heroEyebrow = next.eyebrow;
      heroTitle = next.title;
      heroSubtitle = next.subtitle;
      heroCta = next.cta;
      // nextOffice keeps the accessory families' "NEXT UP" line working for an
      // older widget build that only read this field.
      nextOffice = next.title;
    } else {
      heroKind = "summary";
      heroEyebrow = "The day is kept";
      heroTitle = "The day is kept";
      heroSubtitle = `${withYou} prayed with you · you prayed for ${youFor}`;
      heroCta = "";
    }

    // Same shared function the home card renders from (lib/weeklyGrid.ts) —
    // `turned` is just `true` here rather than reading the local per-day
    // stamp: this effect only ever runs inside the native app with an
    // authenticated user, so its running AT ALL already satisfies Turn's
    // actual definition ("opened Phoebe today").
    const weekly = computeWeeklyGrid({ rhythm: r, week: weekQ.data, practiceMode, turned: true });

    const bridge = (window as unknown as { PhoebeNative?: WidgetBridge }).PhoebeNative;
    bridge?.updateWidget?.({
      heroKind,
      heroEyebrow,
      heroTitle,
      heroSubtitle,
      heroCta,
      heroDeepLink: HOME_URL,
      streakDays: r.streak,
      prayedToday: r.morningDone || r.eveningDone,
      nextOffice,
      newPrayersCount,
      doneCount,
      totalAnchors,
      dots,
      morningDone: r.morningDone,
      reflectDone: r.reflectDone,
      eveningDone: r.eveningDone,
      reflectAvailable: r.reflectActive,
      contemplationMin: r.contemplationMin,
      contemplationGoalMin: r.contemplationGoalMin,
      weeklyLabels: weekly.rows.map((row) => row.label),
      weeklyEmoji: weekly.rows.map((row) => row.emoji),
      weeklyGrid: weekly.rows.map((row) => row.kept),
      weeklyDayInitials: weekly.dayInitials,
      updatedAt: new Date().toISOString(),
    });
  }, [
    enabled,
    r.ready,
    weekQ.data, practiceMode,
    r.morningActive, r.morningDone, r.eveningActive, r.eveningDone,
    r.morningContemplationActive, r.morningContemplationDone,
    r.eveningContemplationActive, r.eveningContemplationDone,
    r.silenceActive, r.silenceDone, r.reflectActive, reflSig,
    r.cobreatheActive, r.cobreatheDone, r.listeningActive, r.listeningDone,
    r.walkActive, r.walkDone, r.complineActive, r.complineDone,
    r.readingActive, r.readingDone, r.prayerListActive, r.prayerListDone,
    r.examenActive, r.examenDone,
    r.novenaActive, r.novenaDone, r.novena?.currentDay, r.novena?.title, r.novenaReplacesMorning, r.novenaReplacesEvening,
    customSig, r.prayerKind, r.streak, r.contemplationMin, r.contemplationGoalMin,
    prayedWithQ.data, coPrayersQ.data, prayerReqsQ.data, cacMetaQ.data,
  ]);
}

export function WidgetSync(): null {
  useWidgetSync();
  return null;
}
