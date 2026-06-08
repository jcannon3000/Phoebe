import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { Component, useEffect, lazy, Suspense, type ReactNode, type ErrorInfo } from "react";
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
    // Frontend audit: this is the only client-side crash signal today.
    // console.error keeps it in the device console / Safari Web
    // Inspector; wire a browser error reporter (Sentry) here so
    // white-screen crashes on real phones become visible — currently
    // they're invisible to the team.
    console.error("React render error:", error, info);
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
const RitualDetail = lazy(() => import("./pages/ritual-detail"));
const RitualSchedule = lazy(() => import("./pages/ritual-schedule"));
const GuestSchedule = lazy(() => import("./pages/guest-schedule"));
const InvitePage = lazy(() => import("./pages/invite"));
const People = lazy(() => import("./pages/people"));
const PersonProfile = lazy(() => import("./pages/person"));
const ReportUserPage = lazy(() => import("./pages/report-user"));
const ReportsAdminPage = lazy(() => import("./pages/reports-admin"));
const FindFriendsPage = lazy(() => import("./pages/find-friends"));
const TraditionNew = lazy(() => import("./pages/tradition-new"));
const LettersPage = lazy(() => import("./pages/Letters/LettersPage"));
const MessagesPage = lazy(() => import("./pages/messages"));
const MessageNewPage = lazy(() => import("./pages/message-new"));
const MessageThreadPage = lazy(() => import("./pages/message-thread"));
const MessageWritePage = lazy(() => import("./pages/message-write"));
const CorrespondencePage = lazy(() => import("./pages/Letters/CorrespondencePage"));
const WriteLetter = lazy(() => import("./pages/Letters/WriteLetter"));
const ReadLetter = lazy(() => import("./pages/Letters/ReadLetter"));
const LetterInvitePage = lazy(() => import("./pages/Letters/InvitePage"));
const LetterNew = lazy(() => import("./pages/Letters/LetterNew"));
const LetterSplash = lazy(() => import("./pages/Letters/LetterSplash"));
const ForgotPassword = lazy(() => import("./pages/forgot-password"));
const ResetPassword = lazy(() => import("./pages/reset-password"));
const PrayerChooserPage = lazy(() => import("./pages/prayer-chooser"));
const NcmpWatchPage = lazy(() => import("./pages/ncmp-watch"));
const OfficePodcastPage = lazy(() => import("./pages/office-podcast"));
const MenuPage = lazy(() => import("./pages/menu"));
const MenuBcpPage = lazy(() => import("./pages/menu-bcp"));
const MenuPracticesPage = lazy(() => import("./pages/menu-practices"));
const MenuReflectionsPage = lazy(() => import("./pages/menu-reflections"));
const ReflectionReadPage = lazy(() => import("./pages/reflection-read"));
const MenuAudioPage = lazy(() => import("./pages/menu-audio"));
const MenuResourcesPage = lazy(() => import("./pages/menu-resources"));
const HomeBetaPage = lazy(() => import("./pages/home-beta"));
const HomeBetaSectionPage = lazy(() => import("./pages/home-beta-section"));
const WayOfLoveWeekPage = lazy(() => import("./pages/way-of-love-week"));
const WeeklyReviewPage = lazy(() => import("./pages/weekly-review"));
const VideosPage = lazy(() => import("./pages/videos"));
const GatherNewPage = lazy(() => import("./pages/gather-new"));
const GatherRespondPage = lazy(() => import("./pages/gather-respond"));
const GatherManagePage = lazy(() => import("./pages/gather-manage"));
const WayOfLoveJourneyPage = lazy(() => import("./pages/way-of-love-journey"));
const OfficeFmPage = lazy(() => import("./pages/office-fm"));
const PodcastsPage = lazy(() => import("./pages/podcasts"));
const BuildingFaithPage = lazy(() => import("./pages/building-faith"));
const NewsPage = lazy(() => import("./pages/news"));
const PodcastPublisherPage = lazy(() => import("./pages/podcast-publisher"));
const PodcastShowPage = lazy(() => import("./pages/podcast-show"));
const FddSitPage = lazy(() => import("./pages/fdd-sit"));
const ReflectCacPage = lazy(() => import("./pages/reflect-cac"));
const JournalPage = lazy(() => import("./pages/journal"));
const GatheringsPage = lazy(() => import("./pages/gatherings"));
const GatheringNewPage = lazy(() => import("./pages/gathering-new"));
const GatheringDetailPage = lazy(() => import("./pages/gathering-detail"));
const GatheringSettings = lazy(() => import("./pages/gathering-settings"));
const MomentNew = lazy(() => import("./pages/moment-new"));
const MomentDetail = lazy(() => import("./pages/moment-detail"));
const MomentPostPage = lazy(() => import("./pages/moment-post"));
const LectioPage = lazy(() => import("./pages/lectio"));
const MorningPrayerPage = lazy(() => import("./pages/morning-prayer"));
const MomentsDashboard = lazy(() => import("./pages/moments-dashboard"));
const MomentRedirect = lazy(() => import("./pages/moment-redirect"));
const PrayerListPage = lazy(() => import("./pages/prayer-list"));
const PrayerModePage = lazy(() => import("./pages/prayer-mode"));
const DailyPracticePage = lazy(() => import("./pages/daily-practice"));
const RuleOfLifePage = lazy(() => import("./pages/rule-of-life"));
const RuleOfLifeViewPage = lazy(() => import("./pages/rule-of-life-view"));
const BeginPrayerPage = lazy(() => import("./pages/begin-prayer"));
const PrayerStartPage = lazy(() => import("./pages/prayer-start"));
const PrayerRequestDetailPage = lazy(() => import("./pages/prayer-request-detail"));
const ActionDetailPage = lazy(() => import("./pages/action-detail"));
const ActionNewPage = lazy(() => import("./pages/action-new"));
const PrayerForNew = lazy(() => import("./pages/prayer-for-new"));
const PrayerRequestNew = lazy(() => import("./pages/prayer-request-new"));
const PrayerForDetail = lazy(() => import("./pages/prayer-for-detail"));
const MyPrayerRequestsPage = lazy(() => import("./pages/my-prayer-requests"));
const PrayersForMePage = lazy(() => import("./pages/prayers-for-me"));
const SettingsPage = lazy(() => import("./pages/settings"));
const AboutPage = lazy(() => import("./pages/about"));
const PrivacyPage = lazy(() => import("./pages/privacy"));
const TermsPage = lazy(() => import("./pages/terms"));
const InvitationsPage = lazy(() => import("./pages/invitations"));
const BcpPage = lazy(() => import("./pages/bcp"));
const OfficesPage = lazy(() => import("./pages/offices"));
const ExamenPage = lazy(() => import("./pages/examen"));
const ContemplationPage = lazy(() => import("./pages/contemplation"));
const SaintsIndex = lazy(() => import("./pages/Saints/SaintsIndex"));
const CustomizeHomePage = lazy(() => import("./pages/customize-home"));
const CustomizeHomeAddPage = lazy(() =>
  import("./pages/customize-home").then((m) => ({ default: m.CustomizeHomeAddPage })),
);
const GratitudePage = lazy(() => import("./pages/gratitude"));
const BcpIntercessionsPage = lazy(() => import("./pages/bcp-intercessions"));
const BcpDailyOfficePage = lazy(() => import("./pages/bcp-daily-office"));
const BcpDailyDevotionPage = lazy(() => import("./pages/bcp-daily-devotion"));
const OfficeSettingsPage = lazy(() => import("./pages/office-settings"));
const BcpPsalterPage = lazy(() => import("./pages/bcp-psalter"));
const BcpCollectsPage = lazy(() => import("./pages/bcp-collects"));
const PublicPrayerPage = lazy(() => import("./pages/public-prayer"));
const PublicPrayerRequestPage = lazy(() => import("./pages/public-prayer-request"));
const PublicLettersPage = lazy(() => import("./pages/public-letters"));
const PublicFeedPage = lazy(() => import("./pages/public-feed"));
const CommunitiesPage = lazy(() => import("./pages/communities"));
const CommunitiesBrowsePage = lazy(() => import("./pages/communities-browse"));
const CommunityRequestsPage = lazy(() => import("./pages/community-requests"));
const WelcomePage = lazy(() => import("./pages/welcome"));
import WelcomePublicPage from "./pages/welcome-public";
const CommunityNewPage = lazy(() => import("./pages/community-new"));
const CommunityDetailPage = lazy(() => import("./pages/community-detail"));
const CommunityAskPage = lazy(() => import("./pages/community-ask"));
const CommunityReflectionPage = lazy(() => import("./pages/community-reflection"));
const CommunitySundayReflectionPage = lazy(() => import("./pages/community-sunday-reflection"));
const SharePrayerPage = lazy(() => import("./pages/share-prayer"));
const CommunitySettingsPage = lazy(() => import("./pages/community-settings"));
const CommunityJoinPage = lazy(() => import("./pages/community-join"));
const BetaAdminPage = lazy(() => import("./pages/beta-admin"));
const WaitlistAdminPage = lazy(() => import("./pages/waitlist-admin"));
const BetaClaimPage = lazy(() => import("./pages/beta-claim"));
const AdminToolsPage = lazy(() => import("./pages/admin-tools"));
const AdminMinistriesPage = lazy(() => import("./pages/admin-ministries"));
const AdminUserMetricsPage = lazy(() => import("./pages/admin-user-metrics"));
const MyPrayerFeedsPage = lazy(() => import("./pages/my-prayer-feeds"));
const AdminNewsletterPage = lazy(() => import("./pages/admin-newsletter"));
const LearnPage = lazy(() => import("./pages/learn"));
const ChurchDeck = lazy(() => import("./pages/church-deck"));
const FeaturesDeck = lazy(() => import("./pages/features-deck"));
const UserOnboarding = lazy(() => import("./pages/user-onboarding"));
const FeedbackPage = lazy(() => import("./pages/feedback"));
const MutedUsersPage = lazy(() => import("./pages/muted-users"));
const PrayerFeedNewPage = lazy(() => import("./pages/prayer-feed-new"));
const PrayerFeedManagePage = lazy(() => import("./pages/prayer-feed-manage"));
const PrayerFeedsBrowsePage = lazy(() => import("./pages/prayer-feeds-browse"));
const PrayerFeedDetailPage = lazy(() => import("./pages/prayer-feed-detail"));
const ParishDashboard = lazy(() => import("./pages/parish-dashboard"));
const ParishOnboarding = lazy(() => import("./pages/parish-onboarding"));
const ParishSettings = lazy(() => import("./pages/parish-settings"));
const ParishCelebration = lazy(() => import("./pages/parish-celebration"));
const ParishAdmin = lazy(() => import("./pages/parish-admin"));
const ParishNewPage = lazy(() => import("./pages/parish-new"));
const ParishConcernsPage = lazy(() => import("./pages/parish-concerns"));
const ParishIntercessionsPage = lazy(() => import("./pages/parish-intercessions"));
import { useAuth as useAuthForGate } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { PHOEBE_PARISH_ENABLED } from "@/lib/parishFlag";

