/**
 * Phoebe Parish — feature flag.
 *
 * Phase 1 (current): on for beta users only. The kill-switch below
 * stays true so the server-side access-tier computation runs, the
 * cron senders fan out, and /api/parish/* surfaces respond to data;
 * the actual SIGNUP entry points (parish onboarding + subscribe) are
 * gated runtime via beta_users so a non-beta user can never enter
 * the parish-only tier in the first place. That's enforcement in
 * depth: even if a non-beta user lands on /parish/onboarding by
 * URL-typing, the subscribe endpoint will 403, and without a
 * parish_feed_id they fall through to the normal "full" tier.
 */
export const PHOEBE_PARISH_ENABLED = true;
