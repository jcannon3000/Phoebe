import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { PHOEBE_PILOT_ENABLED, pilotPreviewEnabled } from "@/lib/pilotFlag";

/**
 * The one source of truth for "is this session in the simplified pilot
 * experience?". Pilot is the DEFAULT for the public — everyone EXCEPT
 * community admins and beta/pilot testers (our existing testers keep the
 * full app). Logged-out guests are pilot too (so the public funnel works).
 *
 * Gated by PHOEBE_PILOT_ENABLED (or the per-device `phoebe:pilot-preview`
 * override). When neither is on, `isPilot` is always false and nothing
 * changes.
 *
 * `isCommunityMember` comes from /api/auth/me (server-derived: member of any
 * joined community); `rawIsBeta` from useBetaStatus.
 */
export function usePilotMode(): { isPilot: boolean; isLoading: boolean } {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();

  const enabled = PHOEBE_PILOT_ENABLED || pilotPreviewEnabled();
  if (!enabled) return { isPilot: false, isLoading: false };

  const isLoading = authLoading || betaLoading;
  // Full app for our testers, ANYONE in a community (community features like
  // shared prayer requests stay), AND anyone with a fellow connection — an
  // accepted 1:1 fellow or a pending fellow invite waiting for them (so they can
  // still see + reach Fellows). Pilot is for everyone else — the public who
  // aren't connected to anyone yet, and logged-out guests (user null → false).
  const isCommunityMember = user?.isCommunityMember ?? false;
  const hasFellowConnection = user?.hasFellowConnection ?? false;
  const isPilot = !rawIsBeta && !isCommunityMember && !hasFellowConnection;
  return { isPilot, isLoading };
}
