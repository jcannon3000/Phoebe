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
import { getSideLevel, getSideCustomName, getSideReflectionExplicit, extraPracticeTitle } from "@/lib/officePrefs";
import { getPracticeSlot, SLOT_RANK, isSlotPast, isSlotOpen, type CustomSlot } from "@/lib/customAnchors";
import { anchorPracticeFor } from "@/lib/anchorPractices";
import { sortCardsByUserOrder, getRoutineOrder } from "@/lib/routineOrder";
import { rhythmGradientRgb } from "@/components/DailyProgressBody";
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
  // "Started but not yet met the day's quota" — the home card's half-shaded
  // dot (currently only ever true for Contemplation, today's column). Kept
  // as its own parallel grid rather than folded into weeklyGrid so the
  // widget can tell "kept" from "partial" apart, same as the web card does.
  weeklyPartial: boolean[][];
  weeklyDayInitials: string[];
  /**
   * THE NEXT TWO CARDS, exactly as the home's Next list would render them
   * (owner: "rebuild the wide widget to show the next two cards, and have
   * the UI match EXACTLY"). Same titles/blurbs/CTAs/emoji as the home
   * cards, same green ramp for the accent (`rgb` is "r,g,b"), same card
   * tint position, and the same Later state for a slot that hasn't opened.
   * Empty array = the day is kept (the summary state).
   */
  nextCards: Array<{
    emoji: string; title: string; subtitle: string; cta: string;
    rgb: string; tint: number; later: boolean;
  }>;
  updatedAt: string;
};
type WidgetBridge = { updateWidget?: (s: Partial<WidgetState>) => void };

// The reflection card's headline name, by source — mirrors the home reflection cards.
const REFLECTION_NAME: Record<string, string> = {
  // Hand-copied from DailyProgressBody's PUBLICATION_NAME and drifted twice:
  // `vts` was missing entirely (so a Dean's-Commentary reader's widget hero
  // fell back to the generic "Today's reflection"), and `cac` said
  // "Reflection" where every other surface — including this very file's own
  // inline branch a hundred lines below — says "Meditation". The widget must
  // never name a practice differently from the home card.
  fdd: "Forward Day by Day",
  ssje: "Brother, Give Us a Word",
  cac: "CAC Daily Meditation",
  vts: "VTS Dean's Commentary",
};

const HOME_URL = "https://withphoebe.app/";

// One entry per practice that can be "next". `kind` only tunes the widget's
// accent colour (office green / reflect teal); `slot` drives the ordering.
/** The extra card's emoji by level — hand-mirrors DailyProgressBody's
 *  EXTRA_EMOJI (same values, same default). */
const EXTRA_EMOJI: Record<string, string> = {
  office: "📖", devotion: "🕊️", psalms: "📜",
  readings: "📰", compline: "🌙", "guided-prayer": "🙌",
};

