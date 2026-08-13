import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Feed-gated content — which extras this viewer has unlocked by FOLLOWING
// the feed that publishes them. Today the only one is `vts`: following the
// Virginia Theological Seminary feed unlocks the Dean's Commentary as a
// daily-reflection source. Until then it is hidden from every picker that
// would otherwise list it (the light /customize Newsletter row, the full
// rule-of-life "Learn" step, /customize-home's module list, and the home
// card itself).
//
// The server is the authority (api-server/src/lib/entitlements.ts) — it
// resolves "follows a feed" as a personal subscription OR membership in a
// community the feed is bound to, matching the home feed list exactly.
//
// FAILS CLOSED. While the query is loading, and on any error, every flag
// reads false, so gated options never flash into view for someone who
// hasn't unlocked them. The cost is that a genuine follower may briefly not
// see their option on a cold load — the honest trade for never leaking it.

export type Entitlements = { vts: boolean };

const NONE: Entitlements = { vts: false };

export function useEntitlements(): Entitlements {
  const { data } = useQuery<Entitlements>({
    queryKey: ["/api/me/entitlements"],
    queryFn: () => apiRequest("GET", "/api/me/entitlements"),
    // Following a feed is a deliberate, infrequent act, and the mutation
    // path invalidates this key — so a long stale time is safe and keeps
    // every reflection surface from refetching on mount.
    staleTime: 5 * 60_000,
  });
  return data ?? NONE;
}
