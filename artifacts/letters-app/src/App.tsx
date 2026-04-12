import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch, Redirect } from "wouter";
import Landing from "@/pages/Landing";
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

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Router base={BASE}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/letters" component={LettersList} />
          <Route path="/letters/new" component={NewCorrespondence} />
          <Route path="/letters/:id/write" component={WriteLetter} />
          <Route path="/letters/:id/read/:letterId" component={ReadLetter} />
          <Route path="/letters/:id" component={ThreadView} />
          <Route path="/invite/:token" component={InviteAccept} />
          <Route><Redirect to="/" /></Route>
        </Switch>
      </Router>
    </QueryClientProvider>
  );
}
