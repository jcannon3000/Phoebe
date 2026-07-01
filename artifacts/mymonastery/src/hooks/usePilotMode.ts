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
 * `isCommunityAdmin` comes from /api/auth/me (server-derived from
 * group_members roles); `rawIsBeta` from useBetaStatus.
 */
export function usePilotMode(): { isPilot: boolean; isLoading: boolean } {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();

  const enabled = PHOEBE_PILOT_ENABLED || pilotPreviewEnabled();
  if (!enabled) return { isPilot: false, isLoading: false };

  const isLoading = authLoading || betaLoading;
  // Full app for our testers + community admins; pilot for everyone else
  // (including logged-out guests, where user is null → both false).
  const isCommunityAdmin = user?.isCommunityAdmin ?? false;
  const isPilot = !rawIsBeta && !isCommunityAdmin;
  return { isPilot, isLoading };
}
