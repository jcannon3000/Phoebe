import { useAuth } from "./useAuth";

// Whether the prayer-request feature is available to this account.
//
// Product decision (2026-07-22): prayer requests / community intercessions are
// scoped to PILOT GROUPS only. Everyone who is not a member of a pilot group
// (a group flagged `isPilotGroup`, surfaced as `user.inPilotGroup` from
// /auth/me) sees no prayer-request surface at all — no Prayer list, no
// /prayer-mode, no request creation, no community intercessions in the office.
// In its place the office offers a contemplative pause (see the office deck).
//
// NOTE: this is a product/UX gate, not a security boundary. Pilot-group and
// super-admin accounts still use the full feature, so the server routes and
// data model are unchanged; we only stop surfacing it. Super admins keep it so
// the owner can still see and manage the feature outside a pilot group.
//
// `inPilotGroup` / `isSuperAdmin` are undefined until /auth/me resolves. We
// default to DISABLED while loading so a non-pilot user never briefly sees the
// prayer surfaces flash in before the flag arrives.
export function usePrayerRequestsEnabled(): boolean {
  const { user } = useAuth();
  return !!user?.inPilotGroup || !!user?.isSuperAdmin;
}
