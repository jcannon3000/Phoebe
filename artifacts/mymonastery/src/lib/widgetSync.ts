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
import { useEffectiveReflectionSource } from "@/lib/officePrefs";

type WidgetState = {
  // Dynamic "what's next" hero — the medium widget's headline card.
  heroKind: "office" | "reflect" | "summary";
  heroTitle: string;
  heroSubtitle: string;
  heroCta: string;        // "" → no button (summary state)
  heroDeepLink: string;   // universal link the widget tap opens
  // Rhythm stats — kept for the lock-screen / small accessory families.
  streakDays: number;
  prayedToday: boolean;
  nextOffice: string;
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

  useEffect(() => {
    if (!enabled) return;
    const days = officeQ.data?.days ?? [];
    if (days.length === 0) return;

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

    let heroKind: WidgetState["heroKind"];
    let heroTitle: string;
    let heroSubtitle: string;
    let heroCta: string;
    let nextOffice = "";

    if (hero.kind === "office") {
      const isMorning = hero.side === "morning";
      heroKind = "office";
      heroTitle = isMorning ? "Morning Prayer" : "Evening Prayer";
      nextOffice = heroTitle;
      heroSubtitle = withYou > 0
        ? `${withYou} ${withYou === 1 ? "person" : "people"} prayed with you this week`
        : isMorning ? "Begin the day with the office" : "Mark the day's end with the office";
      heroCta = "Begin prayer";
    } else if (hero.kind === "reflect") {
      heroKind = "reflect";
      heroTitle = REFLECTION_NAME[reflectionSource] ?? "Today's reflection";
      heroSubtitle = (reflectionSource === "cac" ? cacMetaQ.data?.title : "") || "Today's reflection";
      heroCta = "Read";
    } else {
      heroKind = "summary";
      heroTitle = "The day is kept";
      heroSubtitle = `${withYou} prayed with you · you prayed for ${youFor}`;
      heroCta = "";
    }

    const bridge = (window as unknown as { PhoebeNative?: WidgetBridge }).PhoebeNative;
    bridge?.updateWidget?.({
      heroKind,
      heroTitle,
      heroSubtitle,
      heroCta,
      heroDeepLink: HOME_URL,
      streakDays: streakQ.data?.streak ?? 0,
      prayedToday: morningDone || eveningDone,
      nextOffice,
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
  ]);
}

export function WidgetSync(): null {
  useWidgetSync();
  return null;
}
