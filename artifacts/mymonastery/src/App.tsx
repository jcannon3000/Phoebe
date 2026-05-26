import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NetworkBanner } from "@/components/NetworkBanner";
import { ServerDownScreen } from "@/components/ServerDownScreen";
import { GlobalButtonHaptics } from "@/components/GlobalButtonHaptics";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { WebPushPermissionPrompt } from "@/components/WebPushPermissionPrompt";
import { IOSAppDownloadPrompt } from "@/components/IOSAppDownloadPrompt";
import { DesktopAppPrompt } from "@/components/DesktopAppPrompt";
import { AppOpenTracker } from "@/components/AppOpenTracker";
import { ForegroundPushToast } from "@/components/ForegroundPushToast";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Component, useEffect, type ReactNode, type ErrorInfo } from "react";

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

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React render error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", background: "#FAF6F0", minHeight: "100vh" }}>
          <h2 style={{ color: "#C17F24" }}>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap", color: "#2C1810", fontSize: 13 }}>
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = "/dashboard"; }}
            style={{ marginTop: 16, padding: "8px 20px", background: "#2C1810", color: "#E8E4D8", border: "none", borderRadius: 8, cursor: "pointer" }}
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
import Dashboard from "./pages/dashboard";
import RitualDetail from "./pages/ritual-detail";
import RitualSchedule from "./pages/ritual-schedule";
import GuestSchedule from "./pages/guest-schedule";
import InvitePage from "./pages/invite";
import People from "./pages/people";
import PersonProfile from "./pages/person";
import ReportUserPage from "./pages/report-user";
import ReportsAdminPage from "./pages/reports-admin";
import FindFriendsPage from "./pages/find-friends";
import TraditionNew from "./pages/tradition-new";
import LettersPage from "./pages/Letters/LettersPage";
import CorrespondencePage from "./pages/Letters/CorrespondencePage";
import WriteLetter from "./pages/Letters/WriteLetter";
import ReadLetter from "./pages/Letters/ReadLetter";
import LetterInvitePage from "./pages/Letters/InvitePage";
import LetterNew from "./pages/Letters/LetterNew";
import LetterSplash from "./pages/Letters/LetterSplash";
import ForgotPassword from "./pages/forgot-password";
import ResetPassword from "./pages/reset-password";
import PrayerChooserPage from "./pages/prayer-chooser";
import GatheringsPage from "./pages/gatherings";
import GatheringSettings from "./pages/gathering-settings";
import MomentNew from "./pages/moment-new";
import MomentDetail from "./pages/moment-detail";
import MomentPostPage from "./pages/moment-post";
import LectioPage from "./pages/lectio";
import MorningPrayerPage from "./pages/morning-prayer";
import MomentsDashboard from "./pages/moments-dashboard";
import MomentRedirect from "./pages/moment-redirect";
import PrayerListPage from "./pages/prayer-list";
import PrayerModePage from "./pages/prayer-mode";
import PrayerStartPage from "./pages/prayer-start";
import PrayerRequestDetailPage from "./pages/prayer-request-detail";
import ActionDetailPage from "./pages/action-detail";
import ActionNewPage from "./pages/action-new";
import PrayerForNew from "./pages/prayer-for-new";
import PrayerRequestNew from "./pages/prayer-request-new";
import PrayerForDetail from "./pages/prayer-for-detail";
import MyPrayerRequestsPage from "./pages/my-prayer-requests";
import PrayersForMePage from "./pages/prayers-for-me";
import SettingsPage from "./pages/settings";
import AboutPage from "./pages/about";
import PrivacyPage from "./pages/privacy";
import TermsPage from "./pages/terms";
import InvitationsPage from "./pages/invitations";
import BcpPage from "./pages/bcp";
import OfficesPage from "./pages/offices";
import ExamenPage from "./pages/examen";
import ContemplationPage from "./pages/contemplation";
import SaintsIndex from "./pages/Saints/SaintsIndex";
import CustomizeHomePage from "./pages/customize-home";
import GratitudePage from "./pages/gratitude";
import BcpIntercessionsPage from "./pages/bcp-intercessions";
import BcpDailyOfficePage from "./pages/bcp-daily-office";
import BcpDailyDevotionPage from "./pages/bcp-daily-devotion";
import BcpPsalterPage from "./pages/bcp-psalter";
import PublicPrayerPage from "./pages/public-prayer";
import PublicPrayerRequestPage from "./pages/public-prayer-request";
import PublicLettersPage from "./pages/public-letters";
import PublicFeedPage from "./pages/public-feed";
import CommunitiesPage from "./pages/communities";
import CommunitiesBrowsePage from "./pages/communities-browse";
import CommunityRequestsPage from "./pages/community-requests";
import WelcomePage from "./pages/welcome";
import WelcomePublicPage from "./pages/welcome-public";
import CommunityNewPage from "./pages/community-new";
import CommunityDetailPage from "./pages/community-detail";
import CommunityAskPage from "./pages/community-ask";
import SharePrayerPage from "./pages/share-prayer";
import CommunitySettingsPage from "./pages/community-settings";
import CommunityJoinPage from "./pages/community-join";
import BetaAdminPage from "./pages/beta-admin";
import WaitlistAdminPage from "./pages/waitlist-admin";
import BetaClaimPage from "./pages/beta-claim";
import AdminToolsPage from "./pages/admin-tools";
import AdminUserMetricsPage from "./pages/admin-user-metrics";
import MyPrayerFeedsPage from "./pages/my-prayer-feeds";
import AdminNewsletterPage from "./pages/admin-newsletter";
import LearnPage from "./pages/learn";
import ChurchDeck from "./pages/church-deck";
import FeaturesDeck from "./pages/features-deck";
import UserOnboarding from "./pages/user-onboarding";
import FeedbackPage from "./pages/feedback";
import MutedUsersPage from "./pages/muted-users";
import PrayerFeedNewPage from "./pages/prayer-feed-new";
import PrayerFeedManagePage from "./pages/prayer-feed-manage";
import PrayerFeedsBrowsePage from "./pages/prayer-feeds-browse";
import PrayerFeedDetailPage from "./pages/prayer-feed-detail";
import ParishDashboard from "./pages/parish-dashboard";
import ParishOnboarding from "./pages/parish-onboarding";
import ParishSettings from "./pages/parish-settings";
import ParishCelebration from "./pages/parish-celebration";
import ParishAdmin from "./pages/parish-admin";
import ParishNewPage from "./pages/parish-new";
import ParishConcernsPage from "./pages/parish-concerns";
import ParishIntercessionsPage from "./pages/parish-intercessions";
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

