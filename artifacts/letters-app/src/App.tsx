import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Redirect } from "wouter";
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

export default function App() {
  return (
    <QueryClientProvider client={qc}>
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
    </QueryClientProvider>
  );
}
