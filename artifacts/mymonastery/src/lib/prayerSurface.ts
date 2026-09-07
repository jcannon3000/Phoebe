/**
 * Does this person have the prayer surface at all?
 *
 * /prayer-mode and /prayer-chooser sit behind PrayerGate (App.tsx), which
 * admits only a pilot-group member or a super admin. Everyone else is
 * redirected to /dashboard.
 *
 * The offices did not know that. Every finish — Amen, the closing slide, the
 * physical-book attestation, the psalms deck — navigated to
 * /prayer-mode?closingOnly=1 and first AWAITED three intercession requests
 * that a gated user cannot even read. So the general population paid a pause
 * at the end of the office and then got bounced to the dashboard, never
 * seeing the closing recap the code intends for every completion.
 *
 * One predicate, imported by the gate and by the offices, so the two cannot
 * drift apart again.
 */
export function hasPrayerSurface(
  user: { inPilotGroup?: boolean | null; isSuperAdmin?: boolean | null } | null | undefined,
): boolean {
  return !!user?.inPilotGroup || !!user?.isSuperAdmin;
}
