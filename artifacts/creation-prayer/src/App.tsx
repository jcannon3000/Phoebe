import { Suspense, lazy } from "react";
import { Switch, Route, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ── The Creation Prayer app ──────────────────────────────────────────────────
//
// A standalone frontend, publishable as its own app, that REUSES the Phoebe
// components (imported from ../mymonastery/src via the "@" alias) and runs on
// the same Phoebe Railway backend. It presents ONLY Creation Prayer — the
// breath, its close, and the silent contemplation timer — with none of the
// Book of Common Prayer office, community, or menu surfaces.
//
// Slice 1: the shell + the breath at the root. The Creation-Prayer home
// (morning + evening breath + CAC + a 5-minute sit) is slice 2.

// Default query fn: the shared components call useQuery with the API path as
// the queryKey (["/api/..."]), so a default fetcher covers them.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => apiRequest("GET", queryKey[0] as string),
      staleTime: 60_000,
      retry: 1,
    },
  },
});

const CobreathePage = lazy(() => import("@/pages/cobreathe"));
const ContemplationPage = lazy(() => import("@/pages/contemplation"));

function Fallback() {
  return <div style={{ minHeight: "100dvh", background: "#0A1C14" }} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<Fallback />}>
        <Switch>
          {/* The breath is the front door. ?start=1 skips the "before you
              begin" screen straight into the synced breath. */}
          <Route path="/" component={CobreathePage} />
          <Route path="/cobreathe" component={CobreathePage} />
          <Route path="/contemplation" component={ContemplationPage} />
          <Route><Redirect to="/" /></Route>
        </Switch>
      </Suspense>
    </QueryClientProvider>
  );
}
