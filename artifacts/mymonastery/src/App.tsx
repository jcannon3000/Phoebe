import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider, removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { hydrateIdbCache, attachIdbPersistence } from "@/lib/idbCache";
import { installSessionOutboxFlush } from "@/lib/sessionOutbox";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { reportClientError } from "@/lib/reportClientError";
import { getGuestStepGoal } from "@/lib/guestSeed";
// Side-effect import: warms the server-clock offset on app load (re-syncs on
// foreground / every 5 min) so the Cobreathe communal breath is already aligned
// the instant a session opens — every device shares one schedule.
import "@/lib/serverClock";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NetworkBanner } from "@/components/NetworkBanner";
import { ServerDownScreen } from "@/components/ServerDownScreen";
import { GlobalButtonHaptics } from "@/components/GlobalButtonHaptics";
import { LocaleSync } from "@/components/LocaleSync";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { WebPushPermissionPrompt } from "@/components/WebPushPermissionPrompt";
import { DesktopAppPrompt } from "@/components/DesktopAppPrompt";
import { BottomPromptStack } from "@/components/BottomPromptStack";
import { ReflectionReturnRedirect } from "@/components/ReflectionReturnRedirect";
import { ReflectionPreheater } from "@/components/ReflectionPreheater";
import { OfficeAudioPreloader } from "@/components/OfficeAudioPreloader";
import { AppOpenTracker } from "@/components/AppOpenTracker";
import { ForegroundPushToast } from "@/components/ForegroundPushToast";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PageFadeOverlay } from "@/components/PageFadeOverlay";
import { WidgetSync } from "@/lib/widgetSync";
import { PodcastPlayerProvider } from "@/components/PodcastPlayer";
import { Component, useEffect, useRef, lazy, Suspense, type ReactNode, type ErrorInfo } from "react";
import { syncCustomAnchorsFromServer, type CustomAnchorSnapshot } from "@/lib/customAnchors";
import { syncRoutineFromServer, pushRoutineConfig, type RoutineConfig } from "@/lib/routineSync";
import { flushHomeLayout } from "@/lib/homeLayoutCache";
import { OFFICE_PREFS_EVENT } from "@/lib/officePrefs";
import { isChunkLoadError, recoverFromStaleChunk } from "@/lib/staleChunk";

