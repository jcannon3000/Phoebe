-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: prayer-feed entry "source" (custom | action)
--
-- Adds a `source` column to prayer_feed_entries and
-- prayer_feed_recurring_entries so a feed prayer can be created as a
-- plain prayer ("custom") or a call-to-action ("action"). Drives the
-- "Take action →" vs "Learn more →" CTA pill on the feed detail page.
--
-- SAFE for production: additive only, non-null with a default, no data
-- touched. Idempotent (IF NOT EXISTS) — re-running is harmless.
--
-- Apply to the Railway Postgres: dashboard → the Postgres service →
-- the Data / query tab → paste this whole file → run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE "prayer_feed_entries"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'custom';

ALTER TABLE "prayer_feed_recurring_entries"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'custom';

COMMIT;
