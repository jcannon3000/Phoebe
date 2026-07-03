// useGuestMode — is this session the PUBLIC no-login GUEST experience?
//
// Guest = the flag is on AND auth has settled with nobody signed in. The
// mirror of usePilotMode for the public version: one shared definition so
// every guest-trimmed surface (office intercessions, Co-Breathe intro, menu,
// practices) gates the same way. With PHOEBE_GUEST_ENABLED false this is a
// constant no-op — zero behavior change anywhere.
//
// NOTE: slice 4 (close-off) will widen this to non-beta SIGNED-IN users too
// (guest = flag && (!user || (!rawIsBeta && !isCommunityAdmin))) — keep that
// change HERE so every consumer follows. See memory "project_public_no_login".

import { useAuth } from "@/hooks/useAuth";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";

export function useGuestMode(): { isGuest: boolean; isLoading: boolean } {
  const { user, isLoading } = useAuth();
  if (!PHOEBE_GUEST_ENABLED) return { isGuest: false, isLoading: false };
  return { isGuest: !isLoading && !user, isLoading };
}
