import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Component, type ReactNode, type ErrorInfo } from "react";

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
import PrayerForDetail from "./pages/prayer-for-detail";
import SettingsPage from "./pages/settings";
import AboutPage from "./pages/about";
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
import BellsAdminPage from "./pages/bells-admin";
import BetaClaimPage from "./pages/beta-claim";
import LearnPage from "./pages/learn";
import ChurchDeck from "./pages/church-deck";
import FeaturesDeck from "./pages/features-deck";
import UserOnboarding from "./pages/user-onboarding";
import BellPage from "./pages/bell";
import FeedbackPage from "./pages/feedback";
import MutedUsersPage from "./pages/muted-users";
import PrayerFeedNewPage from "./pages/prayer-feed-new";
import PrayerFeedManagePage from "./pages/prayer-feed-manage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
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
      <Route path="/prayer-list" component={PrayerListPage} />
      <Route path="/prayer-mode" component={PrayerModePage} />
      <Route path="/pray-for/new/:email" component={PrayerForNew} />
      <Route path="/pray-for/:email" component={PrayerForDetail} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/invitations" component={InvitationsPage} />
      <Route path="/bcp" component={BcpPage} />
      <Route path="/bcp/intercessions" component={BcpIntercessionsPage} />
      <Route path="/bcp/daily-office" component={BcpDailyOfficePage} />
      <Route path="/communities" component={CommunitiesPage} />
      <Route path="/communities/new" component={CommunityNewPage} />
      <Route path="/communities/join/:slug/:token" component={CommunityJoinPage} />
      <Route path="/communities/:slug/settings" component={CommunitySettingsPage} />
      <Route path="/communities/:slug" component={CommunityDetailPage} />
      <Route path="/beta" component={BetaAdminPage} />
      <Route path="/waitlist" component={WaitlistAdminPage} />
      <Route path="/bells-admin" component={BellsAdminPage} />
      <Route path="/beta/claim" component={BetaClaimPage} />
      <Route path="/learn" component={LearnPage} />
      <Route path="/onboarding" component={UserOnboarding} />
      <Route path="/church-deck" component={ChurchDeck} />
      <Route path="/learn/features" component={FeaturesDeck} />
      <Route path="/bell" component={BellPage} />
      <Route path="/feedback" component={FeedbackPage} />
      <Route path="/settings/muted" component={MutedUsersPage} />
      <Route path="/people/:email" component={PersonProfile} />
      <Route path="/prayer-feeds/new" component={PrayerFeedNewPage} />
      <Route path="/prayer-feeds/:slug/manage" component={PrayerFeedManagePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