function Router() {
  return (
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
      <Route path="/dashboard" component={Dashboard} />
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
      <Route path="/people" component={People} />
      <Route path="/people/find" component={FindFriendsPage} />
      <Route path="/people/:email/report" component={ReportUserPage} />
      <Route path="/admin/reports" component={ReportsAdminPage} />
      <Route path="/admin/tools" component={AdminToolsPage} />
      <Route path="/admin/users" component={AdminUserMetricsPage} />
      <Route path="/my-prayer-feeds" component={MyPrayerFeedsPage} />
      <Route path="/admin/newsletter" component={AdminNewsletterPage} />
      <Route path="/prayer-list" component={PrayerListPage} />
      <Route path="/my-prayer-requests" component={MyPrayerRequestsPage} />
      <Route path="/prayers-for-me" component={PrayersForMePage} />
      <Route path="/prayer-mode" component={PrayerModePage} />
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
      <Route path="/bcp/daily-office" component={BcpDailyOfficePage} />
      <Route path="/bcp/daily-devotions" component={BcpDailyDevotionPage} />
      <Route path="/bcp/psalter" component={BcpPsalterPage} />
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
    const onActive = () => {
      const now = Date.now();
      if (now - lastInvalidate < 5000) return;
      lastInvalidate = now;
      queryClient.invalidateQueries();
    };
    window.addEventListener("phoebe:appactive", onActive);
    return () => window.removeEventListener("phoebe:appactive", onActive);
  }, []);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <GlobalButtonHaptics />
          <AppOpenTracker />
          <PushPermissionPrompt />
          <WebPushPermissionPrompt />
          <IOSAppDownloadPrompt />
          <DesktopAppPrompt />
          <ForegroundPushToast />
          <NetworkBanner />
          <ServerDownScreen />
          <DayBoundaryRefresh />
          <ForegroundRefresh />
          <NotificationTapPrewarm />
          <PullToRefresh />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ScrollToTopOnNavigate />
            <ParishGate>
              <Router />
            </ParishGate>
          </WouterRouter>
          <Toaster />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