type NextItem = {
  active: boolean;
  done: boolean;
  slot: CustomSlot;
  /** The HOME CARD's key — what sortCardsByUserOrder ranks by, so the
   *  widget's next-two follow the person's own drag order exactly. */
  key: string;
  /** The home card's emoji, so the widget never badges a practice
   *  differently from the card it mirrors. */
  emoji: string;
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
  const practiceMode = true; // Morning/Contemplative/Evening — see usePracticeModePref.

  // Stable signatures for the array-valued rhythm state, so the push effect
  // re-runs only when the reflections / custom anchors actually change (their
  // refs are fresh every render).
  const reflSig = r.reflections.map((x) => `${x.source}:${x.done ? 1 : 0}`).join(",");
  const customSig = r.customAnchors.map((a) => `${a.id}:${a.done ? 1 : 0}:${a.slot}:${a.skipped ? 1 : 0}`).join(",");
  /**
   * The person's drag order — nextCards follows it (audit find). A PURE
   * reorder changes no other dep: useRhythmState re-renders on
   * OFFICE_PREFS_EVENT (setRoutineOrder dispatches it), so this signature is
   * re-read here, and without it the widget would keep yesterday's order
   * until some unrelated completion happened to wake the effect.
   */
  const orderSig = getRoutineOrder().join(",");

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
    // The widget's strings are plain English (they cross into Swift, not i18n),
    // so shared title helpers get a t() that just resolves their defaultValue.
    const tPass = (_k: string, o?: Record<string, unknown>): string => String(o?.["defaultValue"] ?? "");
    /** The face a contemplative SIDE card wears, by its kind — mirrors
     *  DailyProgressBody's per-side card naming exactly. */
    const contemplationSideFace = (cap: "Morning" | "Evening", kind: string): { title: string; eyebrow: string; subtitle: string; emoji: string } => {
      switch (kind) {
        case "creation": return { title: `${cap} Creation Prayer`, eyebrow: "A prayer for the earth", subtitle: "Breathing with creation", emoji: "🌍" };
        case "walk": return { title: "Contemplative Walk", eyebrow: "Prayer in motion", subtitle: "Walk and pray", emoji: "🚶" };
        case "audio": return { title: "Audio Divina", eyebrow: "Audio Divina", subtitle: "Connecting with God through music", emoji: "🎵" };
        case "visio": return { title: "Visio Divina", eyebrow: "Return", subtitle: "Pray with today's image", emoji: "🖼️" };
        default: return { title: `${cap} Contemplation`, eyebrow: "Contemplative Prayer", subtitle: "Loving God in silence", emoji: "🕯️" };
      }
    };
    /** The side anchor card's emoji — a custom anchor wears its own practice
     *  face, exactly as the home's morning/evening cards do. */
    const officeEmoji = (side: "morning" | "evening"): string => {
      if (getSideLevel(side) === "custom") {
        const e = anchorPracticeFor(getSideCustomName(side))?.emoji;
        if (e) return e;
      }
      return side === "morning" ? "🌅" : "🌙";
    };
    const officeTitle = (side: "Morning" | "Evening"): string => {
      const lvl = getSideLevel(side.toLowerCase() as "morning" | "evening");
      if (lvl === "psalms") return `${side} Psalms`;
      // The Examen / Simple Guided Prayer / Contemplation IS this side's
      // anchor → name the card after the practice, matching officeSubtitle
      // below and DailyProgressBody.officeTitle (which this mirrors).
      if (lvl === "reflect-sit") return "Contemplation";
      if (lvl === "examen") return "The Examen";
      if (lvl === "guided-prayer") return "Guided Prayer";
      // Compline had the same gap "readings" and "fdd" had below: a real side
      // anchor missing from this hand-rewritten copy of explicitLevelTitle, so
      // the home card said "Compline" and the widget said "Evening Prayer".
      if (lvl === "compline") return "Compline";
      // Same gap the home card had: "readings" is a full side anchor but was
      // missing here, so the widget called it "Evening Devotion". Side-prefixed
      // to match sideOfficeTitle — the widget must never name a practice
      // differently from the home card.
      if (lvl === "readings") return `${side} Scripture Reading`;
      // A user's own named practice IS this side's prayer — the widget
      // names the card after what they typed, matching the home card.
      if (lvl === "custom") return getSideCustomName(side.toLowerCase() as "morning" | "evening").trim() || `${side} Practice`;
      // A REFLECTION as this side's prayer. The level is the shared sentinel
      // "fdd" for all four sources, so without naming the actual source this
      // fell through and called a CAC anchor "Morning Prayer" — the same gap
      // "readings" had above. Must never disagree with the home card, which
      // is why both now answer this from the same stored per-side source.
      if (lvl === "fdd") {
        const src = getSideReflectionExplicit(side.toLowerCase() as "morning" | "evening") ?? "fdd";
        if (src === "cac") return "CAC Daily Meditation";
        if (src === "ssje") return "Brother, Give Us a Word";
        if (src === "vts") return "VTS Dean's Commentary";
        return "Forward Day by Day";
      }
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
      if (lvl === "readings") return "Today's appointed readings";
      if (lvl === "psalms") return "Today's appointed psalms";
      if (lvl === "custom") return "Your own practice";
      if (lvl === "fdd") return "Today's reflection";
      // Compline IS the prayer book's night office, so the eyebrow stands.
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
      { active: r.morningActive && !r.novenaReplacesMorning, done: r.morningDone, slot: "morning", key: "morning", emoji: officeEmoji("morning"), title: officeTitle("Morning"), eyebrow: officeEyebrow("Morning"), subtitle: officeSubtitle(true), cta: getSideLevel("morning") === "custom" ? "Mark done" : "Begin", kind: "office", isPrimary: true },
      /**
       * A side's SECOND practice. It has a card on the home and a dot in the
       * pill, so leaving it out here made the widget count fewer anchors than
       * the home showed — and meant "next" could never be the practice you
       * were actually next to pray. Not isPrimary: within the slot the anchor
       * still leads.
       */
      { active: !!r.morningExtraLevel, done: r.morningExtraDone, slot: "morning", key: "extra-morning", emoji: (r.morningExtraLevel && EXTRA_EMOJI[r.morningExtraLevel]) || "🌿", title: r.morningExtraLevel ? extraPracticeTitle("Morning", r.morningExtraLevel, tPass) : "", eyebrow: "Also this morning", subtitle: "Alongside your main practice", cta: "Begin", kind: "office" },
      // A novena in "replace" mode takes over its slot's item entirely — same
      // gate as the rawCards/dotDefs replace-mode entries — so it's primary too.
      { active: !!(r.novenaReplacesMorning && r.novenaActive), done: r.novenaDone, slot: "morning", key: "novena", emoji: "🕊️", title: r.novena?.title ?? "Novena", eyebrow: "Novena", subtitle: r.novena ? `Day ${r.novena.currentDay} of ${r.novena.dayCount}` : "", cta: "Begin", kind: "office", isPrimary: true },
      ...r.reflections.map((rf) => ({
        active: true, done: rf.done, slot: "morning" as CustomSlot,
        key: `reflect-${rf.source}`, emoji: rf.source === "vts" ? "🦩" : "📖",
        title: REFLECTION_NAME[rf.source] ?? "Today's reflection",
        eyebrow: REFLECTION_NAME[rf.source] ?? "Today's reflection",
        subtitle: (rf.source === "cac" && cacMetaQ.data?.title) ? cacMetaQ.data.title : "A few minutes with the day's word",
        cta: "Read", kind: "reflect" as const,
      })),
      // Named by the side's KIND — the widget called a Creation Prayer (or a
      // walk, or Audio Divina) side "Contemplation … in silence" while every
      // in-app surface named it correctly, and this file's whole contract is
      // "exactly what's on the home screen".
      { active: r.morningContemplationActive, done: r.morningContemplationDone, slot: "morning", key: "contemplation-morning", ...contemplationSideFace("Morning", r.morningContemplationKind), cta: "Begin", kind: "office" },
      // The solo "Silence" goal card — shown whenever there's a minutes goal
      // but no per-side contemplation card carries it (same gate as rawCards'
      // "silence" card in DailyProgressBody). Was missing entirely, which
      // undercounted totalAnchors/dots for the default guest shape.
      { active: r.silenceGoalCardActive, done: r.silenceGoalCardDone, slot: "anytime", key: "silence", emoji: "🕯️", title: "Contemplation", eyebrow: "Contemplative Prayer", subtitle: "Loving God in silence", cta: "Begin", kind: "office" },
      // (contemplationSideFace lives just above this list's builder.)
      // cobreatheStandaloneActive (not raw cobreatheActive) — when Creation
      // Prayer is riding as the per-side Morning/Evening Contemplation card
      // instead, the standalone card above is suppressed (same gate as
      // rawCards), so this must be too or it double-counts.
      { active: r.cobreatheStandaloneActive, done: r.cobreatheDone, slot: getPracticeSlot("cobreathe"), key: "cobreathe", emoji: "🌍", title: "Creation Prayer", eyebrow: "A prayer for the earth", subtitle: "Breathing together with God's creation", cta: "Begin", kind: "office" },
      { active: r.listeningActive, done: r.listeningDone, slot: getPracticeSlot("listening"), key: "listening", emoji: "🎵", title: "Audio Divina", eyebrow: "Audio Divina", subtitle: "Connecting with God through music", cta: "Begin", kind: "reflect" },
      { active: r.podcastsActive, done: r.podcastsDone, slot: "afternoon" as CustomSlot, key: "podcasts", emoji: "🎙️", title: "Podcasts", eyebrow: "A podcast episode", subtitle: "Log what you listened to", cta: "Log", kind: "reflect" },
      { active: r.walkActive, done: r.walkDone, slot: getPracticeSlot("walk"), key: "walk", emoji: "🚶", title: "Contemplative Walk", eyebrow: "Prayer in motion", subtitle: "A walk as prayer", cta: "Log", kind: "office" },
      { active: r.visioActive, done: r.visioDone, slot: getPracticeSlot("visio"), key: "visio", emoji: "🖼️", title: "Visio Divina", eyebrow: "Return", subtitle: "Pray with today's image", cta: "Begin", kind: "office" },
      // Compline rides the evening slot — same fixed placement the home card
      // and the header dot use (it IS the night office, so no slot picker).
      { active: r.complineActive, done: r.complineDone, slot: "evening", key: "compline", emoji: "🌙", title: "Compline", eyebrow: "The night office", subtitle: "The night office", cta: "Begin", kind: "office" },
      { active: r.readingActive, done: r.readingDone, slot: getPracticeSlot("reading"), key: "reading", emoji: "📚", title: "Reading", eyebrow: "Your reading rule", subtitle: "Log what you read", cta: "Log", kind: "office" },
      // Prayer List is NOT a routine anchor here either — same exclusion as
      // DailyProgressBody.tsx (see its comment there): it's woven into the
      // offices and gets its own always-visible section, not a Next/Done slot,
      // so it must never preempt the real next-up item (it used to, via its
      // "anytime" slot outranking Evening Prayer for any account with an
      // active, undone list).
      // Suppressed when a side's own anchor IS the Examen (already rendered
      // above via officeTitle's "The Examen" rename) — same gate as
      // rawCards' standalone Examen card, else the widget could show it twice.
      { active: r.examenActive && getSideLevel("morning") !== "examen" && getSideLevel("evening") !== "examen", done: r.examenDone, slot: getPracticeSlot("examen"), key: "examen", emoji: "🌗", title: "The Examen", eyebrow: "Review the day", subtitle: "Review the day with God", cta: "Begin", kind: "office" },
      // The active novena — same novenaActive/Done DailyProgressBody's card
      // and the header pill's dot use, so the widget can't drift from either.
      { active: !!(r.novenaActive && !r.novenaReplacesMorning && !r.novenaReplacesEvening), done: r.novenaDone, slot: "anytime", key: "novena", emoji: "🕊️", title: r.novena?.title ?? "Novena", eyebrow: "Novena", subtitle: r.novena ? `Day ${r.novena.currentDay} of ${r.novena.dayCount}` : "", cta: "Begin", kind: "office" },
      { active: r.eveningContemplationActive, done: r.eveningContemplationDone, slot: "evening", key: "contemplation-evening", ...contemplationSideFace("Evening", r.eveningContemplationKind), cta: "Begin", kind: "office" },
      { active: r.eveningActive && !r.novenaReplacesEvening, done: r.eveningDone, slot: "evening", key: "evening", emoji: officeEmoji("evening"), title: officeTitle("Evening"), eyebrow: officeEyebrow("Evening"), subtitle: officeSubtitle(false), cta: getSideLevel("evening") === "custom" ? "Mark done" : "Begin", kind: "office", isPrimary: true },
      { active: !!r.eveningExtraLevel, done: r.eveningExtraDone, slot: "evening", key: "extra-evening", emoji: (r.eveningExtraLevel && EXTRA_EMOJI[r.eveningExtraLevel]) || "🌿", title: r.eveningExtraLevel ? extraPracticeTitle("Evening", r.eveningExtraLevel, tPass) : "", eyebrow: "Also this evening", subtitle: "Alongside your main practice", cta: "Begin", kind: "office" },
      { active: !!(r.novenaReplacesEvening && r.novenaActive), done: r.novenaDone, slot: "evening", key: "novena", emoji: "🕊️", title: r.novena?.title ?? "Novena", eyebrow: "Novena", subtitle: r.novena ? `Day ${r.novena.currentDay} of ${r.novena.dayCount}` : "", cta: "Begin", kind: "office", isPrimary: true },
      ...r.customAnchors.filter((a) => !a.skipped).map((a) => ({
        active: true, done: !!a.done, slot: a.slot,
        key: `custom-${a.id}`, emoji: a.emoji || "🌿",
        title: a.title, eyebrow: "Your practice", subtitle: "Tap to mark done", cta: "Mark done", kind: "office" as const,
      })),
    ];

    const active = items.filter((i) => i.active);
    // Stable sort by time-of-day slot (Array.prototype.sort is stable), then —
    // within a slot — the office/replacing-novena item first, so "what's next"
    // always surfaces the morning/evening anchor over an add-on sharing that
    // slot (e.g. Morning Contemplation as an extra, alongside Morning Prayer).
    const slotOrdered = [...active].sort((a, b) => {
      const slotDiff = SLOT_RANK[a.slot] - SLOT_RANK[b.slot];
      if (slotDiff !== 0) return slotDiff;
      return (a.isPrimary ? 0 : 1) - (b.isPrimary ? 0 : 1);
    });
    /**
     * The accent ramp is assigned by BUILD position, before the user's own
     * order is applied — the same two-step the home runs (colour before sort,
     * so dragging a card up doesn't repaint the whole rhythm), through the
     * same rhythmGradientRgb.
     */
    const withRgb = slotOrdered.map((it, i) => ({ ...it, rgb: rhythmGradientRgb(i, slotOrdered.length) }));
    /**
     * THE PERSON'S OWN ORDER, via the same sortCardsByUserOrder the home's
     * Next list runs — the items carry real home-card keys for exactly this.
     * Without it the widget's "next two" could disagree with the top of the
     * person's own list, which is the drift this file's contract forbids.
     */
    const ordered = sortCardsByUserOrder(withRgb);
    // "Next" = the first not-done practice whose slot HASN'T already passed
    // today (a passed slot is "tomorrow", not next). Falls back to summary.
    const upNext = ordered.filter((i) => !i.done && !isSlotPast(i.slot, now));
    const next = upNext[0] ?? null;
    /**
     * The wide widget's card list — the next TWO, wearing the home card's
     * exact face: emoji, title, blurb, CTA, accent colour by ramp position,
     * card-tint by stack position, and the dimmed "Later" state for a slot
     * that hasn't opened (the home's own gate, isSlotOpen).
     */
    const nextCards = upNext.slice(0, 2).map((i, idx) => ({
      emoji: i.emoji,
      title: i.title,
      subtitle: i.subtitle,
      cta: i.cta,
      rgb: i.rgb,
      tint: upNext.length <= 1 ? 0.4 : idx / (upNext.length - 1),
      later: !isSlotOpen(i.slot, now),
    }));

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
    // Settings → Home display → Weekly Progress governs the widget's grid too.
    // widgetSync never read the key, so turning the weekly card off on the home
    // left the same seven-day grid sitting on the Home Screen — the one place
    // you can't dismiss it. Same key settings.tsx and the card itself write.
    const weeklyHidden = (() => {
      try { return localStorage.getItem("phoebe:hide-turn-learn-pray") === "1"; } catch { return false; }
    })();

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
      weeklyLabels: weeklyHidden ? [] : weekly.rows.map((row) => row.label),
      weeklyEmoji: weeklyHidden ? [] : weekly.rows.map((row) => row.emoji),
      weeklyGrid: weeklyHidden ? [] : weekly.rows.map((row) => row.kept),
      weeklyPartial: weeklyHidden ? [] : weekly.rows.map((row) => row.partial),
      weeklyDayInitials: weeklyHidden ? [] : weekly.dayInitials,
      nextCards,
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
    r.walkActive, r.walkDone, r.visioActive, r.visioDone, r.complineActive, r.complineDone,
    // podcastsActive/Done are READ by this effect (the Way of Love item) and
    // were missing here, while prayerListActive/Done were listed but never
    // read — the Prayer List is deliberately excluded from the widget's items.
    // So logging a podcast changed nothing the effect depended on and the
    // widget kept showing it as next-up until some unrelated refresh.
    r.readingActive, r.readingDone, r.podcastsActive, r.podcastsDone,
    r.examenActive, r.examenDone,
    // The second practice — read at the items above, so the effect has to wake
    // when it changes. Without these the widget kept showing it undone (and as
    // next-up) until an unrelated refetch happened to push a new state.
    r.morningExtraLevel, r.morningExtraDone, r.eveningExtraLevel, r.eveningExtraDone,
    r.novenaActive, r.novenaDone, r.novena?.currentDay, r.novena?.title, r.novenaReplacesMorning, r.novenaReplacesEvening,
    // Read at the rows above — flipping a side's KIND (or the derived
    // standalone/goal-card gates) must wake the push, or the widget wears the
    // old face until an unrelated refetch.
    r.morningContemplationKind, r.eveningContemplationKind,
    r.cobreatheStandaloneActive, r.silenceGoalCardActive, r.silenceGoalCardDone,
    customSig, orderSig, r.prayerKind, r.streak, r.contemplationMin, r.contemplationGoalMin,
    prayedWithQ.data, coPrayersQ.data, prayerReqsQ.data, cacMetaQ.data,
  ]);
}

export function WidgetSync(): null {
  useWidgetSync();
  return null;
}
