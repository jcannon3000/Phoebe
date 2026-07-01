import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { getSideLevel, getSideEntry, type OfficeSide } from "@/lib/officePrefs";

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
    defaultPrayerLevel?: "ask" | "devotion" | "office" | "intercessions" | "reflect-sit" | "journal";
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

    // Which side to pray. An explicit ?side= (set by a Morning/Evening card)
    // WINS over the clock, so tapping "Morning Devotion" after noon still opens
    // the MORNING office instead of the time-of-day default flipping it to
    // evening. Falls back to the clock (before noon → morning) otherwise.
    const hourNow = new Date().getHours();
    const sideParam = (() => {
      try { return new URLSearchParams(window.location.search).get("side"); }
      catch { return null; }
    })();
    const isMorning = sideParam === "morning" ? true : sideParam === "evening" ? false : hourNow < 12;
    const side: OfficeSide = isMorning ? "morning" : "evening";

    // Per-side depth override (Morning/Evening split) wins; otherwise the
    // shared server default; otherwise "ask".
    const defaultPrayerLevel = getSideLevel(side) ?? officePrefs?.defaultPrayerLevel ?? "ask";

    // Contemplation as a side's prayer — open the silence timer directly
    // (NOT the Forward Day by Day reflection). Self-contained (sets its own
    // length, logs its own contemplation session), so route straight there
    // regardless of time of day or prayed-today state.
    if (defaultPrayerLevel === "reflect-sit") {
      setLocation("/contemplation?begin=1", { replace: true });
      return;
    }

    // "Journal" — a private daily reflection. Self-contained (writes its
    // own entry, logs its own journal prayer-session), so route straight
    // there regardless of time of day or prayed-today state.
    if (defaultPrayerLevel === "journal") {
      setLocation("/journal", { replace: true });
      return;
    }

    // Praying the Psalms IS this side's prayer → open the psalms reader directly
    // (begin=1 skips the "before you begin" intro — they already chose psalms).
    if (defaultPrayerLevel === "psalms") {
      setLocation(`/psalms?office=${side}&begin=1`, { replace: true });
      return;
    }
    // The Examen IS this side's prayer → open the Examen directly (self-contained,
    // logs its own session), regardless of time of day or prayed-today state.
    if (defaultPrayerLevel === "examen") {
      setLocation("/examen", { replace: true });
      return;
    }
    // Forward Day by Day IS this side's prayer → its home card (the office slot)
    // opens the reading / plays the audio per the user's choice, so land on the
    // home rather than the generic prayer chooser.
    if (defaultPrayerLevel === "fdd") {
      setLocation("/dashboard", { replace: true });
      return;
    }
    // Creation Prayer IS this side's prayer → the creation-focused devotion
    // (opens with Co-Breathe, then the creation Psalter + prayers).
    if (defaultPrayerLevel === "creation") {
      setLocation(`/creation-devotion?mode=creation-${side}&picked=1`, { replace: true });
      return;
    }

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

    // Honor the depth the user actually set for this side. We no longer
    // override to Compline after 8pm — if they've chosen Evening Prayer
    // (office) or Evening Devotion, the home card takes them there, not to
    // Compline. (Compline stays reachable from the chooser / first-slide pills.)
    const devotionMode = isMorning ? "morning-devotion" : "early-evening-devotion";
    const officeModeForLink = isMorning ? "morning" : "evening";
    const reset = prayedToday ? "&reset=1" : "";
    const devotionHref = `/bcp/daily-devotions?mode=${devotionMode}${reset}`;
    // When this side's way-to-pray is "listen", begin-prayer drops straight
    // into the synced "pray along" office and flags the full daily flow
    // (flow=daily) so it continues into the community intercessions + closing
    // afterward. Otherwise the text office (which runs the same full flow via
    // its intercessions portal).
    const officeHref = getSideEntry(side) === "listen"
      ? `/podcast/${officeModeForLink}-office?flow=daily`
      : `/bcp/daily-office?mode=${officeModeForLink}${reset}`;
    const intercessionsHref = prayedToday ? "/prayer-mode?reset=1" : "/prayer-mode";

    const ctaHref =
      defaultPrayerLevel === "intercessions" ? intercessionsHref
      : defaultPrayerLevel === "office" ? officeHref
      : devotionHref;

    setLocation(ctaHref, { replace: true });
  }, [authLoading, user, officePrefs, officeHistory, prefsLoading, historyLoading, setLocation]);

  // Render a full-screen office-colored field (NOT a blank/white frame) while
  // we resolve the destination. Tapping the home card then fades dark → dark
  // into the office's own fade-up entrance, instead of flashing white between
  // two dark screens — which is what made the hand-off feel abrupt.
  return <div style={{ minHeight: "100dvh", background: "#091A10" }} />;
}