// Scroll the window to (0, 0) on every route change. Without this,
// navigating from a form-heavy page (login, prayer-request edit, letter
// composer) on iOS leaves the WebView scrolled up to where it had
// pushed the focused input above the keyboard — so the destination
// page renders with its top bar clipped above the visible area until
// the user scrolls. The Capacitor Keyboard plugin runs in
// `resize: None` mode (capacitor.config.ts), which keeps the WebView
// height fixed but does not snap the scroll back when focus moves.
function ScrollToTopOnNavigate() {
  const [location] = useLocation();
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

// A prescribed-routine / preset-rule link (/routine/:token): a logged-out
// visitor who opened it stashes the token before "Sign in to add this rhythm",
// then once authenticated we send them back to /routine/:token to finish.
// (Fellows removed 2026-07-23 — the sibling fellow-invite redirect is gone.)
function PendingRoutineInviteRedirect() {
  const { user, isLoading } = useAuthForGate();
  const [location, setLocation] = useLocation();
  useEffect(() => {
    if (isLoading || !user) return;
    if (location.startsWith("/routine/")) return;
    let routine: string | null = null;
    try { routine = sessionStorage.getItem("phoebe:routine-token"); } catch { /* ignore */ }
    if (routine && /^[a-f0-9]{32}$/i.test(routine)) {
      try { sessionStorage.removeItem("phoebe:routine-token"); } catch { /* ignore */ }
      setLocation(`/routine/${routine}`);
    }
  }, [user, isLoading, location, setLocation]);
  return null;
}

// Sync the user's custom rituals from the server once they're logged in, so a
// ritual created on one device shows on every device (the "I see it on the
// phone but not the web" gap). localStorage stays the instant cache; this pulls
// the authoritative snapshot down (or migrates existing local rituals up the
// first time). Runs once per signed-in user.
function CustomAnchorServerSync() {
  const { user, isLoading } = useAuthForGate();
  const qc = useQueryClient();
  const lastSyncedRef = useRef<string | null>(null);
  // On load (and when the app returns to the foreground), pull a FRESH /auth/me
  // so a ritual created on another device shows up here — the cached user can be
  // up to staleTime old, which is why the web "still" looked empty after a phone
  // edit.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    // Re-pull the user (it carries ruleConfig + customAnchors) whenever the app
    // returns to the foreground, so a routine/ritual edited on ANOTHER device is
    // adopted here. Native fires `phoebe:appactive`; the web/PWA has no such
    // event and refetchOnWindowFocus is off — so we ALSO listen for tab
    // visibility + window focus. Without this, an already-open web tab keeps a
    // stale ruleConfig all day and never picks up a routine changed on iOS.
    // Throttled to 8s: it's only the small auth query, but a quick app-switch
    // shouldn't refetch on every focus tick.
    let lastAt = 0;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastAt < 8000) return;
      lastAt = now;
      // Returning to the foreground — re-send a home layout whose save never
      // reached the server (dropped to an iOS WebView suspension). No-op unless
      // something is pending (lib/homeLayoutCache).
      flushHomeLayout(() => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }));
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    };
    window.addEventListener("phoebe:appactive", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("phoebe:appactive", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [qc]);
  // Re-sync whenever the server snapshot's CONTENT changes (not just once per
  // user.id) — so a ritual pushed from another device is imported, not ignored.
  useEffect(() => {
    if (isLoading || !user) return;
    const snap = user.customAnchors ?? null;
    const rc = (user as { ruleConfig?: RoutineConfig | null }).ruleConfig ?? null;
    const key = `${user.id}:${JSON.stringify(snap)}:${JSON.stringify(rc)}`;
    if (lastSyncedRef.current === key) return;
    lastSyncedRef.current = key;
    syncCustomAnchorsFromServer(snap as unknown as CustomAnchorSnapshot | null);
    // Routine settings (office levels, slots, etc.) — same migrate-up-or-adopt
    // sync, so the rhythm matches phone ↔ web (lib/routineSync). Pass the user id
    // so a user SWITCH (logout→login / guest→account) adopts this account's saved
    // routine instead of letting a locally-bumped clock overwrite it.
    syncRoutineFromServer(rc, user.id);
    // One-time: carry a guest's device-local DAILY STEP goal up to the real
    // account on conversion. The anon→account upgrade preserves server data, but
    // the step goal lived in localStorage (phoebe:guest-step-goal) and would be
    // unread once the card switches to reading office-prefs.dailyStepGoal (0 for
    // a fresh account). Runs once, only for a REAL account (not the anon guest);
    // the flag is set only after the PUT lands (or when there's nothing to move)
    // so a failure retries next load.
    if (!(user as { isAnonymous?: boolean }).isAnonymous && localStorage.getItem("phoebe:guest-step-migrated") !== "1") {
      const g = (() => { try { return getGuestStepGoal(); } catch { return 0; } })();
      if (g > 0) {
        void apiRequest("PUT", "/api/me/office-prefs", { dailyStepGoal: g })
          .then(() => { try { localStorage.setItem("phoebe:guest-step-migrated", "1"); } catch { /* ignore */ } qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] }); })
          .catch(() => { /* leave flag unset → retry next load */ });
      } else {
        try { localStorage.setItem("phoebe:guest-step-migrated", "1"); } catch { /* ignore */ }
      }
    }
    // Home layout — if a save was dropped (iOS suspended the WebView mid-PUT),
    // re-send it on load so the routine the user set actually lands.
    flushHomeLayout(() => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }));
  }, [user, isLoading]);
  // Any routine-setting change (office method, reflection source, fdd mode,
  // psalm cycle, etc. all fire OFFICE_PREFS_EVENT) pushes the updated routine up
  // so it syncs across devices. Slot setters push themselves. Debounced in
  // routineSync; the server→local apply uses a different event so there's no loop.
  useEffect(() => {
    if (isLoading || !user) return;
    const push = () => pushRoutineConfig();
    window.addEventListener(OFFICE_PREFS_EVENT, push);
    return () => window.removeEventListener(OFFICE_PREFS_EVENT, push);
  }, [user, isLoading]);
  return null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; recovering: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null, recovering: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // A failed dynamic import (lazy route) after a deploy isn't a real
    // crash — the running page is referencing chunk hashes the new
    // deploy removed. Reload (network-first nav fetches the fresh index
    // + chunks) instead of showing the scary fallback. Guarded against
    // reload loops; if recovery is suppressed we fall through to the
    // normal fallback so the user isn't stuck on a blank "Updating…".
    if (isChunkLoadError(error)) {
      if (recoverFromStaleChunk("error-boundary")) {
        this.setState({ recovering: true });
        return;
      }
    }
    // Keep it in the device console / Safari Web Inspector for local
    // debugging, AND forward it so white-screen crashes on real phones
    // become visible to the team (relayed through our server to Sentry —
    // see lib/reportClientError + routes/health.ts).
    console.error("React render error:", error, info);
    reportClientError({
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }
  render() {
    if (this.state.recovering) {
      // A stale-chunk reload is in flight — show a calm placeholder
      // (not the alarming fallback) for the moment before the refresh.
      return (
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            textAlign: "center", padding: 32, gap: 16,
            background: "#091A10", minHeight: "100vh",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 40 }}>🕯️</div>
          <p style={{ color: "#8FAF96", fontSize: 15, margin: 0 }}>Updating…</p>
        </div>
      );
    }
    if (this.state.error) {
      // Friendly fallback (frontend audit). We deliberately do NOT show
      // the raw message/stack to the user — it's jarring in a
      // contemplative app and leaks internals. The stack still goes to
      // the console (componentDidCatch above) for debugging.
      return (
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            textAlign: "center", padding: 32, gap: 16,
            background: "#091A10", minHeight: "100vh",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 40 }}>🕯️</div>
          <h2 style={{ color: "#F0EDE6", fontSize: 22, fontWeight: 700, margin: 0 }}>
            Something interrupted us
          </h2>
          <p style={{ color: "#8FAF96", fontSize: 15, lineHeight: 1.5, maxWidth: 320, margin: 0 }}>
            A quiet hiccup on our end. Your prayers and letters are safe —
            let's get you back.
          </p>
          <button
            onClick={() => { this.setState({ error: null, recovering: false }); window.location.href = "/dashboard"; }}
            style={{
              marginTop: 8, padding: "12px 28px", background: "#2D5E3F", color: "#F0EDE6",
              border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600,
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            Back to dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import NotFound from "@/pages/not-found";
import Onboarding from "./pages/onboarding";
// Dashboard is the signed-in landing screen — where the large majority of app
// opens go. Keep it STATIC (in the entry bundle), NOT lazy. As a separate chunk
// the primary screen paid an extra round trip on first paint AND a full
// stale-chunk recovery reload after every deploy: the lazy import() fails
// against the now-removed old chunk hash, which forces window.location.reload()
// (see lib/staleChunk.ts). That surfaced as "the home takes a long time to load
// sometimes." The logged-out landing (welcome-public, below) is static for the
// same reason — the dashboard deserves the same treatment. Everything else here
// stays lazy. (dashboard.tsx's named exports were already pulled in by other
// lazy routes; the default being static just keeps the whole module in entry.)
import Dashboard from "./pages/dashboard";
const EventsPage = lazy(() => import("./pages/events"));
const RitualDetail = lazy(() => import("./pages/ritual-detail"));
const PsalmsPage = lazy(() => import("./pages/psalms"));
const WeeklyRoutinesPage = lazy(() => import("./pages/weekly"));
const ContemplationSetupPage = lazy(() => import("./pages/contemplation-setup"));
const ReportUserPage = lazy(() => import("./pages/report-user"));
const ReportsAdminPage = lazy(() => import("./pages/reports-admin"));
const TraditionNew = lazy(() => import("./pages/tradition-new"));
const ForgotPassword = lazy(() => import("./pages/forgot-password"));
const ResetPassword = lazy(() => import("./pages/reset-password"));
const PrayerChooserPage = lazy(() => import("./pages/prayer-chooser"));
const NcmpWatchPage = lazy(() => import("./pages/ncmp-watch"));
const DevotionWatchPage = lazy(() => import("./pages/devotion-watch"));
const OfficePodcastPage = lazy(() => import("./pages/office-podcast"));
const OfficePrayAlongPage = lazy(() => import("./pages/office-pray-along"));
const MenuPage = lazy(() => import("./pages/menu"));
const MenuBcpPage = lazy(() => import("./pages/menu-bcp"));
const MenuPracticesPage = lazy(() => import("./pages/menu-practices"));
const MenuLearnPage = lazy(() => import("./pages/menu-learn"));
const MenuReflectionsPage = lazy(() => import("./pages/menu-reflections"));
const ReflectionReadPage = lazy(() => import("./pages/reflection-read"));
const MenuResourcesPage = lazy(() => import("./pages/menu-resources"));
const HomeBetaPage = lazy(() => import("./pages/home-beta"));
const HomeBetaSectionPage = lazy(() => import("./pages/home-beta-section"));
const WayOfLoveWeekPage = lazy(() => import("./pages/way-of-love-week"));
const WeeklyReviewPage = lazy(() => import("./pages/weekly-review"));
const VideosPage = lazy(() => import("./pages/videos"));
const WayOfLoveJourneyPage = lazy(() => import("./pages/way-of-love-journey"));
const OfficeFmPage = lazy(() => import("./pages/office-fm"));
const BuildingFaithPage = lazy(() => import("./pages/building-faith"));
const NewsPage = lazy(() => import("./pages/news"));
const PodcastPublisherPage = lazy(() => import("./pages/podcast-publisher"));
const PodcastShowPage = lazy(() => import("./pages/podcast-show"));
const FddSitPage = lazy(() => import("./pages/fdd-sit"));
const ReflectCacPage = lazy(() => import("./pages/reflect-cac"));
const GatheringsPage = lazy(() => import("./pages/gatherings"));
const MomentNew = lazy(() => import("./pages/moment-new"));
const MomentDetail = lazy(() => import("./pages/moment-detail"));
const MomentPostPage = lazy(() => import("./pages/moment-post"));
const MorningPrayerPage = lazy(() => import("./pages/morning-prayer"));
const MomentsDashboard = lazy(() => import("./pages/moments-dashboard"));
const MomentRedirect = lazy(() => import("./pages/moment-redirect"));
const PrayerListPage = lazy(() => import("./pages/prayer-list"));
const PrayerModePage = lazy(() => import("./pages/prayer-mode"));
const DailyPracticePage = lazy(() => import("./pages/daily-practice"));
const DailyProgressPage = lazy(() => import("./pages/daily-progress"));
const RoutinePrintPage = lazy(() => import("./pages/routine-print"));
const RuleOfLifePage = lazy(() => import("./pages/rule-of-life"));
const RuleOfLifeViewPage = lazy(() => import("./pages/rule-of-life-view"));
const BeginPrayerPage = lazy(() => import("./pages/begin-prayer"));
const PrayerStartPage = lazy(() => import("./pages/prayer-start"));
const PrayerRequestDetailPage = lazy(() => import("./pages/prayer-request-detail"));
const PrayerRequestNew = lazy(() => import("./pages/prayer-request-new"));
const MyPrayerRequestsPage = lazy(() => import("./pages/my-prayer-requests"));
const SettingsPage = lazy(() => import("./pages/settings"));
const AboutPage = lazy(() => import("./pages/about"));
const PrivacyPage = lazy(() => import("./pages/privacy"));
const TermsPage = lazy(() => import("./pages/terms"));
const InvitationsPage = lazy(() => import("./pages/invitations"));
const BcpPage = lazy(() => import("./pages/bcp"));
const OfficesPage = lazy(() => import("./pages/offices"));
const ExamenPage = lazy(() => import("./pages/examen"));
const GuidedPrayerPage = lazy(() => import("./pages/guided-prayer"));
const ContemplationPage = lazy(() => import("./pages/contemplation"));
const CobreathePage = lazy(() => import("./pages/cobreathe"));
const CobreatheAboutPage = lazy(() => import("./pages/cobreathe-about"));
const PrayBreathPage = lazy(() => import("./pages/pray-breath"));
const SaintsIndex = lazy(() => import("./pages/Saints/SaintsIndex"));
const CustomizeHomePage = lazy(() => import("./pages/customize-home"));
const CustomizeHomeAddPage = lazy(() =>
  import("./pages/customize-home").then((m) => ({ default: m.CustomizeHomeAddPage })),
);
const ListeningPage = lazy(() => import("./pages/listening"));
const ReadingLogPage = lazy(() => import("./pages/reading-log"));
const PodcastLogPage = lazy(() => import("./pages/podcast-log"));
const WalkLogPage = lazy(() => import("./pages/walk-log"));
const FindYourRhythmPage = lazy(() => import("./pages/find-your-rhythm"));
const SpotifyCallbackPage = lazy(() => import("./pages/spotify-callback"));
const BcpIntercessionsPage = lazy(() => import("./pages/bcp-intercessions"));
const BcpDailyOfficePage = lazy(() => import("./pages/bcp-daily-office"));
const BcpDailyDevotionPage = lazy(() => import("./pages/bcp-daily-devotion"));
const CreationDevotionPage = lazy(() => import("./pages/creation-devotion"));
const CreationPrayersPage = lazy(() => import("./pages/creation-prayers"));
const OfficeSettingsPage = lazy(() => import("./pages/office-settings"));
const BcpPsalterPage = lazy(() => import("./pages/bcp-psalter"));
const BcpCollectsPage = lazy(() => import("./pages/bcp-collects"));
const PublicPrayerPage = lazy(() => import("./pages/public-prayer"));
const PublicPrayerRequestPage = lazy(() => import("./pages/public-prayer-request"));
const PublicFeedPage = lazy(() => import("./pages/public-feed"));
const CommunitiesPage = lazy(() => import("./pages/communities"));
const CommunitiesBrowsePage = lazy(() => import("./pages/communities-browse"));
const CommunityRequestsPage = lazy(() => import("./pages/community-requests"));
import WelcomePublicPage from "./pages/welcome-public";
import InvitePage from "./pages/invite";
import InviteSharePage from "./pages/invite-share";
const CommunityNewPage = lazy(() => import("./pages/community-new"));
const CommunityDetailPage = lazy(() => import("./pages/community-detail"));
const CommunityAskPage = lazy(() => import("./pages/community-ask"));
const CommunityWeeklyPlanPage = lazy(() => import("./pages/community-weekly-plan"));
const CommunityWeeklyPlanEditPage = lazy(() => import("./pages/community-weekly-plan-edit"));
const CommunityWeeklyPlanReadPage = lazy(() => import("./pages/community-weekly-plan-read"));
const CommunityWeeklyPlanDeckPage = lazy(() => import("./pages/community-weekly-plan-deck"));
const PrescribeRoutinePage = lazy(() => import("./pages/prescribe-routine"));
const CommunityRuleSetPage = lazy(() => import("./pages/community-rule-set"));
const RoutineInvitePage = lazy(() => import("./pages/routine-invite"));
const SignPage = lazy(() => import("./pages/sign"));
const SeasonPage = lazy(() => import("./pages/season"));
const SharePrayerPage = lazy(() => import("./pages/share-prayer"));
const CommunitySettingsPage = lazy(() => import("./pages/community-settings"));
const CommunityJoinPage = lazy(() => import("./pages/community-join"));
const BetaAdminPage = lazy(() => import("./pages/beta-admin"));
const BetaClaimPage = lazy(() => import("./pages/beta-claim"));
const AdminToolsPage = lazy(() => import("./pages/admin-tools"));
const PilotHomePage = lazy(() => import("./pages/pilot-home"));
const PilotBuildPage = lazy(() => import("./pages/pilot-build"));
const CustomizePage = lazy(() => import("./pages/customize"));
const AdminMinistriesPage = lazy(() => import("./pages/admin-ministries"));
const AdminUserMetricsPage = lazy(() => import("./pages/admin-user-metrics"));
const MyPrayerFeedsPage = lazy(() => import("./pages/my-prayer-feeds"));
const AdminNewsletterPage = lazy(() => import("./pages/admin-newsletter"));
const LearnPage = lazy(() => import("./pages/learn"));
const SpiritualJourneyPage = lazy(() => import("./pages/spiritual-journey"));
const CenteringPrayerCoursePage = lazy(() => import("./pages/centering-prayer"));
const WayOfLoveCoursePage = lazy(() => import("./pages/way-of-love-course"));
const ChurchDeck = lazy(() => import("./pages/church-deck"));
const VisionDeck = lazy(() => import("./pages/vision-deck"));
const FeaturesDeck = lazy(() => import("./pages/features-deck"));
const AboutDeck = lazy(() => import("./pages/about-deck"));
const UserOnboarding = lazy(() => import("./pages/user-onboarding"));
const PrayerFeedManagePage = lazy(() => import("./pages/prayer-feed-manage"));
const PrayerFeedsBrowsePage = lazy(() => import("./pages/prayer-feeds-browse"));
const PrayerFeedDetailPage = lazy(() => import("./pages/prayer-feed-detail"));
import { useAuth as useAuthForGate } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { usePilotMode } from "@/hooks/usePilotMode";
import { useGuestMode } from "@/hooks/useGuestMode";

// Climate is now just a prayer feed (slug: phoebe-climate). The old
// /climate*, /climate/admin, /climate/parish routes redirect to the
// generic prayer-feed surfaces so existing bookmarks and links keep
// working.
function RedirectTo({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [to, setLocation]);
  return null;
}

// Renders its child page only when the prayer-request feature is available to
// this account (pilot-group-only, 2026-07-22); otherwise sends the user home.
// Guards deep links + back-button navigation to /prayer-* for accounts that
// have no prayer surface. Waits for /auth/me before deciding so a pilot-group
// member's deep link isn't bounced during the auth round-trip.
function PrayerGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuthForGate();
  const enabled = !!user?.inPilotGroup || !!user?.isSuperAdmin;
  // A bare `return null` here reads as a dead app if /auth/me is slow to
  // settle — which is exactly what a notification tap hits when iOS wakes the
  // WebView with the network still coming back. Show the same quiet loading
  // shell the rest of the app uses, so a slow open looks like loading rather
  // than a blank screen. (fetchMe is also timeout-bounded now — see useAuth.)
  if (isLoading) return <RouteFallback />;
  if (!enabled) return <RedirectTo to="/dashboard" />;
  return <>{children}</>;
}

// Retry policy tuned for flaky / captive-portal Wi-Fi (libraries, hotels,
// coffee shops): a single TLS reset or TCP RST on the first fetch after
// waking shouldn't dump the user onto a blank screen. We retry network
// errors with jittered exponential backoff but stay hands-off on 4xx
// responses — those are real answers from the server, not transport
// hiccups, so retrying just wastes time and risks double-submits.
// Contextual "you're offline" notice — no persistent banner. We only speak up
// when the user actually hits a wall: a query they're looking at failed on the
// network (not an HTTP error from a reachable server) AND we have nothing cached
// to show them. Then a single throttled toast tells them it'll load once
// they're back online. Queries that fall back to cached data stay silent.
let lastOfflineToastAt = 0;
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // ApiError = the server replied with a non-2xx (it's reachable) — that's
      // a real error, not "offline", so don't mislabel it.
      if (error instanceof ApiError) return;
      // Background-poll queries (Heart to Hearts, etc.) opt out of the offline
      // toast — a secondary feature's refetch failing shouldn't nag the user
      // who's looking at a perfectly-loaded home.
      if (query.meta?.silentError) return;
      // Only speak up when the OS says we're genuinely OFFLINE. A single slow
      // or timed-out query (the 12s GET timeout throws a non-ApiError) happens
      // on perfectly healthy connections too — popping a "needs a connection"
      // toast then is both annoying and untrue. Flaky-but-online connections
      // are handled separately, and more gently, by the NetworkBanner.
      if (typeof navigator !== "undefined" && navigator.onLine) return;
      // We have cached data on screen — the failed refetch is invisible to the
      // user, so there's nothing to tell them.
      if (query.state.data !== undefined) return;
      // Nothing is actually observing this query (a background prefetch) — no
      // one is staring at a blank screen waiting for it.
      if (query.getObserversCount() === 0) return;
      const now = Date.now();
      if (now - lastOfflineToastAt < 8000) return;
      lastOfflineToastAt = now;
      toast({
        title: "You're offline",
        description: "This needs a connection — it'll load once you're back online.",
      });
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const msg = String((error as { message?: unknown } | null)?.message ?? "");
        // 4xx → definitive failure, don't loop. Also bail on auth
        // redirects where the browser already handled the session.
        if (/\b4\d\d\b/.test(msg)) return false;
        if (/Unauthorized|Forbidden|Not authenticated/i.test(msg)) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) =>
        Math.min(1000 * 2 ** attempt + Math.floor(Math.random() * 400), 10_000),
      refetchOnWindowFocus: false,
      // Don't give up just because navigator.onLine lies — captive
      // portals often keep `onLine=true` while silently dropping TLS.
      networkMode: "always",
      // Default freshness window. Without this, staleTime defaults to 0, so
      // every query refetched on each component mount — navigating between
      // pages (or returning to the dashboard, which fires ~28 queries) re-ran
      // them all. 30s suppresses those redundant passive refetches; mutations
      // still invalidate the keys they touch, so user-edited data refreshes
      // immediately, and call sites that need real-time data set their own
      // shorter staleTime / refetchInterval (those override this default).
      staleTime: 30_000,
      // Keep cached data around for a day so the persisted "daily progress"
      // queries below can be restored on a cold boot (gcTime must outlive the
      // persist maxAge or the restored entries get evicted immediately).
      gcTime: 24 * 60 * 60 * 1000,
    },
    mutations: {
      // Don't auto-retry mutations — they can be non-idempotent. The
      // user can re-tap Save. We still benefit from the network-mode
      // change above so a queued mutation fires as soon as the user
      // reconnects instead of being rejected outright.
      retry: false,
      networkMode: "always",
    },
  },
});

