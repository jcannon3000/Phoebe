-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: "email your officials" on community actions
--
-- Adds an email_subject column to actions, plus two tables:
--   • action_officials   — the elected officials an action asks members
--     to email (name, title, public email address)
--   • action_email_sends — one row each time a member opens a pre-filled
--     email; the basis for the "N emails sent" count
--
-- SAFE for production: additive only, no data touched. Idempotent
-- (IF NOT EXISTS) — re-running is harmless.
--
-- Apply to the Railway Postgres: dashboard → the Postgres service →
-- the Data / query tab → paste this whole file → run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE "actions"
  ADD COLUMN IF NOT EXISTS "email_subject" text;

CREATE TABLE IF NOT EXISTS "action_officials" (
  "id" serial PRIMARY KEY NOT NULL,
  "action_id" integer NOT NULL
    CONSTRAINT "action_officials_action_id_actions_id_fk" REFERENCES "actions"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "title" text,
  "email" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "action_email_sends" (
  "id" serial PRIMARY KEY NOT NULL,
  "action_id" integer NOT NULL
    CONSTRAINT "action_email_sends_action_id_actions_id_fk" REFERENCES "actions"("id") ON DELETE cascade,
  "user_id" integer NOT NULL
    CONSTRAINT "action_email_sends_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE cascade,
  "official_id" integer
    CONSTRAINT "action_email_sends_official_id_action_officials_id_fk" REFERENCES "action_officials"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMIT;
