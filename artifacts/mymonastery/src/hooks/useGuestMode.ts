// useGuestMode — is this session the PUBLIC no-login GUEST experience?
//
// The SHAPE gate for the public version (slice 4 close-off, per the spec in
// memory "project_public_no_login"):
//
//   guest = PHOEBE_GUEST_ENABLED && (!user || (!rawIsBeta && !isCommunityAdmin))
//
// i.e. with the flag on, the full app belongs to BETA TESTERS and COMMUNITY
// ADMINS only — everyone else (signed out, or signed in without those roles,
// including any future auto-provisioned anonymous device users) gets the
// public shape: trimmed menu/practices, no office→intercessions handoff, no
// Kearns intro, the guest route allowlist (GuestGate in App.tsx).
//
// SHAPE vs STORAGE: this hook governs which SURFACES show. The device-local
// STORAGE branches from slice 2 (useRhythmState's local rhythm, the guest
// customizer's local-only commit, ContemplationTimer's local minutes log)
// deliberately key on `!user` instead — a signed-in non-beta user keeps their
// server-backed prefs/completions/sync while seeing the public shape.
//
// While auth/beta/groups are still resolving, isGuest is false (the gate and
// trims no-op) — mirrors usePilotMode's conservative loading posture. With
// PHOEBE_GUEST_ENABLED false this is a constant no-op and the groups query
// below never fires — zero behavior change anywhere.

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";

export function useGuestMode(): { isGuest: boolean; isLoading: boolean } {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  // Community-ADMIN check, only ever consulted for a signed-in non-beta user
  // with the flag on. Same "/api/groups" key the drawer + /menu already fetch,
  // so React Query dedupes — no extra network for those surfaces.
  const needGroups = PHOEBE_GUEST_ENABLED && !!user && !betaLoading && !rawIsBeta;
  const { data: groupsData, isLoading: groupsLoading } = useQuery<{ groups: Array<{ myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: needGroups,
    staleTime: 60_000,
  });

  if (!PHOEBE_GUEST_ENABLED) return { isGuest: false, isLoading: false };
  const isLoading = authLoading || (!!user && betaLoading) || (needGroups && groupsLoading);
  if (isLoading) return { isGuest: false, isLoading };
  if (!user) return { isGuest: true, isLoading: false };
  const isCommunityAdmin = (groupsData?.groups ?? []).some(
    (g) => g.myRole === "admin" || g.myRole === "hidden_admin",
  );
  return { isGuest: !rawIsBeta && !isCommunityAdmin, isLoading: false };
}