// Persist a SMALL set of "daily progress" queries to localStorage so the home
// renders the user's rhythm INSTANTLY on a cold boot (from the last session)
// instead of a blank/loading state, then refreshes in the background. Scoped to
// these light keys so we never bloat localStorage with large payloads (bible
// text, feeds, etc.).
const PERSISTED_QUERY_KEYS = [
  // Auth — persisting the signed-in user is the biggest cold-boot win: the
  // home renders from the last session instead of blocking on the
  // /api/auth/me round-trip, then revalidates in the background (and logs out
  // if the session is gone). Logout clears the persisted blob (see useLogout),
  // so a previous account's data never leaks to the next.
  "/api/auth/me",
  // Daily rhythm
  "/api/me/office-history-week",
  "/api/me/prayer-days",
  "/api/me/contemplation-stats",
  "/api/me/reflections-read",
  "/api/me/office-prefs",
  // The per-anchor "kept today" completions + today's Co-Breathe state. Without
  // these the rhythm hook's `ready` gate never resolves OFFLINE for anyone with
  // extra practices, so the whole routine failed to paint with no connection.
  "/api/practice-completion",
  "/api/breath/today",
  "/api/prayer-streak",
  "/api/me/garden-week",
  "/api/cac/today-meta",
  // Weekly practice grid + the app-open splash's "prayed for you this month"
  // — persisted so the splash + Daily-progress week render INSTANTLY from the
  // last session (cached, no lag/flash) and refresh in the background.
  "/api/me/practice-week",
  "/api/prayer-streak/prayed-for-me-month",
  // Home content — so the WHOLE home (not just the rhythm) paints from cache
  // on a slow/cold launch: prayer requests, community intercessions, your
  // gatherings, worship times, prayers-for, circle intentions, action items.
  // Still scoped to lightweight keys — feeds/bible text stay out on purpose
  // (they can be large and would risk the localStorage quota).
  "/api/prayer-requests",
  "/api/moments",
  "/api/rituals",
  "/api/me/service-schedules",
  "/api/groups/me/circle-intentions",
];
const rqPersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "phoebe:rq-daily",
  throttleTime: 1000,
});
// The persisted cache is scoped to the LOCAL CALENDAR DAY it was written on.
//
// Most of the keys above are day-scoped ("did I pray today", this week's grid,
// today's reflection) but their query keys carry only a timezone, never a date
// — so a blob written at 9pm Monday rehydrated under the identical key at 7am
// Tuesday, still inside the 24h maxAge. The home then painted "kept today ✓"
// and served Monday's reflection as Tuesday's; on a slow or offline morning
// that is what the user acts on, and it tells them they have already prayed.
// DayBoundaryRefresh can't save it either — it initialises its "last day" at
// mount, so a cold boot never observes the crossing. (2026-07-21 data audit.)
//
// Passing the local day as the persister's `buster` discards the whole blob on
// the first open of a new day, which is exactly when stale data is dangerous,
// while keeping the cold-boot paint within a day. It also covers every
// day-scoped key automatically, including ones added later.
const localDayBuster = (() => {
  try { return new Date().toLocaleDateString("en-CA"); } catch { return "day"; }
})();
const rqPersistOptions = {
  persister: rqPersister,
  buster: localDayBuster,
  maxAge: 24 * 60 * 60 * 1000,
  // Quota guard: if the dehydrated blob ever exceeds the ~5MB localStorage cap,
  // drop the oldest query and retry instead of silently failing to persist (so
  // the home would cold-boot blank). The big content already lives in the
  // IndexedDB layer, so this should rarely trigger — it's belt-and-suspenders.
  retry: removeOldestQuery,
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) =>
      q.state.status === "success" &&
      PERSISTED_QUERY_KEYS.some((k) => String(q.queryKey?.[0] ?? "").startsWith(k)),
  },
};

