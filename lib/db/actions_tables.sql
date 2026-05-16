-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: community "actions" feature
--
-- Adds two additive tables — actions + action_rsvps. SAFE for production:
-- no existing table is altered, no data is touched. Idempotent — the
-- tables/index use IF NOT EXISTS, so re-running is harmless (a second run
-- will only error if the foreign-key constraints already exist, which is
-- itself harmless — it means the tables are already there).
--
-- Apply to the Railway Postgres: dashboard → the Postgres service → the
-- Data / query tab → paste this whole file → run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS "actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" integer NOT NULL
    CONSTRAINT "actions_group_id_groups_id_fk" REFERENCES "groups"("id") ON DELETE cascade,
  "creator_user_id" integer NOT NULL
    CONSTRAINT "actions_creator_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "learn_more_url" text,
  "location" text,
  "event_at" timestamp with time zone NOT NULL,
  "attached_moment_id" integer
    CONSTRAINT "actions_attached_moment_id_shared_moments_id_fk" REFERENCES "shared_moments"("id") ON DELETE set null,
  "state" text DEFAULT 'active' NOT NULL,
  "week_reminder_sent_at" timestamp with time zone,
  "day_reminder_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "action_rsvps" (
  "id" serial PRIMARY KEY NOT NULL,
  "action_id" integer NOT NULL
    CONSTRAINT "action_rsvps_action_id_actions_id_fk" REFERENCES "actions"("id") ON DELETE cascade,
  "user_id" integer NOT NULL
    CONSTRAINT "action_rsvps_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE cascade,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_action_rsvp_action_user"
  ON "action_rsvps" ("action_id", "user_id");

COMMIT;
