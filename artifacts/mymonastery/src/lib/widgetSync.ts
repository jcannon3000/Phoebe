/**
 * Feeds the iOS Home Screen widget (PhoebeWidget) the SAME dynamic
 * "what's next" hero the home screen shows: Morning Prayer → the primary
 * reflection → Evening Prayer, then a "day is kept" community summary once
 * everything's done. The resolver below mirrors `homeHero` in dashboard.tsx
 * so the widget and the home never disagree.
 *
 * Native only: on web `PhoebeNative` is undefined and every fetch is gated
 * off, so this is a true no-op. Mount <WidgetSync /> once where the app
 * lands; react-query keeps the small fetches shared with the rest of the app.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";
import { useEffectiveReflectionSource, getSideLevel } from "@/lib/officePrefs";
import {
  hasReadCacToday, hasReadFddToday, hasReadSsjeToday,
  CAC_READ_EVENT, FDD_READ_EVENT, SSJE_READ_EVENT,
} from "@/lib/cacReadState";

type WidgetState = {
  // Dynamic "what's next" hero — the medium widget's headline card.
  heroKind: "office" | "reflect" | "summary";
  // The small eyebrow above the title — mirrors the home hero card ("Book of
  // Common Prayer" for the office, the publication for the reflection).
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCta: string;        // "" → no button (summary state)
  heroDeepLink: string;   // universal link the widget tap opens
  // Rhythm stats — kept for the lock-screen / small accessory families.
  streakDays: number;
  prayedToday: boolean;
  nextOffice: string;
  // New prayer requests waiting for the viewer — the lock-screen rectangular
  // widget leads with "N prayer requests waiting" when this is > 0.
  newPrayersCount: number;
  // Daily rhythm progress — how many of today's core anchors (Morning office,
  // the day's reflection, Evening office) are done, so the widget reflects how
  // far through the rhythm the day is. reflectAvailable is false when the user
  // has no reflection source, so the widget skips that anchor.
  doneCount: number;
  totalAnchors: number;
  // One 1/0 per ACTIVE rhythm anchor today, in home-pill order (Morning ·
  // Reflection · Silence · Evening · Steps) — drives the widget's dots.
  dots: number[];
  morningDone: boolean;
  reflectDone: boolean;
  eveningDone: boolean;
  reflectAvailable: boolean;
  // Today's contemplation minutes + the daily goal (0 = no goal) — the
  // lock-screen "Today" widget shows the minutes/goal + a progress ring.
  contemplationMin: number;
  contemplationGoalMin: number;
  updatedAt: string;
};
type WidgetBridge = { updateWidget?: (s: Partial<WidgetState>) => void };

// The reflection card's headline name, by effective source. Mirrors the
// CacHomeCard / FddHomeCard / SsjeHomeCard titles on home.
const REFLECTION_NAME: Record<string, string> = {
  cac: "CAC Daily Reflection",
  fdd: "Forward Day by Day",
  ssje: "Brother, Give Us a Word",
};

// Tapping the widget opens the app on home, where the identical hero (with
// its Begin/Read action) is the first thing — so the widget and its tap
// target always agree. The appUrlOpen router (native-shell) handles it.
const HOME_URL = "https://withphoebe.app/";

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function useWidgetSync(): void {
  const { user } = useAuth();
  const native = isNativeShell();
  const enabled = !!user && native;

  // Effective reflection source is derived synchronously from prefs —
  // cheap, no fetch, safe to call on web.
  const reflectionSource = useEffectiveReflectionSource();

  const officeQ = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean }> }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    enabled,
    staleTime: 60_000,
  });
  const streakQ = useQuery<{ streak: number }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    enabled,
    staleTime: 60_000,
  });
  const readQ = useQuery<{ cac?: boolean; fdd?: boolean; ssje?: boolean }>({
    queryKey: ["/api/me/reflections-read"],
    queryFn: () => apiRequest("GET", "/api/me/reflections-read"),
    enabled,
    staleTime: 60_000,
  });
  // Today's CAC headline for the reflect hero's subtitle (the only source
  // with a per-day title endpoint; fdd/ssje fall back to a generic line).
  const cacMetaQ = useQuery<{ title?: string }>({
    queryKey: ["/api/cac/today-meta"],
    queryFn: () => apiRequest("GET", "/api/cac/today-meta"),
    enabled: enabled && reflectionSource === "cac",
    staleTime: 30 * 60_000,
  });
  // Community summary counts for the "day is kept" hero.
  const prayedWithQ = useQuery<{ people?: unknown[]; total?: number }>({
    queryKey: ["/api/prayer-streak/community-prayed-week"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak/community-prayed-week"),
    enabled,
    staleTime: 5 * 60_000,
  });
  const coPrayersQ = useQuery<{ people?: unknown[] }>({
    queryKey: ["/api/prayer-streak/co-prayers-week"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak/co-prayers-week"),
    enabled,
    staleTime: 5 * 60_000,
  });
  // New prayer requests waiting — same source + filter the dashboard's
  // "N prayer requests waiting" card uses (requests only, not own, not yet
  // amened/answered/closed). React Query dedupes with the dashboard fetch.
  const prayerReqsQ = useQuery<Array<{ isAnswered?: boolean; isOwnRequest?: boolean; closedAt?: string | null; myAmenedEver?: boolean }>>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled,
    staleTime: 60_000,
  });
  // Prayer level → so the office hero reads "Devotion"/"Prayer" exactly like the
  // home PrayerOfficeCard (the user prefers a Devotion, so the widget should
  // say "Evening Devotion", not "Evening Prayer").
  const officePrefsQ = useQuery<{ defaultPrayerLevel?: "devotion" | "office" | "intercessions"; contemplationGoalMinutes?: number; morning?: string; evening?: string; dailyStepGoal?: number; dailyStepReachedDate?: string | null }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    enabled,
    staleTime: 60_000,
  });
  // Today's contemplation minutes (Phoebe sits + Apple Health mindful minutes,
  // the same combination useRhythmState uses) — for the lock-screen "Today"
  // widget's "N of M min" + progress ring. The goal comes from office-prefs.
  const widgetStartOfDay = new Date();
  widgetStartOfDay.setHours(0, 0, 0, 0);
  const widgetTodaySince = widgetStartOfDay.toISOString();
  const widgetTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const contStatsQ = useQuery<{ todaySeconds?: number; healthMinutesToday?: number }>({
    queryKey: ["/api/me/contemplation-stats", widgetTodaySince.slice(0, 10), widgetTz],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-stats?todaySince=${encodeURIComponent(widgetTodaySince)}&tz=${encodeURIComponent(widgetTz)}`),
    enabled,
    staleTime: 30_000,
  });

  // A reflection is read on another surface (often the in-app browser): it
  // stamps localStorage + fires a read-event, but the server read-state query
  // may still be stale. Bump on those signals (and office-pref changes) so the
  // push effect re-runs and the widget drops the reflection from "what's next"
  // the moment it's actually read.
  const [readBump, setReadBump] = useState(0);
  useEffect(() => {
    const bump = () => setReadBump((n) => n + 1);
    const evs = [CAC_READ_EVENT, FDD_READ_EVENT, SSJE_READ_EVENT, "phoebe:appactive", "phoebe:browserfinished", "phoebe:office-prefs"];
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Push even before office-history lands (or if it's empty) so the widget
    // always gets the full hero payload instead of being stuck on the bare
    // "Time to pray" no-data fallback. With no days yet, both offices read as
    // undone → the hero resolves to the morning office, which the next data
    // tick corrects.
    const days = officeQ.data?.days ?? [];

    const today = days.find((d) => d.ymd === ymd(new Date())) ?? days[days.length - 1];
    const morningDone = !!today?.morning;
    const eveningDone = !!today?.evening;
    const read = readQ.data ?? {};
    // Server read-state OR this device's localStorage — a reflection read in the
    // in-app browser stamps localStorage instantly while the server query can
    // lag, which is what left the widget showing a reflection already done as
    // "next up". Mirrors useRhythmState so the widget agrees with the home.
    const reflectDone = !!read.cac || !!read.fdd || !!read.ssje
      || hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday();
    const reflectAvailable = reflectionSource !== "none";
    // An office is part of the rhythm only when its pref isn't "none" (defaults:
    // morning "devotion", evening off) — the same gate as the home hero, so the
    // widget never offers a turned-off office as "what's next".
    const morningActive = (officePrefsQ.data?.morning ?? "devotion") !== "none";
    const eveningActive = (officePrefsQ.data?.evening ?? "none") !== "none";
    const afternoon = new Date().getHours() >= 15;

    // ── Mirror dashboard.tsx homeHero resolver (active-gated) ───────────────
    type Hero =
      | { kind: "office"; side: "morning" | "evening" }
      | { kind: "reflect" }
      | { kind: "summary" };
    const hero: Hero = (() => {
      const morningPending = morningActive && !morningDone;
      const eveningPending = eveningActive && !eveningDone;
      const reflectPending = reflectAvailable && !reflectDone;
      if (!morningPending && !eveningPending && !reflectPending) return { kind: "summary" };
      if (!afternoon) {
        if (morningPending) return { kind: "office", side: "morning" };
        if (reflectPending) return { kind: "reflect" };
        if (eveningPending) return { kind: "office", side: "evening" };
        return { kind: "summary" };
      }
      if (eveningPending) return { kind: "office", side: "evening" };
      if (reflectPending) return { kind: "reflect" };
      if (morningPending) return { kind: "office", side: "morning" };
      return { kind: "summary" };
    })();

    const withYou = prayedWithQ.data?.total ?? prayedWithQ.data?.people?.length ?? 0;
    const youFor = coPrayersQ.data?.people?.length ?? 0;
    const newPrayersCount = (prayerReqsQ.data ?? []).filter(
      (r) => !r.isAnswered && !r.isOwnRequest && !r.closedAt && !r.myAmenedEver,
    ).length;

    // Whether the user prays a Devotion (vs the full Office) — global default
    // OR either per-side level, same resolution the home card + useRhythmState
    // use. Drives "Evening Devotion" vs "Evening Prayer" so the widget reads
    // identically to the in-app hero.
    const dpl = officePrefsQ.data?.defaultPrayerLevel;
    const isDevotion = dpl === "devotion"
      || getSideLevel("morning") === "devotion"
      || getSideLevel("evening") === "devotion"
      || (dpl !== "office" && getSideLevel("morning") !== "office" && getSideLevel("evening") !== "office");

    let heroKind: WidgetState["heroKind"];
    let heroEyebrow: string;
    let heroTitle: string;
    let heroSubtitle: string;
    let heroCta: string;
    let nextOffice = "";

    if (hero.kind === "office") {
      const isMorning = hero.side === "morning";
      heroKind = "office";
      heroEyebrow = "Book of Common Prayer";
      const word = isDevotion ? "Devotion" : "Prayer";
      heroTitle = `${isMorning ? "Morning" : "Evening"} ${word}`;
      nextOffice = heroTitle;
      heroSubtitle = withYou > 0
        ? `${withYou} ${withYou === 1 ? "person" : "people"} prayed with you this week`
        : isMorning ? "Begin the day with the office" : "Mark the day's end with the office";
      heroCta = "Begin prayer";
    } else if (hero.kind === "reflect") {
      heroKind = "reflect";
      heroEyebrow = REFLECTION_NAME[reflectionSource] ?? "Today's reflection";
      heroTitle = (reflectionSource === "cac" ? cacMetaQ.data?.title : "") || REFLECTION_NAME[reflectionSource] || "Today's reflection";
      heroSubtitle = "A few minutes with the day's word";
      heroCta = "Read";
    } else {
      heroKind = "summary";
      heroEyebrow = "The day is kept";
      heroTitle = "The day is kept";
      heroSubtitle = `${withYou} prayed with you · you prayed for ${youFor}`;
      heroCta = "";
    }

    // Today's contemplation minutes + goal (also a rhythm anchor when a goal's set).
    const contemplationMin = Math.floor((contStatsQ.data?.todaySeconds ?? 0) / 60) + (contStatsQ.data?.healthMinutesToday ?? 0);
    const contemplationGoalMin = officePrefsQ.data?.contemplationGoalMinutes ?? 0;

    // Daily-progress anchors — the FULL active set, in the same order + with the
    // same done-rules as the home header pill: Morning · Reflection · Silence ·
    // Evening. `dots` (1/0 per active anchor) drives the widget dots so
    // they always match the home; doneCount/totalAnchors summarise it.
    const silenceActive = contemplationGoalMin > 0;
    const silenceDone = contemplationMin >= contemplationGoalMin;
    const dots: number[] = [
      ...(morningActive ? [morningDone ? 1 : 0] : []),
      ...(reflectAvailable ? [reflectDone ? 1 : 0] : []),
      ...(silenceActive ? [silenceDone ? 1 : 0] : []),
      ...(eveningActive ? [eveningDone ? 1 : 0] : []),
    ];
    const totalAnchors = dots.length;
    const doneCount = dots.filter((d) => d === 1).length;

    const bridge = (window as unknown as { PhoebeNative?: WidgetBridge }).PhoebeNative;
    bridge?.updateWidget?.({
      heroKind,
      heroEyebrow,
      heroTitle,
      heroSubtitle,
      heroCta,
      heroDeepLink: HOME_URL,
      streakDays: streakQ.data?.streak ?? 0,
      prayedToday: morningDone || eveningDone,
      nextOffice,
      newPrayersCount,
      doneCount,
      totalAnchors,
      dots,
      morningDone,
      reflectDone,
      eveningDone,
      reflectAvailable,
      contemplationMin,
      contemplationGoalMin,
      updatedAt: new Date().toISOString(),
    });
  }, [
    enabled,
    reflectionSource,
    officeQ.data,
    streakQ.data,
    readQ.data,
    cacMetaQ.data,
    prayedWithQ.data,
    coPrayersQ.data,
    prayerReqsQ.data,
    officePrefsQ.data,
    contStatsQ.data,
    readBump,
  ]);
}

export function WidgetSync(): null {
  useWidgetSync();
  return null;
}
