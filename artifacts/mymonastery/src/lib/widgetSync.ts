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

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";
import { useEffectiveReflectionSource, getSideLevel } from "@/lib/officePrefs";

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
  morningDone: boolean;
  reflectDone: boolean;
  eveningDone: boolean;
  reflectAvailable: boolean;
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
  const officePrefsQ = useQuery<{ defaultPrayerLevel?: "devotion" | "office" | "intercessions" }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    enabled,
    staleTime: 60_000,
  });

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
    const reflectDone = !!read.cac || !!read.fdd || !!read.ssje;
    const reflectAvailable = reflectionSource !== "none";
    const afternoon = new Date().getHours() >= 15;

    // ── Mirror dashboard.tsx homeHero resolver exactly ──────────────────────
    type Hero =
      | { kind: "office"; side: "morning" | "evening" }
      | { kind: "reflect" }
      | { kind: "summary" };
    const hero: Hero = (() => {
      if (morningDone && reflectDone && eveningDone) return { kind: "summary" };
      if (!afternoon) {
        if (!morningDone) return { kind: "office", side: "morning" };
        if (!reflectDone && reflectAvailable) return { kind: "reflect" };
        return { kind: "office", side: "evening" };
      }
      if (!eveningDone) return { kind: "office", side: "evening" };
      if (!reflectDone && reflectAvailable) return { kind: "reflect" };
      return { kind: "office", side: "evening" };
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

    // Daily-progress anchors: the two offices always count; the reflection
    // counts only when the user has a source set. doneCount/totalAnchors drive
    // the widget's progress dots + "X of Y today".
    const anchors = [morningDone, eveningDone, ...(reflectAvailable ? [reflectDone] : [])];
    const totalAnchors = anchors.length;
    const doneCount = anchors.filter(Boolean).length;

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
      morningDone,
      reflectDone,
      eveningDone,
      reflectAvailable,
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
  ]);
}

export function WidgetSync(): null {
  useWidgetSync();
  return null;
}