// Second, LARGER offline layer (IndexedDB) for heavy content the ~5MB
// localStorage persister above can't hold — prayer feeds + the daily-office
// scripture/BCP text. Additive and async: the localStorage persister keeps the
// home's instant cold-boot paint untouched, while this restores + persists the
// big keys in the background. Both calls are best-effort and no-op if IndexedDB
// is unavailable (private mode, old webview). attachIdbPersistence subscribes
// for the app's whole life, so we don't keep its unsubscribe handle.
attachIdbPersistence(queryClient);
void hydrateIdbCache(queryClient);

// Retry any prayer-session write that failed while offline. Flushes now, and
// again whenever the device reconnects or the app comes back to the foreground.
installSessionOutboxFlush();

// Invalidate every React Query cache when the user taps an iOS push
// notification. The native shell fires `phoebe:notification-tap` from
// inside its `pushNotificationActionPerformed` handler, BEFORE pushing
// the new history state — so by the time the destination route mounts
// and reads its query, the refetch is already in flight. The result is
// that landing on the dashboard (or any feed page) after a tap shows
// fresh data on first paint instead of the stale snapshot we had cached.
//
// Doing this at the App-level rather than per-page lets us treat the
// whole client cache as cold whenever there's evidence the server state
// changed under us. Cheap operation (queries the user is currently
// looking at refetch; off-screen ones are just marked stale and refetch
// on next mount).
function NotificationTapPrewarm() {
  useEffect(() => {
    const handler = () => {
      try { queryClient.invalidateQueries(); } catch { /* non-fatal */ }
    };
    window.addEventListener("phoebe:notification-tap", handler);
    return () => window.removeEventListener("phoebe:notification-tap", handler);
  }, []);
  return null;
}

