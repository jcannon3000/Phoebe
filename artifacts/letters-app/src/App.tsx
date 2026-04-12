import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch, Redirect } from "wouter";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import LettersList from "@/pages/LettersList";
import NewCorrespondence from "@/pages/NewCorrespondence";
import ThreadView from "@/pages/ThreadView";
import WriteLetter from "@/pages/WriteLetter";
import ReadLetter from "@/pages/ReadLetter";
import InviteAccept from "@/pages/InviteAccept";

const qc = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 60_000 } },
});

// BASE is the path prefix under which this app is served (e.g. "/mail").
// In dev it's "/", in production it's set by the Vite base config and read here.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "") || "";

// If not authenticated, send the user to the main Phoebe sign-in page.
// The invite route is exempt — token links work before login.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      // Bounce to main Phoebe app — Google sign-in lives there.
      // After signing in they'll land on /dashboard and can navigate back via the menu.
      window.location.href = "/";
    }
  }, [user, isLoading]);

  if (isLoading || !user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#091A10" }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #8FAF96", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Router base={BASE}>
        {/* Invite links are public — accept before signing in */}
        <Route path="/invite/:token" component={InviteAccept} />

        {/* Everything else requires a Phoebe session */}
        <Route>
          <AuthGate>
            <Switch>
              <Route path="/" component={LettersList} />
              <Route path="/letters" component={LettersList} />
              <Route path="/letters/new" component={NewCorrespondence} />
              <Route path="/letters/:id/write" component={WriteLetter} />
              <Route path="/letters/:id/read/:letterId" component={ReadLetter} />
              <Route path="/letters/:id" component={ThreadView} />
              <Route><Redirect to="/" /></Route>
            </Switch>
          </AuthGate>
        </Route>
      </Router>
    </QueryClientProvider>
  );
}
