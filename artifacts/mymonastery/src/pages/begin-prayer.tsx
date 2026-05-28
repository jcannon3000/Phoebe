import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// /begin-prayer — landing page for the iOS "Begin prayer" home-screen
// shortcut. iOS quick actions are static (configured in Info.plist),
// but the home dashboard's "Begin prayer" CTA is dynamic — it picks
// between intercessions, Morning/Evening Prayer, daily devotion, or
// Compline based on the user's `defaultPrayerLevel` setting + current
// time of day + whether they've already prayed today.
//
// Rather than hard-code one of those destinations into the Swift
// shortcut handler (which would freeze the logic in native code and
// require an app rebuild whenever the routing changes), the shortcut
// just opens this path. We compute the same ctaHref the dashboard
// computes, then `setLocation(..., { replace: true })` so the back
// button skips this landing entirely.
//
// Unauthed users get bounced to /pray — same fallback the rest of the
// app uses for auth-gated surfaces hit cold.
export default function BeginPrayerPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: officePrefs, isLoading: prefsLoading } = useQuery<{
    defaultPrayerLevel?: "ask" | "devotion" | "office" | "intercessions";
  }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    enabled: !!user,
  });

  const { data: officeHistory, isLoading: historyLoading } = useQuery<{
    days: Array<{ ymd: string; morning: boolean; evening: boolean }>;
  }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    enabled: !!user,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLocation("/pray", { replace: true });
      return;
    }
    if (prefsLoading || historyLoading) return;

    const defaultPrayerLevel = officePrefs?.defaultPrayerLevel ?? "ask";

    // "ask" (the out-of-box default) → show the prayer chooser, the
    // options screen with the last-prayed depth pinned on top. Only an
    // explicit per-depth default (devotion/office/intercessions) skips
    // the chooser and drops straight in. Unknown/legacy values fall
    // through to the chooser too — safest default.
    if (defaultPrayerLevel === "ask"
        || (defaultPrayerLevel !== "devotion"
            && defaultPrayerLevel !== "office"
            && defaultPrayerLevel !== "intercessions")) {
      setLocation("/prayer-chooser", { replace: true });
      return;
    }

    // Same time-of-day buckets the dashboard uses (see
    // dashboard.tsx ~line 2777).
    const hourNow = new Date().getHours();
    const isMorning = hourNow < 12;
    const isNight = hourNow >= 20;

    // "Prayed today" — server is authoritative; local flags are a
    // sync-immediate fallback for the moment right after the office
    // viewer writes them. We only consult the side that matches the
    // current half-of-day so a morning completion doesn't suppress
    // the fresh "Begin prayer" CTA in the evening.
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const serverDays = officeHistory?.days ?? [];
    const todayServer = serverDays[serverDays.length - 1];
    let prayedToday = false;
    if (todayServer && todayServer.ymd === todayKey) {
      if (isMorning && todayServer.morning) prayedToday = true;
      if (!isMorning && todayServer.evening) prayedToday = true;
    }
    if (!prayedToday) {
      const sideModes = isMorning
        ? ["morning", "morning-devotion"]
        : ["evening", "early-evening-devotion", "compline"];
      try {
        for (const mode of sideModes) {
          if (localStorage.getItem(`phoebe:office-completed:${mode}:${todayKey}`)) {
            prayedToday = true;
            break;
          }
        }
      } catch {
        // localStorage unavailable — leave prayedToday false.
      }
    }

    // Same href construction as dashboard's ctaHref. Compline after
    // 8pm wins for both office and devotion levels — it's the BCP's
    // night office and the natural fit for both depths at that hour.
    const devotionMode = isMorning ? "morning-devotion" : "early-evening-devotion";
    const officeModeForLink = isMorning ? "morning" : "evening";
    const reset = prayedToday ? "&reset=1" : "";
    const devotionHref = `/bcp/daily-devotions?mode=${devotionMode}${reset}`;
    const officeHref = `/bcp/daily-office?mode=${officeModeForLink}${reset}`;
    const complineHref = `/bcp/daily-office?mode=compline${reset}`;
    const intercessionsHref = prayedToday ? "/prayer-mode?reset=1" : "/prayer-mode";

    const ctaHref =
      defaultPrayerLevel === "intercessions" ? intercessionsHref
      : isNight ? complineHref
      : defaultPrayerLevel === "office" ? officeHref
      : devotionHref;

    setLocation(ctaHref, { replace: true });
  }, [authLoading, user, officePrefs, officeHistory, prefsLoading, historyLoading, setLocation]);

  // Render nothing — the user shouldn't perceive this page; on most
  // devices the navigation lands before paint. If routing somehow
  // stalls, the white frame is still less alarming than a flash of
  // dashboard chrome we'd then redirect away from.
  return null;
}