// Climate is now just a prayer feed (slug: phoebe-climate). The old
// /climate*, /climate/admin, /climate/parish routes redirect to the
// generic prayer-feed surfaces so existing bookmarks and links keep
// working.
function RedirectTo({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [to, setLocation]);
  return null;
}

// Retry policy tuned for flaky / captive-portal Wi-Fi (libraries, hotels,
// coffee shops): a single TLS reset or TCP RST on the first fetch after
// waking shouldn't dump the user onto a blank screen. We retry network
// errors with jittered exponential backoff but stay hands-off on 4xx
// responses — those are real answers from the server, not transport
// hiccups, so retrying just wastes time and risks double-submits.
const queryClient = new QueryClient({
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

// Phoebe Parish — routing gate.
//
// Watches the current path + the user's accessTier and redirects when
// the two don't match. Lives at the top of <Router/> so every navigation
// passes through it. Three rules:
//
//   1. parish-only user on a full-app path → /parish
//      (e.g. they manually typed /people, or hit a stale push deep-link
//       from before they were demoted)
//   2. parish-only user with no parish_feed_id (race) → /parish/onboarding
//   3. unassigned user → /parish/onboarding
//      (signed up but hasn't picked a parish yet — only matters for the
//       parish-tier signup flow we're building; existing beta users skip
//       this branch entirely because they're "full" tier)
//
// Anything PUBLIC (BCP, daily-office, settings, the parish routes
// themselves) is allow-listed — parish users SHOULD be able to read
// the BCP and pray the offices. The denylist is everything that
// surfaces user-generated or community content.
const PARISH_DENIED_PATHS = [
  "/dashboard",
  "/people",
  "/people/find",
  "/letters",
  "/letter",
  "/communities",
  "/community",
  "/prayer-list",
  "/my-prayer-requests",
  "/prayers-for-me",
  "/prayer-requests",
  "/pray-for",
  "/pray-request",
  "/practices",
  "/moment",
  "/moments",
  "/gatherings",
  "/ritual",
  "/tradition",
];

function ParishGate({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuthForGate();
  // Beta users sit in the "full" tier (beta wins the tier derivation
  // in parishGate.ts), so the redirect below would bounce them out of
  // Parish even though Parish is a beta-only feature. Carve them out
  // so they can preview the picker + dashboard end-to-end. The drawer
  // entry that surfaces /parish is itself gated on rawIsBeta in
  // layout.tsx, so non-beta users still have no way in.
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();

  useEffect(() => {
    // Tucked-away mode: the entire Parish flow is dormant. Don't
    // redirect anyone, don't read the access tier, just pass through.
    // Flip PHOEBE_PARISH_ENABLED in lib/parishFlag.ts (client + server)
    // when ready to roll Parish out.
    if (!PHOEBE_PARISH_ENABLED) return;
    if (isLoading || betaLoading || !user) return;
    if (user.accessTier === "full") {
      // Beta users get to preview Parish. Skip the redirect so they
      // can land on /parish, /parish/onboarding, /parish/admin, etc.
      // from the drawer entry. They remain full-tier the whole time;
      // subscribing to a parish doesn't demote them (beta wins).
      if (rawIsBeta) return;
      // Non-beta full-app users shouldn't get stuck on /parish; if
      // they navigated there manually, send them home.
      if (location === "/parish" || location.startsWith("/parish/")) {
        setLocation("/dashboard");
      }
      return;
    }
    if (user.accessTier === "parish-only" || user.accessTier === "offices-only") {
      // Both restricted tiers get the same allowlist — the parish
      // surfaces + BCP + settings + the root onboarding fall-through.
      // An offices-only user has no parish, but its home (parish
      // dashboard) and settings live under /parish, so the allowlist
      // is identical; everything else bounces to /parish.
      const allowed =
        location === "/" ||
        location === "/parish" ||
        location === "/parish/onboarding" ||
        location === "/parish/settings" ||
        // /settings is the full settings page reached via the drawer
        // on the offices-only Layout. We allow it here so the
        // ParishGate doesn't bounce offices-only users back to
        // /parish the moment they tap "Settings" in the menu. The
        // page itself degrades gracefully for limited tiers (the
        // queries it makes resolve to empty / no-op for offices-only).
        location === "/settings" ||
        // Community-join links — offices-only / parish-only users
        // who receive a community invite from a friend or admin
        // need to land on this page even though /communities itself
        // is blocked for them. The page auto-joins them and
        // invalidates /api/auth/me on success; once the joined
        // group_members row exists, parishGate flips the derived
        // accessTier to "full" and the gate stops applying.
        location.startsWith("/communities/join/") ||
        // Public Prayer Request share links — /p/:token. An offices-
        // only viewer landing on a friend's shared prayer request
        // should be able to read it + tap Amen, which auto-Fellows
        // them with the owner. Without this carve-out, ParishGate
        // bounces them to /parish before the page renders.
        location.startsWith("/p/") ||
        location === "/parish/admin" ||
        location.startsWith("/parish/celebration") ||
        location.startsWith("/bcp") ||
        // The offices-only home now shows the same PrayerOfficeCard +
        // FeedPrayerCard surfaces the full app does, so the chooser
        // sheet and the feed-walk slideshow have to be reachable.
        // Same for the moment detail page each feed-intercession
        // card on the Prayer List section taps through to.
        location === "/prayer-chooser" ||
        location.startsWith("/prayer-mode") ||
        // Contemplation timer + Daily Examen + Gratitude — reflective-
        // prayer surfaces open to every tier (offices-only + parish-only).
        location === "/contemplation" ||
        location === "/examen" ||
        location === "/gratitude" ||
        location.startsWith("/moments/") ||
        // Public prayer feeds — discovery + detail. Offices-only and
        // parish-only members may browse and subscribe to public feeds
        // (the API enforces public/private; feed management stays
        // beta-only).
        location.startsWith("/prayer-feeds") ||
        // Letters is community-admins-only now — no carve-out for the
        // offices-only / parish-only tiers, so /letters* bounces home.
        location === "/about" ||
        location === "/privacy" ||
        location === "/terms" ||
        location === "/feedback" ||
        location.startsWith("/onboarding");
      if (!allowed) {
        // Anything in the denylist OR anything not in the allowlist
        // bounces home.
        setLocation("/parish");
      }
      return;
    }
    if (user.accessTier === "unassigned") {
      if (location !== "/parish/onboarding" && location !== "/" && !location.startsWith("/onboarding")) {
        setLocation("/parish/onboarding");
      }
    }
  }, [location, setLocation, user, isLoading, rawIsBeta, betaLoading]);

  void PARISH_DENIED_PATHS; // explicit denylist kept for readability + future toggling

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
    // heavy non-landing pages — prayer-mode, lectio, community-detail,
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
      <Route path="/prayer-chooser" component={PrayerChooserPage} />
      <Route path="/ncmp/watch" component={NcmpWatchPage} />
      <Route path="/podcast/morning-office" component={OfficePodcastPage} />
      <Route path="/podcast/evening-office" component={OfficePodcastPage} />
      <Route path="/menu" component={MenuPage} />
      <Route path="/menu/bcp" component={MenuBcpPage} />
      <Route path="/menu/practices" component={MenuPracticesPage} />
      <Route path="/menu/reflections" component={MenuReflectionsPage} />
      <Route path="/menu/reflections/:source" component={ReflectionReadPage} />
      <Route path="/menu/audio" component={MenuAudioPage} />
      <Route path="/menu/resources" component={MenuResourcesPage} />
      <Route path="/office/forward" component={OfficeFmPage} />
      {/* Podcast content browser. Exact /podcasts is the Discover
          index; /show/:slug must precede /:publisher so "show" isn't
          captured as a publisher slug. */}
      <Route path="/podcasts" component={PodcastsPage} />
      <Route path="/reflect/fdd" component={FddSitPage} />
      <Route path="/reflect/cac" component={ReflectCacPage} />
      <Route path="/journal" component={JournalPage} />
      <Route path="/podcasts/show/:slug" component={PodcastShowPage} />
      <Route path="/news" component={NewsPage} />
      <Route path="/building-faith" component={BuildingFaithPage} />
      <Route path="/podcasts/:publisher" component={PodcastPublisherPage} />
      <Route path="/dashboard" component={Dashboard} />
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
      {/* Gather — propose/respond/manage. /new before /:token so it isn't
          swallowed as a share token; the /:token respond page is public. */}
      <Route path="/gather/new" component={GatherNewPage} />
      <Route path="/gather/:id/manage" component={GatherManagePage} />
      <Route path="/gather/:token" component={GatherRespondPage} />
      <Route path="/home-beta/:section" component={HomeBetaSectionPage} />
      <Route path="/home-beta">{() => <RedirectTo to="/dashboard" />}</Route>
      {/* Phoebe Parish — simplified tier. /parish is the dashboard
          for parish-only users; /parish/onboarding is the parish
          picker. The router-level gate (ParishGate below) redirects
          parish-only users away from full-app routes and full-app
          users away from /parish, so these are reachable but not
          conflicting. */}
      <Route path="/parish" component={ParishDashboard} />
      <Route path="/parish/onboarding" component={ParishOnboarding} />
      <Route path="/parish/settings" component={ParishSettings} />
      <Route path="/parish/celebration" component={ParishCelebration} />
      <Route path="/parish/admin" component={ParishAdmin} />
      {/* /parish/new — self-serve parish creation (beta-gated; page
          re-checks). The creator becomes the first admin and gets
          dropped on /parish/admin to start authoring. */}
      <Route path="/parish/new" component={ParishNewPage} />
      <Route path="/parish/concerns" component={ParishConcernsPage} />
      <Route path="/parish/intercessions" component={ParishIntercessionsPage} />
      <Route path="/gatherings" component={GatheringsPage} />
      <Route path="/gatherings/new" component={GatheringNewPage} />
      <Route path="/gatherings/:id" component={GatheringDetailPage} />
      <Route path="/gatherings/:id/settings" component={GatheringSettings} />
      <Route path="/ritual/:id/schedule" component={RitualSchedule} />
      <Route path="/tradition/new" component={TraditionNew} />
      <Route path="/moment/new" component={MomentNew} />
      <Route path="/m/:userToken" component={MomentRedirect} />
      <Route path="/moment/:momentToken/:userToken" component={MomentPostPage} />
      <Route path="/lectio/:momentToken/:userToken" component={LectioPage} />
      <Route path="/moments/:id" component={MomentDetail} />
      <Route path="/practices" component={MomentsDashboard} />
      <Route path="/morning-prayer/:momentId/:token" component={MorningPrayerPage} />
      <Route path="/ritual/:id" component={RitualDetail} />
      <Route path="/schedule/:token" component={GuestSchedule} />
      <Route path="/invite/:token" component={InvitePage} />
      <Route path="/letter/:id" component={LetterSplash} />
      <Route path="/letters" component={LettersPage} />
      <Route path="/letters/new" component={LetterNew} />
      {/* Compose the first letter to a known person. No correspondence
          exists yet — WriteLetter runs in "new" mode and the dialogue
          is created atomically when the letter is sent. */}
      <Route path="/letters/compose" component={WriteLetter} />
      <Route path="/letters/invite/:token" component={LetterInvitePage} />
      <Route path="/i/:token" component={LetterInvitePage} />
      <Route path="/letters/:id/write" component={WriteLetter} />
      <Route path="/letters/:id/read/:letterId" component={ReadLetter} />
      <Route path="/letters/:id" component={CorrespondencePage} />
      {/* Beta Messages — unlimited 1:1 messaging. /new before /:id so
          "new" isn't captured as a conversation id. */}
      <Route path="/messages/new" component={MessageNewPage} />
      <Route path="/messages/:id/write" component={MessageWritePage} />
      <Route path="/messages/:id" component={MessageThreadPage} />
      <Route path="/messages" component={MessagesPage} />
      <Route path="/people" component={People} />
      <Route path="/people/find" component={FindFriendsPage} />
      <Route path="/people/:email/report" component={ReportUserPage} />
      <Route path="/admin/reports" component={ReportsAdminPage} />
      <Route path="/admin/tools" component={AdminToolsPage} />
      <Route path="/admin/ministries" component={AdminMinistriesPage} />
      <Route path="/admin/users" component={AdminUserMetricsPage} />
      <Route path="/my-prayer-feeds" component={MyPrayerFeedsPage} />
      <Route path="/admin/newsletter" component={AdminNewsletterPage} />
      <Route path="/prayer-list" component={PrayerListPage} />
      <Route path="/my-prayer-requests" component={MyPrayerRequestsPage} />
      <Route path="/prayers-for-me" component={PrayersForMePage} />
      <Route path="/prayer-mode" component={PrayerModePage} />
      <Route path="/begin-prayer" component={BeginPrayerPage} />
      <Route path="/prayer-start" component={PrayerStartPage} />
      <Route path="/prayer-requests/:id" component={PrayerRequestDetailPage} />
      <Route path="/actions/new" component={ActionNewPage} />
      <Route path="/actions/:id" component={ActionDetailPage} />
      {/* /pray-for/new (no email) must sit above the two /pray-for/:email
          routes, otherwise "new" would match as an email param. */}
      <Route path="/pray-for/new" component={PrayerForNew} />
      <Route path="/pray-for/new/:email" component={PrayerForNew} />
      <Route path="/pray-request/new" component={PrayerRequestNew} />
      <Route path="/pray-for/:email" component={PrayerForDetail} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/daily-practice" component={DailyPracticePage} />
      {/* /rule-of-life/:id must sit above /rule-of-life so the id param isn't lost */}
      <Route path="/rule-of-life/:id" component={RuleOfLifeViewPage} />
      <Route path="/rule-of-life" component={RuleOfLifePage} />
      {/* /customize-home/add must sit above /customize-home so it matches first */}
      <Route path="/customize-home/add" component={CustomizeHomeAddPage} />
      <Route path="/customize-home" component={CustomizeHomePage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/invitations" component={InvitationsPage} />
      <Route path="/offices" component={OfficesPage} />
      <Route path="/examen" component={ExamenPage} />
      <Route path="/contemplation" component={ContemplationPage} />
      {/* Saints — a single browsable/searchable index (BCP-Prayers-style). */}
      <Route path="/saints" component={SaintsIndex} />
      <Route path="/gratitude" component={GratitudePage} />
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
      <Route path="/write" component={PublicLettersPage} />
      {/* /feed/:slug — public, no-login landing for a single prayer feed.
          Logged-in users are redirected by the page to /prayer-feeds/:slug. */}
      <Route path="/feed/:slug" component={PublicFeedPage} />
      <Route path="/communities" component={CommunitiesPage} />
      <Route path="/communities/browse" component={CommunitiesBrowsePage} />
      <Route path="/communities/new" component={CommunityNewPage} />
      <Route path="/communities/join/:slug/:token" component={CommunityJoinPage} />
      <Route path="/welcome" component={WelcomePage} />
      <Route path="/communities/:slug/requests" component={CommunityRequestsPage} />
      <Route path="/communities/:slug/settings" component={CommunitySettingsPage} />
      {/* /metrics and /settings both land on CommunitySettingsPage; the
          page reads the URL and pre-selects the correct tab. The standalone
          CommunityMetricsPage is kept as the module that exports the
          reusable MetricsDashboard — it's no longer rendered as a route. */}
      <Route path="/communities/:slug/metrics" component={CommunitySettingsPage} />
      <Route path="/communities/:slug/share-prayer" component={SharePrayerPage} />
      <Route path="/communities/:slug/ask" component={CommunityAskPage} />
      <Route path="/communities/:slug/reflection" component={CommunityReflectionPage} />
      <Route path="/communities/:slug/sunday-reflection" component={CommunitySundayReflectionPage} />
      <Route path="/communities/:slug" component={CommunityDetailPage} />
      <Route path="/beta" component={BetaAdminPage} />
      <Route path="/waitlist" component={WaitlistAdminPage} />
      <Route path="/beta/claim" component={BetaClaimPage} />
      <Route path="/learn" component={LearnPage} />
      <Route path="/onboarding" component={UserOnboarding} />
      <Route path="/church-deck" component={ChurchDeck} />
      <Route path="/learn/features" component={FeaturesDeck} />
      <Route path="/feedback" component={FeedbackPage} />
      <Route path="/settings/muted" component={MutedUsersPage} />
      <Route path="/people/:email" component={PersonProfile} />
      <Route path="/prayer-feeds/new" component={PrayerFeedNewPage} />
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

// The in-app browser's bottom-bar Journal button dismisses the browser and
// fires `phoebe:open-journal` from native; take the reader to the journal.
function NativeJournalOpener() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const onOpen = () => setLocation("/journal");
    window.addEventListener("phoebe:open-journal", onOpen);
    return () => window.removeEventListener("phoebe:open-journal", onOpen);
  }, [setLocation]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <GlobalButtonHaptics />
          <LocaleSync />
          <AppOpenTracker />
          <WidgetSync />
          <PushPermissionPrompt />
          <WebPushPermissionPrompt />
          <DesktopAppPrompt />
          <ForegroundPushToast />
          <NetworkBanner />
          <ServerDownScreen />
          <DayBoundaryRefresh />
          <ForegroundRefresh />
          <NotificationTapPrewarm />
          <PullToRefresh />
          <PageFadeOverlay />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ScrollToTopOnNavigate />
            <ReflectionReturnRedirect />
            <ReflectionPreheater />
            <NativeJournalOpener />
            <OfficeAudioPreloader />
            {/* Bottom-anchored prompt cards (live broadcast banner + App
                Store download), stacked so they never overlap. Inside the
                router so the live banner's "Watch →" can SPA-navigate to
                /ncmp/watch. */}
            <BottomPromptStack />
            {/* Global podcast player — mounted above the route Switch so
                audio keeps playing as you navigate. Renders its own
                persistent <audio> + mini-player bar. */}
            <PodcastPlayerProvider>
              <ParishGate>
                <Router />
              </ParishGate>
            </PodcastPlayerProvider>
          </WouterRouter>
          <Toaster />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