// PilotGate — the simplified public "pilot" shell. Modeled on ParishGate.
// When a session is in pilot mode (see usePilotMode: pilot is the default for
// everyone EXCEPT community admins + beta testers, gated by PHOEBE_PILOT_ENABLED
// / the phoebe:pilot-preview override), we keep them within a small allowlist
// of surfaces and bounce everything else (community, events, people, letters,
// messages) to the pilot home. No-op entirely when pilot isn't active.
const PILOT_ALLOWED_EXACT = new Set<string>([
  "/", "/pilot/home", "/pilot/build",
  "/prayer-list", "/pray-request/new",
  "/menu", "/menu/practices", "/menu/reflections", "/menu/bcp",
  "/contemplation", "/cobreathe",
  "/prayer-chooser", "/settings", "/signin", "/login", "/onboarding",
  "/pray",
  "/creation-devotion", "/creation-prayers",
  "/about", "/about-deck", "/privacy", "/terms", "/invite", "/invite/share",
]);
// Podcasts is an intended pilot feature — allow its show/publisher/episode
// subpaths, not just the index. Same for /cobreathe (intro → breath).
const PILOT_ALLOWED_PREFIX = ["/bcp", "/prayer-mode", "/p/", "/settings/", "/podcasts", "/cobreathe"];

