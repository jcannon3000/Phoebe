import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NetworkBanner } from "@/components/NetworkBanner";
import { GlobalButtonHaptics } from "@/components/GlobalButtonHaptics";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { ForegroundPushToast } from "@/components/ForegroundPushToast";
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
import GatheringsPage from "./pages/gatherings";
import MomentNew from "./pages/moment-new";
import MomentDetail from "./pages/moment-detail";
import MomentPostPage from "./pages/moment-post";
import LectioPage from "./pages/lectio";
import MorningPrayerPage from "./pages/morning-prayer";
import MomentsDashboard from "./pages/moments-dashboard";
import MomentRedirect from "./pages/moment-redirect";
import PrayerListPage from "./pages/prayer-list";
import PrayerModePage from "./pages/prayer-mode";
import PrayerForNew from "./pages/prayer-for-new";
import PrayerRequestNew from "./pages/prayer-request-new";
import PrayerForDetail from "./pages/prayer-for-detail";
import SettingsPage from "./pages/settings";
import AboutPage from "./pages/about";
import PrivacyPage from "./pages/privacy";
import InvitationsPage from "./pages/invitations";
import BcpPage from "./pages/bcp";
import BcpIntercessionsPage from "./pages/bcp-intercessions";
import BcpDailyOfficePage from "./pages/bcp-daily-office";
import CommunitiesPage from "./pages/communities";
import CommunityNewPage from "./pages/community-new";
import CommunityDetailPage from "./pages/community-detail";
import CommunitySettingsPage from "./pages/community-settings";
import CommunityJoinPage from "./pages/community-join";
import BetaAdminPage from "./pages/beta-admin";
import WaitlistAdminPage from "./pages/waitlist-admin";
import BetaClaimPage from "./pages/beta-claim";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Onboarding} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/gatherings" component={GatheringsPage} />
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
      <Route path="/letters/invite/:token" component={LetterInvitePage} />
      <Route path="/i/:token" component={LetterInvitePage} />
      <Route path="/letters/:id/write" component={WriteLetter} />
      <Route path="/letters/:id/read/:letterId" component={ReadLetter} />
      <Route path="/letters/:id" component={CorrespondencePage} />
      <Route path="/people" component={People} />
      <Route path="/people/find" component={FindFriendsPage} />
      <Route path="/prayer-list" component={PrayerListPage} />
      <Route path="/prayer-mode" component={PrayerModePage} />
      {/* /pray-for/new (no email) must sit above the two /pray-for/:email
          routes, otherwise "new" would match as an email param. */}
      <Route path="/pray-for/new" component={PrayerForNew} />
      <Route path="/pray-for/new/:email" component={PrayerForNew} />
      <Route path="/pray-request/new" component={PrayerRequestNew} />
      <Route path="/pray-for/:email" component={PrayerForDetail} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/invitations" component={InvitationsPage} />
      <Route path="/bcp" component={BcpPage} />
      <Route path="/bcp/intercessions" component={BcpIntercessionsPage} />
      <Route path="/bcp/daily-office" component={BcpDailyOfficePage} />
      <Route path="/communities" component={CommunitiesPage} />
      <Route path="/communities/new" component={CommunityNewPage} />
      <Route path="/communities/join/:slug/:token" component={CommunityJoinPage} />
      <Route path="/communities/:slug/settings" component={CommunitySettingsPage} />
      {/* /metrics and /settings both land on CommunitySettingsPage; the
          page reads the URL and pre-selects the correct tab. The standalone
          CommunityMetricsPage is kept as the module that exports the
          reusable MetricsDashboard — it's no longer rendered as a route. */}
      <Route path="/communities/:slug/metrics" component={CommunitySettingsPage} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <GlobalButtonHaptics />
          <PushPermissionPrompt />
          <ForegroundPushToast />
          <NetworkBanner />
          <DayBoundaryRefresh />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ScrollToTopOnNavigate />
            <Router />
          </WouterRouter>
          <Toaster />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
