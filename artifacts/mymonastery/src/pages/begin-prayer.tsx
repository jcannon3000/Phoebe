import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { getSideLevel, getSideEntry, getSideContemplation, OFFICE_LEVELS_SET, type OfficeLevel, type OfficeSide } from "@/lib/officePrefs";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";
import { getOfficeBackdrop, officeVeilBg } from "@/lib/officeDisplay";
import { getReadingsTodayUrl, recordReadingsOpened } from "@/lib/cacReadState";
import { openExternalThenMarkRead } from "@/lib/openExternal";

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

    /**
     * ?practice=<level> — open THAT practice on this side, whatever the side's
     * own anchor is.
     *
     * A side can carry a second practice alongside its anchor (see
     * getSideExtra), and its card has to lead somewhere real. Overriding the
     * level here rather than routing the card itself means the second practice
     * reaches its page through the SAME brain the anchor does — the Venite
     * hand-off, the readings' Forward Movement open, the psalms reader — all of
     * which live below and none of which are worth a second copy.
     */
    const practiceOverride = (() => {
      try {
        const raw = new URLSearchParams(window.location.search).get("practice");
        return raw && (OFFICE_LEVELS_SET as Set<string>).has(raw) ? (raw as OfficeLevel) : null;
      } catch { return null; }
    })();

    // Per-side depth override (Morning/Evening split) wins; otherwise the
    // shared server default; otherwise "ask".
    const defaultPrayerLevel = practiceOverride ?? getSideLevel(side) ?? officePrefs?.defaultPrayerLevel ?? "ask";

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

    // Compline IS this side's office → open the night office directly. Like
    // psalms/examen above it's self-contained (stamps its own office flag on
    // completion), so it needs no time-of-day or prayed-today branching.
    if (defaultPrayerLevel === "compline") {
      setLocation(`/bcp/daily-office?mode=compline`, { replace: true });
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
    /**
     * Daily Scripture Readings IS this side's prayer.
     *
     * Owner: the lectionary readings go through Forward Movement, "but you
     * could also send them through Venite." So the side's own format decides,
     * the same way it does for the office — Venite carries the day's appointed
     * lessons inside the office, and someone who has chosen Venite as how they
     * read shouldn't be handed a different site for this one anchor.
     *
     * Anything else keeps the Forward Movement hand-off, which now actually
     * OPENS the readings rather than just landing on the home.
     */
    if (defaultPrayerLevel === "readings") {
      if (getSideEntry(side) === "venite") {
        // Computed inline: the shared officeModeForLink/reset are declared
        // further down, and this branch returns long before them.
        const mode = isMorning ? "morning" : "evening";
        // No &reset= here: prayedToday is computed further down, and a Venite
        // hand-off doesn't resume a slide position anyway — the deck opens only
        // to pass them straight to the browser.
        setLocation(`/bcp/daily-office?mode=${mode}&venite=1`, { replace: true });
        return;
      }
      // Open the readings HERE, rather than handing off to a card and hoping
      // it mounts and notices. Reported twice: "morning scripture reading isn't
      // going forward, it just refreshes the home screen." The ?readings= param
      // only works if the ReadingsHomeCard happens to be rendered on the
      // dashboard for that side — a lot of conditions between a tap and a
      // lectionary. The tap that got us here is the user gesture, so opening
      // directly is both simpler and more reliable.
      openExternalThenMarkRead(
        getReadingsTodayUrl(),
        () => recordReadingsOpened({ side }),
      );
      setLocation("/dashboard", { replace: true });
      return;
    }
    // A practice the user named themselves IS this side's prayer → there's no
    // dedicated page for it (the home card is a plain tap-to-mark-done), so
    // land on the home the same way "fdd" above does.
    if (defaultPrayerLevel === "custom") {
      setLocation("/dashboard", { replace: true });
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
    // Only when nothing more specific was asked for — an explicit ?practice=
    // is the whole point of the override, and this flag would swallow it.
    if (!practiceOverride && getSideContemplation(side)) {
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
    /**
     * The devotion, on Venite when that is how they pray.
     *
     * Owner: "for any practice that uses Venite, like Daily Scripture Reading
     * or Devotion, have it open straight to Venite. I had Devotion as a second
     * morning practice and it was going to an opening office slide first."
     *
     * Only the full OFFICE and the readings consulted the entry before this;
     * the devotion always went to the Phoebe deck, so someone who prays on
     * venite.app got their own site for one practice and Phoebe's slides for
     * another. Venite serves the Daily Devotions as a {version} rather than an
     * {office} — see lib/venite — so the hand-off is real, not a redirect to
     * the full office.
     *
     * `entry` is read below, so this is a function rather than a value.
     */
    const devotionHrefFor = (e: string | null) => (e === "venite"
      ? `/bcp/daily-devotions?mode=${devotionMode}${reset}&picked=1&venite=1`
      : `/bcp/daily-devotions?mode=${devotionMode}${reset}`);
    // Route straight into the reader's saved "way to pray" for this side —
    // this used to only special-case "listen", so a Physical-BCP or Watch
    // default still landed on the digital text office (this is the routing
    // brain shared by the dashboard CTA and the iOS "Begin prayer" shortcut,
    // so that bug hit both). "listen" drops into the synced "pray along"
    // office and flags the full daily flow (flow=daily) so it continues into
    // the community intercessions + closing afterward. "watch" (Morning only,
    // weekday — the Cathedral has no evening/weekend broadcast) opens the
    // live stream directly, same as the in-office picker's redirect. "book"
    // opens the text office with &book=1, which jumps straight to the
    // physical-book page-number guide instead of the slide deck (mirrors
    // OfficeMethodCard/beginOffice's handling elsewhere in the office flow).
    // Anything else (including "watch" outside its Morning-weekday window)
    // falls through to the text office.
    const entry = getSideEntry(side);
    const isWeekday = (() => { const d = new Date().getDay(); return d >= 1 && d <= 5; })();
    const officeHref =
      entry === "listen" ? `/podcast/${officeModeForLink}-office?flow=daily`
      : entry === "watch" && isMorning && isWeekday ? "/ncmp/watch"
      : entry === "book" ? `/bcp/daily-office?mode=${officeModeForLink}${reset}&book=1`
      // Owner: "if they have Venite as the default, we want to go straight to
      // the web from the routine card." The intro slide was the escape hatch
      // for changing your mind — that now lives in the browser's own Options
      // menu, so stopping at a chooser they already answered in Settings is a
      // tap that buys nothing. The deck still mounts (venite=1), which is what
      // keeps the dwell test, the credit-on-return and Options working.
      : entry === "venite" ? `/bcp/daily-office?mode=${officeModeForLink}${reset}&venite=1`
      : `/bcp/daily-office?mode=${officeModeForLink}${reset}`;
    const intercessionsHref = prayedToday ? "/prayer-mode?reset=1" : "/prayer-mode";

    const ctaHref =
      defaultPrayerLevel === "intercessions" ? intercessionsHref
      : defaultPrayerLevel === "office" ? officeHref
      : devotionHrefFor(entry);

    setLocation(ctaHref, { replace: true });
  }, [authLoading, user, officePrefs, officeHistory, prefsLoading, historyLoading, setLocation]);

  // Render a full-screen field in the SAME color the office's own loading
  // veil is about to mount with (not a hardcoded green) — a user on the
  // Paper or Water backdrop was getting a green screen here that then
  // snapped to their real cream/blue backdrop the instant the veil arrived,
  // which read as a flash. Tapping the home card now fades dark/paper/water
  // → the SAME dark/paper/water into the office's own fade-up entrance.
  return <div style={{ minHeight: "100dvh", background: officeVeilBg(getOfficeBackdrop()) }} />;
}
