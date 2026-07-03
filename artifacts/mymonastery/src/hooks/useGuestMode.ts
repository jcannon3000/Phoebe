// useGuestMode — is this session the PUBLIC no-login GUEST experience?
//
// The SHAPE gate for the public version (per the spec in memory
// "project_public_no_login", REVISED 2026-07-03 to PILOT GROUPS):
//
//   guest = PHOEBE_GUEST_ENABLED && (!user || !user.inPilotGroup)
//
// i.e. with the flag on, the FULL app belongs to members of a PILOT GROUP
// only (app super admins designate pilot groups from a group's settings).
// Everyone else — signed out, anonymous device users, and ordinary signed-in
// accounts — gets the public shape: trimmed menu/practices, no
// office→intercessions handoff, no Kearns intro, the guest route allowlist
// (GuestGate in App.tsx). This SUPERSEDES the earlier beta-tester /
// community-admin exemption; `inPilotGroup` is server-derived on /api/auth/me
// (one source of truth, no extra query here).
//
// SHAPE vs STORAGE: this hook governs which SURFACES show. The device-local
// STORAGE branches from slice 2 (useRhythmState's local rhythm, the guest
// customizer's local-only commit, ContemplationTimer's local minutes log)
// deliberately key on `!user` instead — a signed-in (or anonymous-provisioned)
// user keeps their server-backed prefs/completions/sync while seeing the
// public shape.
//
// While auth is still resolving, isGuest is false (the gate and trims no-op) —
// a conservative loading posture so the full app never flashes into the guest
// shell mid-load. With PHOEBE_GUEST_ENABLED false this is a constant no-op —
// zero behavior change anywhere.

import { useAuth } from "@/hooks/useAuth";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";

export function useGuestMode(): { isGuest: boolean; isLoading: boolean } {
  const { user, isLoading: authLoading } = useAuth();
  if (!PHOEBE_GUEST_ENABLED) return { isGuest: false, isLoading: false };
  if (authLoading) return { isGuest: false, isLoading: true };
  if (!user) return { isGuest: true, isLoading: false };
  // Pilot-group members keep the full app; so do app SUPER ADMINS (the
  // operator must reach the pilot-group toggle even before any group is
  // marked — otherwise flipping the flag locks everyone out of marking one).
  return { isGuest: !user.inPilotGroup && !user.isSuperAdmin, isLoading: false };
}
