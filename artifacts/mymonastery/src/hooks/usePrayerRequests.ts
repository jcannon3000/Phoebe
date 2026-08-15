import { useAuth } from "./useAuth";

// Whether the prayer-request feature is available to this account.
//
// RE-ENABLED (2026-08-15), scoped — not a blanket public re-enable. Mirrors
// PrayerGate's own route-level condition in App.tsx (pilot group OR super
// admin) so nav visibility and actual route access agree again; before
// 2026-07-23's "off for everyone" change, this was the feature's normal
// gate. Widen this (e.g. to every real account) only as a deliberate,
// separate decision — going straight to fully public skips the
// moderation-queue/reporting groundwork this re-enable shipped alongside
// (see lib/contentSafety.ts server-side, and the ReportsAdminPage queue).
//
// This is a product/UX gate, not a security boundary — PrayerGate in
// App.tsx is the actual server-adjacent enforcement (a hand-crafted
// request to a /prayer-* route still hits it).
export function usePrayerRequestsEnabled(): boolean {
  const { user } = useAuth();
  return !!user?.inPilotGroup || !!user?.isSuperAdmin;
}

// Whether the PRIVATE prayer list (prayer_intentions) is surfaced anywhere —
// the home screen section, the menu entry, and the tail slides woven into
// the BCP office / Simple Guided Prayer / Psalms.
//
// RE-ENABLED (2026-08-15), same scoped pilot-group/super-admin condition as
// usePrayerRequestsEnabled above, for consistency — even though this list
// is private (owner-only, never shared) and so doesn't carry the same
// moderation/liability profile; widening it independently of the shared
// feature is a reasonable later call if wanted. The route itself
// (/intentions) is gated more broadly, by AccountRequiredGate (any real
// account) in App.tsx — this hook only controls whether it's surfaced.
export function usePrayerListEnabled(): boolean {
  const { user } = useAuth();
  return !!user?.inPilotGroup || !!user?.isSuperAdmin;
}