function PilotGate({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { isPilot, isLoading } = usePilotMode();

  useEffect(() => {
    if (isLoading || !isPilot) return;
    // The full dashboard is never shown to pilot users — send them to the
    // calm pilot home instead.
    if (location === "/dashboard") { setLocation("/pilot/home"); return; }
    const allowed =
      PILOT_ALLOWED_EXACT.has(location) ||
      PILOT_ALLOWED_PREFIX.some((p) => location.startsWith(p));
    if (!allowed) setLocation("/pilot/home");
  }, [location, isPilot, isLoading, setLocation]);

  return <>{children}</>;
}

// GuestGate — the PUBLIC no-login version's route allowlist (PilotGate's
// pattern; see memory "project_public_no_login"). While a session is in guest
// mode (useGuestMode: flag on + signed out, or signed in without beta/
// community-admin), only the personal prayer surfaces are reachable — home,
// Daily progress, the customizer, the BCP offices (+ prayer-mode for the
// office's closing slides; the intercession handoff is dead in guest mode),
// Psalms, Contemplation, Co-Breathe, Listen to Scripture, the reflections
// reader, menu/settings/legal, and the quiet /signin. Everything else
// (communities, people/fellows, events, feeds, letters, messages, prayer
// lists, moments, listening) bounces to the guest home. "/" stays allowed so
// welcome-public can seed + forward; "/onboarding" stays allowed because the
// dashboard bounces not-yet-onboarded signed-in users there (blocking it
// would loop). No-op entirely when guest mode isn't active.
const GUEST_ALLOWED_EXACT = new Set<string>([
  "/", "/dashboard", "/daily-progress",
  "/menu", "/menu/bcp", "/menu/practices", "/menu/learn", "/menu/reflections", "/menu/resources",
  // Practices that need no account to pray — the Examen and the Simple Guided
  // Prayer (PACT) sit alongside /contemplation and /cobreathe here. Signing in
  // only adds the server-side session log.
  "/psalms", "/contemplation", "/examen", "/guided-prayer", "/reflect/fdd", "/customize",
  // Every one of these is reachable from a home card or menu row the light
  // tier already SEES, so bouncing the tap to the dashboard was a dead end.
  // (This gate is not guests-only: useGuestMode is true for any signed-in
  // non-beta, non-community-admin account, so the bounce hit ordinary users.)
  // All personal practices — a reflection reader, a listening session, and
  // three tap-to-log surfaces — with no social surface between them.
  "/reflect/cac", "/listening", "/walk-log", "/reading-log", "/podcast-log",
  // The branching questionnaire that ENDS in a rule — reached from inside the
  // already-allowlisted /rule-of-life flow, so excluding it broke that flow
  // partway through.
  "/find-your-rhythm",
  "/journey", "/centering-prayer", "/way-of-love-course", "/learn",
  "/begin-prayer", "/prayer-chooser",
  // Media the guest's OWN office routes to: the listen-medium office podcasts
  // (begin-prayer's flow=daily hand-off) and the watch-medium pages (the
  // office + devotion viewers hand off to these) — audio/video INSIDE the
  // offices, which the public spec keeps.
  "/podcast/morning-office", "/podcast/evening-office",
  "/devotion/watch", "/ncmp/watch",
  // Reference content the guest Resources menu links to.
  "/building-faith",
  "/signin", "/login", "/onboarding",
  "/about", "/about-deck", "/privacy", "/terms",
  // The invite landing page — a first-time visitor tapping a shared link has
  // no session yet, which useGuestMode treats as a guest; without this the
  // gate bounced them to /dashboard before they ever saw the invite.
  "/invite", "/invite/share",
]);
const GUEST_ALLOWED_PREFIX = [
  "/bcp", "/prayer-mode", "/cobreathe",
  "/rule-of-life", "/settings", "/menu/reflections/",
  // Saints index + detail pages (guest Resources → Saints).
  "/saints",
  // Prescribed-routine / preset-rule invite links (/routine/:token) — "join a
  // rule via link" must work for the public no-login app too. The anonymous
  // device user has a real session, so accepting applies server-side like any
  // account; a truly session-less visitor still sees the landing and the
  // accept simply asks them to try again after the app provisions one.
  "/routine/",
  // Printable parish/community invite SIGN (/sign/:token) — a leader prints the
  // QR poster; it shows the community name + the routine QR, all public info.
  "/sign/",
  // Season links (/season/:token) — the one-tap "take the practice home" a
  // community leader or priest shares; the same no-account-wall rule applies.
  "/season/",
  // Community invite links (/communities/join/:slug/:token) — the page has its
  // own signup/sign-in flow for signed-out visitors, which the guest gate was
  // bouncing to the dashboard before it could render. An invite link someone
  // was HANDED must always open.
  "/communities/join/",
];

// The customizer routes (rule of life / pilot build / the questionnaire) that
// CREATE or CHANGE a person's rule. On the web these require an account —
// browser storage is ephemeral, so a rule built by a logged-out visitor can't
// be made durable. iOS is exempt (its anonymous device user is server-backed,
// and the register in-place upgrade preserves the rule if they later sign up).
const WEB_CUSTOMIZER_ROUTES = new Set<string>([
  "/rule-of-life", "/pilot/build", "/find-your-rhythm",
  // The office "Customize" pill (/bcp/daily-office/settings) also shapes the
  // rule — which office form, medium, reflection, minutes — so it's gated too.
  "/bcp/daily-office/settings",
]);

function GuestGate({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { isGuest, isLoading } = useGuestMode();
  const { user, isLoading: authLoading } = useAuthForGate();

  useEffect(() => {
    if (isLoading || !isGuest) return;
    const allowed =
      GUEST_ALLOWED_EXACT.has(location) ||
      GUEST_ALLOWED_PREFIX.some((p) => location.startsWith(p));
    if (!allowed) setLocation("/dashboard");
  }, [location, isGuest, isLoading, setLocation]);

  // A logged-out / anonymous visitor who opens the FULL customizer (Shape your
  // rhythm / pilot build / questionnaire / office settings) gets the SIMPLE
  // 4-dropdown customizer FIRST (owner, 2026-07-08) — not a login wall. From
  // /customize, its own "Customize more fully" link is what leads to sign-in
  // (it points at /signin?redirect=/pilot/build directly, so this gate can't
  // loop it back here). Gate on isDeviceLocalGuest (logged-out OR the
  // anonymous device user) — NOT useGuestMode — so a signed-in "light" user,
  // who has a real durable account, reaches the full customizer directly.
  useEffect(() => {
    if (authLoading) return;
    if (!isDeviceLocalGuest(user)) return;
    if (WEB_CUSTOMIZER_ROUTES.has(location)) {
      setLocation("/customize", { replace: true });
    }
  }, [location, authLoading, user, setLocation]);

  return <>{children}</>;
}

// Quiet full-screen fallback shown while a lazy-loaded route chunk is
// fetched. On iOS the chunks are bundled (capacitor://localhost), so
// this flashes only for a frame or two; on web it covers the network
// fetch of the split chunk. Matches the app's dark background so it
// reads as "still loading" rather than a white flash.
function RouteFallback() {
  return (
    <div style={{ minHeight: "100vh", background: "#091A10" }} aria-hidden />
  );
}

function Router() {
  return (
    // Suspense boundary for the lazy-loaded route chunks (code-splitting,
    // frontend audit). Eager routes render immediately; lazy ones (the
    // heavy non-landing pages — prayer-mode, community-detail,
    // the decks, BCP readers, etc.) suspend to RouteFallback while their
    // chunk loads, keeping them out of the initial bundle.
    <Suspense fallback={<RouteFallback />}>
    <Switch>
      {/* Public first-open chooser: morning/evening office, climate
          prayer, or sign in. Onboarding (the email/password form) is
          mounted at /signin now — /onboarding kept as an alias so any
          older deep links still resolve. */}
      <Route path="/" component={WelcomePublicPage} />
      <Route path="/signin" component={Onboarding} />
      {/* /onboarding is the post-signup UserOnboarding slideshow,
          mounted below. Don't claim it here for the signin form —
          Wouter <Switch> is first-match-wins and a duplicate route
          here would shadow the real slideshow. */}
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/prayer-chooser">{() => <PrayerGate><PrayerChooserPage /></PrayerGate>}</Route>
      <Route path="/ncmp/watch" component={NcmpWatchPage} />
      <Route path="/devotion/watch" component={DevotionWatchPage} />
      <Route path="/podcast/morning-office" component={OfficePodcastPage} />
      <Route path="/podcast/evening-office" component={OfficePodcastPage} />
      {/* Beta: the follow-along office (glowing liturgy-part title + podcast bar) */}
      <Route path="/office/:side/pray-along" component={OfficePrayAlongPage} />
      <Route path="/menu" component={MenuPage} />
      <Route path="/menu/bcp" component={MenuBcpPage} />
      <Route path="/menu/practices" component={MenuPracticesPage} />
      <Route path="/menu/learn" component={MenuLearnPage} />
      <Route path="/menu/reflections" component={MenuReflectionsPage} />
      <Route path="/menu/reflections/:source" component={ReflectionReadPage} />
      <Route path="/menu/resources" component={MenuResourcesPage} />
      <Route path="/office/forward" component={OfficeFmPage} />
      {/* The standalone Podcasts browse hub is removed — podcasts stay
          integrated where they belong (the office "Listen" audio, the Forward
          Day by Day card, the Scripture readings, the Jardín Morning Prayer
          podcast). The show/publisher routes below remain for those direct
          links; /show/:slug precedes /:publisher so "show" isn't captured as a
          publisher slug. */}
      <Route path="/reflect/fdd" component={FddSitPage} />
      <Route path="/reflect/cac" component={ReflectCacPage} />
      <Route path="/podcasts/show/:slug" component={PodcastShowPage} />
      <Route path="/news" component={NewsPage} />
      <Route path="/building-faith" component={BuildingFaithPage} />
      <Route path="/podcasts/:publisher" component={PodcastPublisherPage} />
      <Route path="/dashboard"><Dashboard /></Route>
      <Route path="/pilot/home" component={PilotHomePage} />
      <Route path="/pilot/build" component={PilotBuildPage} />
      {/* Basic 4-dropdown customizer for logged-out / device-local sessions —
          deliberately NOT in WEB_CUSTOMIZER_ROUTES below (it writes device-
          local prefs directly, no account needed); "Customize more fully"
          hands off to /pilot/build, which IS gated to require signing in. */}
      <Route path="/customize" component={CustomizePage} />
      <Route path="/events" component={EventsPage} />
      {/* BETA: Way of Love. The DAILY half folded back into /dashboard (Turn
          streak + the existing office / Contemplation / reflection cards); the
          WEEKLY half lives on /this-week. The combined /home-beta home is
          retired (redirects to /dashboard), but its detail sub-screens
          (/home-beta/turn, /home-beta/:section) stay — the streak + weekly
          page link into them. /:section first so the param route isn't
          shadowed. */}
      <Route path="/this-week/review" component={WeeklyReviewPage} />
      <Route path="/this-week" component={WayOfLoveWeekPage} />
      <Route path="/way-of-love" component={WayOfLoveJourneyPage} />
      <Route path="/videos" component={VideosPage} />
      <Route path="/home-beta/:section" component={HomeBetaSectionPage} />
      <Route path="/home-beta">{() => <RedirectTo to="/dashboard" />}</Route>
      <Route path="/gatherings" component={GatheringsPage} />
      <Route path="/tradition/new" component={TraditionNew} />
      <Route path="/moment/new">{() => <PrayerGate><MomentNew /></PrayerGate>}</Route>
      <Route path="/m/:userToken" component={MomentRedirect} />
      <Route path="/moment/:momentToken/:userToken"><PrayerGate><MomentPostPage /></PrayerGate></Route>
      <Route path="/moments/:id" component={MomentDetail} />
      <Route path="/practices" component={MomentsDashboard} />
      <Route path="/morning-prayer/:momentId/:token" component={MorningPrayerPage} />
      <Route path="/ritual/:id" component={RitualDetail} />
      <Route path="/routine/:token" component={RoutineInvitePage} />
      <Route path="/sign/:token" component={SignPage} />
      {/* Seasons — /season/:token (public landing → join → the cohort's day
          view). Started by a community's leaders or a parish priest. */}
      <Route path="/season/:token" component={SeasonPage} />
      {/* Letters & Messages removed (owner) — the correspondence/letter-writing
          and 1:1 messaging features are no longer part of the experience. */}
      <Route path="/weekly" component={WeeklyRoutinesPage} />
      <Route path="/contemplation-setup" component={ContemplationSetupPage} />
      <Route path="/people/:email/report" component={ReportUserPage} />
      <Route path="/admin/reports" component={ReportsAdminPage} />
      <Route path="/admin/tools" component={AdminToolsPage} />
      <Route path="/admin/ministries" component={AdminMinistriesPage} />
      <Route path="/admin/users" component={AdminUserMetricsPage} />
      <Route path="/my-prayer-feeds" component={MyPrayerFeedsPage} />
      <Route path="/admin/newsletter" component={AdminNewsletterPage} />
      <Route path="/prayer-list">{() => <PrayerGate><PrayerListPage /></PrayerGate>}</Route>
      <Route path="/my-prayer-requests" component={MyPrayerRequestsPage} />
      <Route path="/prayer-mode">{() => <PrayerGate><PrayerModePage /></PrayerGate>}</Route>
      <Route path="/begin-prayer" component={BeginPrayerPage} />
      <Route path="/prayer-start">{() => <PrayerGate><PrayerStartPage /></PrayerGate>}</Route>
      <Route path="/prayer-requests/:id"><PrayerGate><PrayerRequestDetailPage /></PrayerGate></Route>
      <Route path="/pray-request/new">{() => <PrayerGate><PrayerRequestNew /></PrayerGate>}</Route>
      <Route path="/settings" component={SettingsPage} />
      <Route path="/daily-practice" component={DailyPracticePage} />
      <Route path="/daily-progress" component={DailyProgressPage} />
      <Route path="/routine-print" component={RoutinePrintPage} />
      {/* /rule-of-life/:id must sit above /rule-of-life so the id param isn't lost */}
      <Route path="/rule-of-life/:id" component={RuleOfLifeViewPage} />
      <Route path="/rule-of-life" component={RuleOfLifePage} />
      {/* /customize-home/add must sit above /customize-home so it matches first */}
      <Route path="/customize-home/add" component={CustomizeHomeAddPage} />
      <Route path="/customize-home" component={CustomizeHomePage} />
      {/* /invite/share (sender side) must sit above /invite (recipient side). */}
      <Route path="/invite/share" component={InviteSharePage} />
      <Route path="/invite" component={InvitePage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/invitations" component={InvitationsPage} />
      <Route path="/offices" component={OfficesPage} />
      <Route path="/examen" component={ExamenPage} />
      <Route path="/guided-prayer" component={GuidedPrayerPage} />
      <Route path="/contemplation" component={ContemplationPage} />
      <Route path="/psalms" component={PsalmsPage} />
      <Route path="/cobreathe/about" component={CobreatheAboutPage} />
      <Route path="/cobreathe" component={CobreathePage} />
      {/* BETA "Pray the breath" — Co-Breathe with the user's prayer requests as
          the rotating text in the top half, instead of photos. */}
      <Route path="/pray-breath" component={PrayBreathPage} />
      {/* Saints — a single browsable/searchable index (BCP-Prayers-style). */}
      <Route path="/saints" component={SaintsIndex} />
      <Route path="/listening" component={ListeningPage} />
      <Route path="/reading-log" component={ReadingLogPage} />
      <Route path="/podcast-log" component={PodcastLogPage} />
      <Route path="/walk-log" component={WalkLogPage} />
      <Route path="/find-your-rhythm" component={FindYourRhythmPage} />
      <Route path="/spotify-callback" component={SpotifyCallbackPage} />
      <Route path="/bcp" component={BcpPage} />
      <Route path="/bcp/intercessions" component={BcpIntercessionsPage} />
      {/* Office-only Settings — focused subset of /settings that
          only carries the office-relevant prefs (daily reminder,
          Confession of Sin, closing pills, Gratitude slide).
          Reached from the Settings pill on the Daily Offices chooser.
          MUST come BEFORE /bcp/daily-office so wouter's first-match
          Switch doesn't swallow it as the picker route. */}
      <Route path="/bcp/daily-office/settings" component={OfficeSettingsPage} />
      <Route path="/bcp/daily-office" component={BcpDailyOfficePage} />
      <Route path="/bcp/daily-devotions" component={BcpDailyDevotionPage} />
      <Route path="/creation-devotion" component={CreationDevotionPage} />
      <Route path="/creation-prayers" component={CreationPrayersPage} />
      <Route path="/bcp/psalter" component={BcpPsalterPage} />
      <Route path="/bcp/collects" component={BcpCollectsPage} />
      {/* /pray — public, no login. Choose the Daily Office or Daily
          Devotion, pray the time-appropriate liturgy, then a sign-up
          invitation. The office/devotion APIs are already public. */}
      <Route path="/pray" component={PublicPrayerPage} />
      {/* Public Prayer Request share — /p/:token. Anyone with the
          link can read the request + tap Amen; the page shepherds
          them through sign-up afterwards so they become Fellows
          with the owner. Lives outside any tier gate (no auth
          required to render). */}
      <Route path="/p/:token" component={PublicPrayerRequestPage} />
      {/* /feed/:slug — public, no-login landing for a single prayer feed.
          Logged-in users are redirected by the page to /prayer-feeds/:slug. */}
      <Route path="/feed/:slug" component={PublicFeedPage} />
      <Route path="/communities" component={CommunitiesPage} />
      <Route path="/communities/browse" component={CommunitiesBrowsePage} />
      <Route path="/communities/new" component={CommunityNewPage} />
      <Route path="/communities/join/:slug/:token" component={CommunityJoinPage} />
      {/* The old post-signup "Find a community" picker is retired — a fresh
          signup (from the home screen or after praying the office) lands on the
          home, not a community-finder. The page is kept out of the flow by
          redirecting any residual link to /welcome straight to the dashboard. */}
      <Route path="/welcome">{() => <RedirectTo to="/dashboard" />}</Route>
      <Route path="/communities/:slug/requests" component={CommunityRequestsPage} />
      {/* Leaders set the community's shared RULE OF LIFE (adoptable in one tap). */}
      <Route path="/communities/:slug/rule-of-life/set" component={CommunityRuleSetPage} />
      {/* NOT YET PUBLIC (WEEKLY_PLAN_ENABLED) — both pages redirect away while
          the flag is off; no menu/UI exposes these routes yet. */}
      <Route path="/communities/:slug/weekly-plan" component={CommunityWeeklyPlanPage} />
      <Route path="/communities/:slug/weekly-plan/edit" component={CommunityWeeklyPlanEditPage} />
      <Route path="/communities/:slug/weekly-plan/read/:itemId" component={CommunityWeeklyPlanReadPage} />
      <Route path="/communities/:slug/weekly-plan/deck/:itemId" component={CommunityWeeklyPlanDeckPage} />
      <Route path="/communities/:slug/prescribe" component={PrescribeRoutinePage} />
      {/* App-wide PRESET rule (no community) — the create POST requires a
          super admin, so the page is safe to route for anyone. */}
      <Route path="/prescribe" component={PrescribeRoutinePage} />
      <Route path="/communities/:slug/settings" component={CommunitySettingsPage} />
      <Route path="/communities/:slug/share-prayer" component={SharePrayerPage} />
      <Route path="/communities/:slug/ask" component={CommunityAskPage} />
      <Route path="/communities/:slug" component={CommunityDetailPage} />
      <Route path="/beta" component={BetaAdminPage} />
      <Route path="/beta/claim" component={BetaClaimPage} />
      <Route path="/learn" component={LearnPage} />
      <Route path="/journey" component={SpiritualJourneyPage} />
      <Route path="/centering-prayer" component={CenteringPrayerCoursePage} />
      <Route path="/way-of-love-course" component={WayOfLoveCoursePage} />
      <Route path="/onboarding" component={UserOnboarding} />
      <Route path="/church-deck" component={ChurchDeck} />
      <Route path="/vision-deck" component={VisionDeck} />
      <Route path="/learn/features" component={FeaturesDeck} />
      <Route path="/about-deck" component={AboutDeck} />
      <Route path="/prayer-feeds/:slug/manage" component={PrayerFeedManagePage} />
      <Route path="/prayer-feeds" component={PrayerFeedsBrowsePage} />
      <Route path="/prayer-feeds/:slug" component={PrayerFeedDetailPage} />
      {/* Climate-as-feed redirects. The dedicated Climate routes are
          gone; admins manage daily intentions via the generic prayer-
          feed manage page, subscribers visit the generic feed detail
          page, and the parish-detection surface (only ever shown to
          climate-only signups) lands on settings. */}
      <Route path="/climate/admin">{() => <RedirectTo to="/prayer-feeds/phoebe-climate/manage" />}</Route>
      <Route path="/climate/parish">{() => <RedirectTo to="/settings" />}</Route>
      <Route path="/climate">{() => <RedirectTo to="/prayer-feeds/phoebe-climate" />}</Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

// On iOS the WebView keeps yesterday's React state when the user re-opens
// the app the next morning — react-query has no `refetchOnWindowFocus`
// (we disabled it for Wi-Fi flakiness) and Capacitor doesn't auto-reload.
// Result: the dashboard renders stale data — e.g. the prayer-list card
// still says "Pray again" from yesterday's completion. Tracking the
// calendar day on visibility change lets us invalidate everything once
// per day boundary while leaving same-day re-entries alone.
function DayBoundaryRefresh() {
  useEffect(() => {
    let lastDay = new Date().toDateString();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const today = new Date().toDateString();
      if (today !== lastDay) {
        lastDay = today;
        queryClient.invalidateQueries();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return null;
}

// Refresh react-query caches every time the iOS app returns to the
// foreground — the native shell dispatches `phoebe:appactive` from
// Capacitor's appStateChange. Without this, an app that sat in the
// background overnight (or for a few minutes during a conversation)
// re-paints its last frame with stale data: yesterday's "you've
// already prayed" state, an unreceived comment, a closed letter that
// still shows as open. Throttled to once every 5s so a quick app-
// switch dance doesn't fire a refetch storm.
function ForegroundRefresh() {
  useEffect(() => {
    let lastInvalidate = 0;
    // Time the WebView last went hidden (app backgrounded, or the in-app
    // browser/SFSafari covered it). We only refresh after a meaningful gap.
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
    };
    const onActive = () => {
      const now = Date.now();
      // Only re-fire the (large) dashboard fan-out after a real time away —
      // a quick app-switch or returning from the in-app browser shouldn't
      // invalidate the whole cache. The 30s query staleTime already covers
      // short gaps; we only invalidate after ~60s backgrounded.
      const awayMs = hiddenAt ? now - hiddenAt : 0;
      hiddenAt = 0;
      if (awayMs < 60_000) return;
      if (now - lastInvalidate < 5000) return;
      lastInvalidate = now;
      queryClient.invalidateQueries();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("phoebe:appactive", onActive);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("phoebe:appactive", onActive);
    };
  }, []);
  return null;
}

// Android hardware Back button. Without a handler the first Back press exits the
// app from anywhere. Route Back through the WebView history so it navigates
// within Phoebe; from a root screen, minimise (background) rather than kill the
// app so timers/audio/state survive — like the iOS home gesture. No-op on iOS
// (no hardware Back) and on plain web (no Capacitor runtime). Registered via the
// window.Capacitor.Plugins shim to match the app's other native access points.
function AndroidBackButton() {
  useEffect(() => {
    type BackEv = { canGoBack?: boolean };
    type AppPlugin = {
      addListener?: (
        event: "backButton",
        cb: (ev: BackEv) => void,
      ) => Promise<{ remove: () => void }> | { remove: () => void };
      minimizeApp?: () => void;
    };
    const appPlugin = (window as unknown as {
      Capacitor?: { Plugins?: { App?: AppPlugin } };
    }).Capacitor?.Plugins?.App;
    if (!appPlugin?.addListener) return; // not Android native — nothing to wire

    let handle: { remove: () => void } | null = null;
    const onBack = (ev: BackEv) => {
      // Trust Capacitor's own canGoBack (computed from the WebView history);
      // fall back to history length if it's ever absent.
      const canGoBack = typeof ev?.canGoBack === "boolean"
        ? ev.canGoBack
        : window.history.length > 1;
      if (canGoBack) window.history.back();
      else appPlugin.minimizeApp?.();
    };
    Promise.resolve(appPlugin.addListener("backButton", onBack))
      .then((h) => { handle = h; })
      .catch(() => { /* listener unavailable — no-op */ });
    return () => { try { handle?.remove(); } catch { /* ignore */ } };
  }, []);
  return null;
}


function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={rqPersistOptions}
      onSuccess={() => {
        // The instant the persisted cache is restored — before the dashboard
        // mounts and while the opening splash still covers the screen — kick the
        // heaviest home queries so their network round-trips run in the
        // background and the content is ready (or close) by the time the splash
        // is dismissed. Same keys/queryFn the dashboard uses, so they dedupe.
        // Only when a session is cached, so an unauthenticated open doesn't 401.
        if (!queryClient.getQueryData(["/api/auth/me"])) return;
        const warm = (key: string) =>
          void queryClient.prefetchQuery({ queryKey: [key], queryFn: () => apiRequest("GET", key) });
        warm("/api/moments");
        warm("/api/prayer-requests");
        warm("/api/prayer-streak");
        warm("/api/me/garden-week");
        warm("/api/me/prayer-days");
      }}
    >
      <TooltipProvider>
        <ErrorBoundary>
          <GlobalButtonHaptics />
          <LocaleSync />
          <AppOpenTracker />
          <WidgetSync />
          <PushPermissionPrompt />
          <WebPushPermissionPrompt />
          <ForegroundPushToast />
          <NetworkBanner />
          <ServerDownScreen />
          <DayBoundaryRefresh />
          <ForegroundRefresh />
          <AndroidBackButton />
          <NotificationTapPrewarm />
          <PullToRefresh />
          <PageFadeOverlay />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ScrollToTopOnNavigate />
            <PendingRoutineInviteRedirect />
            <CustomAnchorServerSync />
            <ReflectionReturnRedirect />
            <ReflectionPreheater />
            <OfficeAudioPreloader />
            {/* Bottom-anchored prompt cards (live broadcast banner + App
                Store download), stacked so they never overlap. Inside the
                router so the live banner's "Watch →" can SPA-navigate to
                /ncmp/watch. */}
            <BottomPromptStack />
            {/* Desktop install banner — inside the router so it can react to
                navigation (e.g. stay hidden during the customize flow). */}
            <DesktopAppPrompt />
            {/* Global podcast player — mounted above the route Switch so
                audio keeps playing as you navigate. Renders its own
                persistent <audio> + mini-player bar. */}
            <PodcastPlayerProvider>
              <GuestGate>
                <PilotGate>
                  <Router />
                </PilotGate>
              </GuestGate>
            </PodcastPlayerProvider>
          </WouterRouter>
          <Toaster />
        </ErrorBoundary>
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
}

export default App;
