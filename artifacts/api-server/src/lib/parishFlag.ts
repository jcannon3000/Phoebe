/**
 * Phoebe Parish — feature flag.
 *
 * The Parish tier (parish-only access tier, /parish/* routes,
 * office reminder pushes, 8pm recap, admin metrics) is fully built
 * but tucked away until we're ready to roll it out. Flip this
 * constant to true to enable; everything else reads from this one
 * source of truth.
 *
 * What's gated:
 *   • <ParishGate> in App.tsx (mirror flag on the client) — no
 *     redirects when off
 *   • /api/auth/me — skips the getUserAccessTier round-trip when off
 *   • runParishOfficeReminderSender + runParishEveningRecapSender —
 *     no-op when off
 *
 * What's NOT gated (intentionally — these are dormant when no parish
 * rows exist, which is the case until we provision one):
 *   • /api/parish/* routes — auth-gated, return 404 with no parish data
 *   • Schema columns — additive, idempotent migration
 *   • UI pages /parish, /parish/onboarding, etc. — exist but
 *     unreachable while the flag is off because <ParishGate> never
 *     redirects users to them
 */
export const PHOEBE_PARISH_ENABLED = false;
