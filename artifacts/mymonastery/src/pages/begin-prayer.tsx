import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { getSideLevel, getSideEntry, getSideContemplation, type OfficeSide } from "@/lib/officePrefs";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";

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
    defaultPrayerLevel?: "ask" | "devotion" | "office" | "intercessions" | "reflect-sit";
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
    // PUBLIC no-login version: a guest prays from DEVICE prefs — the seeded
    // rule lives in localStorage and the offices below are public, so resolve
    // exactly like a signed-in user. (The old signed-out bounce went to /pray,
    // which isn't even in the guest allowlist — GuestGate threw the visitor
    // straight back to the home, so the hero's "Begin prayer" did nothing.)
    if (!user && !PHOEBE_GUEST_ENABLED) {
      setLocation("/pray", { replace: true });
      return;
    }
    // Server prefs/history only exist for a session with a user — a signed-out
    // guest's queries are disabled and would report "loading" forever.
    if (user && (prefsLoading || historyLoading)) return;

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
      // Pass the side explicitly. `side` is already resolved above, and without
      // it the sit falls back to a clock-based guess — so tapping the MORNING
      // card after 5 PM would credit the evening contemplation card instead.
      setLocation(`/contemplation?begin=1&side=${side}`, { replace: true });
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
      setLocation(`/examen?side=${side}`, { replace: true });
      return;
    }
    // Simple Guided Prayer IS this side's prayer → open it directly, side-scoped
    // (self-contained, logs its own per-side session), like Psalms above.
    if (defaultPrayerLevel === "guided-prayer") {
      setLocation(`/guided-prayer?side=${side}`, { replace: true });
      return;
    }
    // Forward Day by Day IS this side's prayer → its home card (the office slot)
    // opens the reading / plays the audio per the user's choice, so land on the
    // home rather than the generic prayer chooser.
    if (defaultPrayerLevel === "fdd") {
      // Carry the SIDE through: the home card is the only surface that knows
      // whether the reader took FDD by reading or by audio, but it can't know
      // which side sent them. With ?fdd=<side> the card stamps that side's
      // day-flag when it's actually opened — so taking FDD as morning prayer
      // keeps the morning, and doesn't also tick the evening (or the FDD
      // reflection card, which stays its own separate anchor).
      setLocation(`/dashboard?fdd=${side}`, { replace: true });
      return;
    }
    // Creation Prayer IS this side's prayer → the creation-focused devotion
    // (opens with Co-Breathe, then the creation Psalter + prayers). Hidden for
    // now — when off, a stale "creation" pref falls through to the office below.
    if (CREATION_PRAYER_ENABLED && defaultPrayerLevel === "creation") {
      setLocation(`/creation-devotion?mode=creation-${side}&picked=1`, { replace: true });
      return;
    }

    // Contemplative OR Creation Prayer set via the simplified customizer
    // (/customize) encodes as level "ask" + this side's contemplation flag ON
    // — NOT the literal "reflect-sit"/"creation" levels checked above (those
    // come only from the full rule-of-life builder, and "creation" is
    // currently flag-gated off). Without this check a Creation/Contemplative
    // Prayer side fell through to the generic BCP chooser below, landing on
    // "Devotions" — the same bug for both styles. Route to exactly what the
    // home contemplation card links to for this style (DailyProgressBody's
    // creationStyle branch): Co-Breathe direct for the Creation style, the
    // silence timer for the plain contemplative style.
    if (getSideContemplation(side)) {
      let style: "silent" | "cobreathe" = "silent";
      try { style = localStorage.getItem("phoebe:contemplation-style") === "cobreathe" ? "cobreathe" : "silent"; } catch { /* ignore */ }
      setLocation(
        style === "cobreathe" ? `/cobreathe?begin=1&side=${side}` : `/contemplation?begin=1&side=${side}`,
        { replace: true },
      );
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
