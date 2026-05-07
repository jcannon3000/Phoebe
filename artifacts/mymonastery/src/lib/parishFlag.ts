/**
 * Phoebe Parish — feature flag (client mirror of the server flag at
 * artifacts/api-server/src/lib/parishFlag.ts).
 *
 * When false (the current default while Parish is tucked away), the
 * <ParishGate> wrapper is a no-op pass-through and every user sees
 * the full app exactly as they did before the Parish work landed.
 * When true, parish-tier signups are routed to /parish/onboarding
 * and the simplified UI activates for users with parish_feed_id set.
 *
 * Keep this in sync with the server flag — flipping one without the
 * other puts the two halves of the app in disagreement.
 */
export const PHOEBE_PARISH_ENABLED = false;
