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
import { getSideLevel } from "@/lib/officePrefs";
import { getPracticeSlot, getJournalingSlot, SLOT_RANK, isSlotPast, type CustomSlot } from "@/lib/customAnchors";
import { useRhythmState } from "@/hooks/useRhythmState";

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
      if (r.prayerKind === "community") return "Pray together";
      if (r.prayerKind === "devotion") return `${side} Devotion`;
      return `${side} Prayer`;
    };
    const officeSubtitle = (isMorning: boolean): string =>
      withYou > 0
        ? `${withYou} ${withYou === 1 ? "person" : "people"} prayed with you this week`
        : isMorning ? "Begin the day with the office" : "Mark the day's end with the office";

    // Every active practice, in DailyProgressBody's base order. A stable sort by
    // slot rank then reproduces the home's time-of-day ordering; within a slot
    // the base order below is preserved.
    const items: NextItem[] = [
      { active: r.morningActive, done: r.morningDone, slot: "morning", title: officeTitle("Morning"), eyebrow: "Book of Common Prayer", subtitle: officeSubtitle(true), cta: "Begin prayer", kind: "office" },
      ...r.reflections.map((rf) => ({
        active: true, done: rf.done, slot: "morning" as CustomSlot,
        title: REFLECTION_NAME[rf.source] ?? "Today's reflection",
        eyebrow: REFLECTION_NAME[rf.source] ?? "Today's reflection",
        subtitle: (rf.source === "cac" && cacMetaQ.data?.title) ? cacMetaQ.data.title : "A few minutes with the day's word",
        cta: "Read", kind: "reflect" as const,
      })),
      { active: r.morningContemplationActive, done: r.morningContemplationDone, slot: "morning", title: "Morning Contemplation", eyebrow: "Contemplative Prayer", subtitle: "Loving God in silence", cta: "Begin", kind: "office" },
      { active: r.cobreatheActive, done: r.cobreatheDone, slot: getPracticeSlot("cobreathe"), title: "Creation Prayer", eyebrow: "A prayer for the earth", subtitle: "Twelve breaths, prayed together", cta: "Begin", kind: "office" },
      { active: r.listeningActive, done: r.listeningDone, slot: getPracticeSlot("listening"), title: "Audio Divina", eyebrow: "Sacred listening", subtitle: "Music as a way of prayer", cta: "Begin", kind: "reflect" },
      { active: r.scriptureActive, done: r.scriptureDone, slot: getPracticeSlot("scripture"), title: "Listen to Scripture", eyebrow: "The day's readings", subtitle: "Hear today's word", cta: "Listen", kind: "reflect" },
      { active: r.walkActive, done: r.walkDone, slot: getPracticeSlot("walk"), title: "Contemplative Walk", eyebrow: "Prayer in motion", subtitle: "Walk and pray", cta: "Log", kind: "office" },
      { active: r.journalingActive, done: r.journalingDone, slot: getJournalingSlot(), title: "Journaling", eyebrow: "Keep a journal", subtitle: "Log the day", cta: "Log", kind: "office" },
      { active: r.readingActive, done: r.readingDone, slot: getPracticeSlot("reading"), title: "Reading", eyebrow: "Your reading rule", subtitle: "Log today's reading", cta: "Log", kind: "office" },
      { active: r.prayerListActive, done: r.prayerListDone, slot: "anytime", title: "My Prayer List", eyebrow: "Your intentions", subtitle: "Pray through your list", cta: "Pray", kind: "office" },
      { active: r.examenActive, done: r.examenDone, slot: getPracticeSlot("examen"), title: "The Examen", eyebrow: "Review the day", subtitle: "Look back with God", cta: "Begin", kind: "office" },
      { active: r.eveningContemplationActive, done: r.eveningContemplationDone, slot: "evening", title: "Evening Contemplation", eyebrow: "Contemplative Prayer", subtitle: "Loving God in silence", cta: "Begin", kind: "office" },
      { active: r.gratitudeActive, done: r.gratitudeDone, slot: "evening", title: "Gratitude", eyebrow: "Name a gift", subtitle: "One gift from the day", cta: "Write", kind: "office" },
      { active: r.eveningActive, done: r.eveningDone, slot: "evening", title: officeTitle("Evening"), eyebrow: "Book of Common Prayer", subtitle: officeSubtitle(false), cta: "Begin prayer", kind: "office" },
      ...r.customAnchors.filter((a) => !a.skipped).map((a) => ({
        active: true, done: !!a.done, slot: a.slot,
        title: a.title, eyebrow: "Your practice", subtitle: "A daily practice", cta: "Log", kind: "office" as const,
      })),
    ];

    const active = items.filter((i) => i.active);
    // Stable sort by time-of-day slot (Array.prototype.sort is stable) — the same
    // ordering DailyProgressBody applies to its cards.
    const ordered = [...active].sort((a, b) => SLOT_RANK[a.slot] - SLOT_RANK[b.slot]);
    // "Next" = the first not-done practice whose slot HASN'T already passed
    // today (a passed slot is "tomorrow", not next). Falls back to summary.
    const next = ordered.find((i) => !i.done && !isSlotPast(i.slot, now)) ?? null;

    // The CORE anchor dots (Morning · Reflection · Silence · Evening) — kept as
    // the compact home-pill set the widget already renders, driven by
    // useRhythmState's aggregates so they can't drift.
    const dots: number[] = [
      ...(r.morningActive ? [r.morningDone ? 1 : 0] : []),
      ...r.reflections.map((rf) => (rf.done ? 1 : 0)),
      ...(r.silenceActive ? [r.silenceDone ? 1 : 0] : []),
      ...(r.eveningActive ? [r.eveningDone ? 1 : 0] : []),
    ];
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
      updatedAt: new Date().toISOString(),
    });
  }, [
    enabled,
    r.ready,
    r.morningActive, r.morningDone, r.eveningActive, r.eveningDone,
    r.morningContemplationActive, r.morningContemplationDone,
    r.eveningContemplationActive, r.eveningContemplationDone,
    r.silenceActive, r.silenceDone, r.reflectActive, reflSig,
    r.cobreatheActive, r.cobreatheDone, r.listeningActive, r.listeningDone,
    r.scriptureActive, r.scriptureDone,
    r.walkActive, r.walkDone, r.journalingActive, r.journalingDone,
    r.readingActive, r.readingDone, r.prayerListActive, r.prayerListDone,
    r.examenActive, r.examenDone, r.gratitudeActive, r.gratitudeDone,
    customSig, r.prayerKind, r.streak, r.contemplationMin, r.contemplationGoalMin,
    prayedWithQ.data, coPrayersQ.data, prayerReqsQ.data, cacMetaQ.data,
  ]);
}

export function WidgetSync(): null {
  useWidgetSync();
  return null;
}
