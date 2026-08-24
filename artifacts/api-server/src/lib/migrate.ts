import { pool } from "@workspace/db";
import { logger } from "./logger";
import { NOVENA_TERESA } from "./seedData/novenaTeresa";
import { NOVENA_CARMEL } from "./seedData/novenaCarmel";
import { NOVENA_FRANCIS } from "./seedData/novenaFrancis";
import { NOVENA_DISCERNMENT } from "./seedData/novenaDiscernment";

// Minimal structural type for the object pool.connect() gives us — just
// what run() actually uses. Previously typed as
// `Awaited<ReturnType<typeof pool.connect>>` which resolves to `void`
// under the rebuilt @workspace/db declarations (pg's Pool.connect
// overload leaks through differently after the project-reference
// build). A local structural type avoids needing @types/pg in this
// package.
interface MigrateClient {
  // Params are optional so runOnce can bind its ledger key rather than
  // interpolating it into SQL; a pg PoolClient satisfies this shape.
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number | null }>;
  release: () => void;
}

async function run(client: MigrateClient, sql: string) {
  try {
    await client.query(sql);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ msg }, `Migration statement warning: ${sql.slice(0, 80).trim()}`);
  }
}

/** Run a ONE-TIME backfill exactly once, ever — recorded in `schema_backfills`.
 *
 *  migrate() runs on EVERY boot, so an unguarded `UPDATE … WHERE col = <old>`
 *  is not a backfill, it is a policy re-imposed on every deploy. The 2026-07-21
 *  data audit found four of these silently overwriting deliberate user choices:
 *  a user who turned the Confession off had it switched back on every deploy,
 *  and likewise for their bell time and bell mute. The comments on all four
 *  described them as one-time and called them "idempotent" — true in the sense
 *  that they don't error, false in the sense that matters.
 *
 *  Use this for any statement whose intent is "fix the rows that exist TODAY".
 *  Statements that are genuinely idempotent (CREATE IF NOT EXISTS, ALTER …
 *  SET DEFAULT, ADD COLUMN IF NOT EXISTS) should keep using `run` directly. */
export async function runOnce(client: MigrateClient, key: string, sql: string) {
  try {
    const seen = await client.query(`SELECT 1 FROM schema_backfills WHERE key = $1`, [key]);
    if ((seen.rowCount ?? 0) > 0) return;
    await run(client, sql);
    await client.query(
      `INSERT INTO schema_backfills (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`,
      [key],
    );
    logger.info({ key }, "[migrate] one-time backfill applied");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ msg, key }, "[migrate] one-time backfill failed");
  }
}

export async function migrate() {
  const client = await pool.connect();
  try {
    // Ledger of one-time backfills already applied — see runOnce above. Created
    // first so every later backfill can consult it.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_backfills (
        key TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Core tables ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT user_sessions_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
      );
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON user_sessions (expire);

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        avatar_url TEXT,
        google_id TEXT UNIQUE,
        google_access_token TEXT,
        google_refresh_token TEXT,
        google_token_expiry TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rituals (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        frequency TEXT NOT NULL,
        day_preference TEXT,
        participants JSONB NOT NULL DEFAULT '[]',
        intention TEXT,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        location TEXT,
        proposed_times JSONB NOT NULL DEFAULT '[]',
        confirmed_time TEXT,
        schedule_token TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS meetups (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id),
        scheduled_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        notes TEXT,
        location TEXT,
        google_calendar_event_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ritual_messages (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- schedule_responses, scheduling_responses (a legacy/dead duplicate —
      -- never wired to any application code), and invite_tokens were the
      -- RSVP/scheduling-poll tables (guest name/email + chosen time or
      -- availability). That feature is removed entirely (owner: "we don't
      -- want RSVP data") — dropped at the end of this migration, no longer
      -- created here.
    `);

    // ── shared_moments: create with all columns ───────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS shared_moments (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER REFERENCES rituals(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        intention TEXT NOT NULL DEFAULT '',
        logging_type TEXT NOT NULL DEFAULT 'photo',
        reflection_prompt TEXT,
        template_type TEXT,
        intercession_topic TEXT,
        intercession_source TEXT,
        intercession_full_text TEXT,
        timer_duration_minutes INTEGER NOT NULL DEFAULT 10,
        frequency TEXT NOT NULL DEFAULT 'weekly',
        scheduled_time TEXT NOT NULL DEFAULT '08:00',
        window_minutes INTEGER NOT NULL DEFAULT 60,
        goal_days INTEGER NOT NULL DEFAULT 30,
        day_of_week TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        time_of_day TEXT,
        moment_token TEXT NOT NULL UNIQUE,
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        total_blooms INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'active',
        frequency_type TEXT,
        frequency_days_per_week INTEGER,
        practice_days TEXT,
        contemplative_duration_minutes INTEGER,
        fasting_from TEXT,
        fasting_intention TEXT,
        fasting_frequency TEXT,
        fasting_date TEXT,
        fasting_day TEXT,
        fasting_day_of_month INTEGER,
        commitment_duration INTEGER,
        commitment_end_date TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── shared_moments: add missing columns one-by-one (safe if already exist) ─
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS template_type TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS intercession_topic TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS intercession_source TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS intercession_full_text TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS timer_duration_minutes INTEGER NOT NULL DEFAULT 10`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS day_of_week TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC'`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS time_of_day TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS frequency_type TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS frequency_days_per_week INTEGER`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS practice_days TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS contemplative_duration_minutes INTEGER`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_type TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_from TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_intention TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_frequency TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_date TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_day TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_day_of_month INTEGER`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_duration INTEGER`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_end_date TEXT`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS custom_emoji TEXT`);

    // ── Dependent tables ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS moment_renewals (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        previous_intention TEXT,
        new_intention TEXT,
        previous_intercession_topic TEXT,
        new_intercession_topic TEXT,
        renewal_count INTEGER NOT NULL DEFAULT 1,
        renewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS moment_streak_days (
        id SERIAL PRIMARY KEY,
        shared_moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        practice_date DATE NOT NULL,
        members_logged INTEGER NOT NULL DEFAULT 0,
        bloomed BOOLEAN NOT NULL DEFAULT false,
        evaluated_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS moment_user_tokens (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT,
        user_token TEXT NOT NULL UNIQUE,
        google_calendar_event_id TEXT,
        personal_time TEXT,
        personal_timezone TEXT,
        calendar_connected BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── moment_user_tokens: add missing columns ───────────────────────────────
    await run(client, `ALTER TABLE moment_user_tokens ADD COLUMN IF NOT EXISTS personal_time TEXT`);
    await run(client, `ALTER TABLE moment_user_tokens ADD COLUMN IF NOT EXISTS personal_timezone TEXT`);
    await run(client, `ALTER TABLE moment_user_tokens ADD COLUMN IF NOT EXISTS calendar_connected BOOLEAN NOT NULL DEFAULT false`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS moment_calendar_events (
        id SERIAL PRIMARY KEY,
        shared_moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        moment_member_id INTEGER NOT NULL,
        google_calendar_event_id TEXT,
        ics_sent BOOLEAN NOT NULL DEFAULT false,
        scheduled_for TIMESTAMPTZ NOT NULL,
        is_first_event BOOLEAN NOT NULL DEFAULT false,
        logged BOOLEAN NOT NULL DEFAULT false,
        logged_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS moment_posts (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        window_date TEXT NOT NULL,
        user_token TEXT NOT NULL,
        guest_name TEXT NOT NULL,
        photo_url TEXT,
        reflection_text TEXT,
        is_checkin INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS moment_windows (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        window_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'wither',
        post_count INTEGER NOT NULL DEFAULT 0,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Community + actions + auth-token tables ────────────────────────────
    // These are defined in the Drizzle schema (lib/db/src/schema/*) but had
    // no runtime CREATE here, so they existed in prod only by historical
    // accident (groups / beta_users / group_members / group_announcements)
    // or via manual paste-to-Railway .sql files that never run on boot (the
    // action_* tables). A fresh database (disaster recovery, a new
    // environment, local-from-scratch) couldn't bootstrap them. All DDL is
    // idempotent (IF NOT EXISTS) — a no-op on the existing prod DB. Created
    // here, after users + shared_moments (above) and before the first
    // `REFERENCES groups` ALTER (below), so every FK resolves on a fresh DB.
    // Columns mirror the schema exactly.
    await run(client, `
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        slug TEXT NOT NULL UNIQUE,
        emoji TEXT,
        calendar_url TEXT,
        invite_token TEXT UNIQUE,
        is_prayer_circle BOOLEAN NOT NULL DEFAULT false,
        intention TEXT,
        circle_description TEXT,
        is_public BOOLEAN NOT NULL DEFAULT true,
        created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_prayer_invite_at TIMESTAMPTZ,
        prayer_invite_prompt TEXT,
        sunday_reflections_enabled BOOLEAN NOT NULL DEFAULT false,
        sunday_reflection_notified_at TIMESTAMPTZ,
        focus TEXT,
        contemplation_goal_minutes INTEGER
      )
    `);

    await run(client, `
      CREATE TABLE IF NOT EXISTS beta_users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        added_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        seen_welcome BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await run(client, `
      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'follower',
        invite_token TEXT NOT NULL UNIQUE,
        joined_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // prayer_feed_id carries no FK here — the Drizzle schema declares the
    // column without .references() (to avoid a schema-graph cycle through
    // prayer_feeds). The prayer_feeds FK is added later, after that table
    // exists (see the group_announcements prayer_feed_id ALTER further down).
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_announcements (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        prayer_feed_id INTEGER,
        author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        content TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'announcement',
        event_at TIMESTAMPTZ,
        location TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Persistent auth tokens — durable re-login credential used by
    // routes/auth.ts when the session cookie is missing. Schema-defined
    // (lib/db/src/schema/persistent_auth_tokens) with no prior runtime
    // CREATE, so a fresh DB couldn't serve /api/auth/exchange-token.
    await run(client, `
      CREATE TABLE IF NOT EXISTS persistent_auth_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS persistent_auth_tokens_user_id_idx ON persistent_auth_tokens (user_id)`);

    // ── Community actions ──────────────────────────────────────────────────
    // Verbatim from lib/db/actions_tables.sql + lib/db/action_officials.sql
    // (the manual paste-to-Railway files that never ran on boot). FK targets
    // groups + users + shared_moments all exist above. Quoted identifiers and
    // named constraints are kept as-authored so the constraint names match
    // Drizzle's generated names.
    await run(client, `
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
      )
    `);
    await run(client, `ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "email_subject" text`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS "action_rsvps" (
        "id" serial PRIMARY KEY NOT NULL,
        "action_id" integer NOT NULL
          CONSTRAINT "action_rsvps_action_id_actions_id_fk" REFERENCES "actions"("id") ON DELETE cascade,
        "user_id" integer NOT NULL
          CONSTRAINT "action_rsvps_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE cascade,
        "status" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_action_rsvp_action_user" ON "action_rsvps" ("action_id", "user_id")`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS "action_officials" (
        "id" serial PRIMARY KEY NOT NULL,
        "action_id" integer NOT NULL
          CONSTRAINT "action_officials_action_id_actions_id_fk" REFERENCES "actions"("id") ON DELETE cascade,
        "name" text NOT NULL,
        "title" text,
        "email" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    await run(client, `
      CREATE TABLE IF NOT EXISTS "action_email_sends" (
        "id" serial PRIMARY KEY NOT NULL,
        "action_id" integer NOT NULL
          CONSTRAINT "action_email_sends_action_id_actions_id_fk" REFERENCES "actions"("id") ON DELETE cascade,
        "user_id" integer NOT NULL
          CONSTRAINT "action_email_sends_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE cascade,
        "official_id" integer
          CONSTRAINT "action_email_sends_official_id_action_officials_id_fk" REFERENCES "action_officials"("id") ON DELETE set null,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    // Presence preference
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS show_presence BOOLEAN NOT NULL DEFAULT true`);

    // Progressive goal columns (Duolingo-style commitment system)
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_sessions_goal INTEGER`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_sessions_logged INTEGER NOT NULL DEFAULT 0`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_goal_tier INTEGER NOT NULL DEFAULT 1`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_tend_freely BOOLEAN NOT NULL DEFAULT false`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_goal_reached_at TIMESTAMPTZ`);
    // commitment_cycle_started_at: when the current cycle began.
    // Original creation OR most recent renewal. Used by the read filter
    // to time-window intercession visibility — a moment whose
    // (cycleStartedAt + goalDays) is in the past gets hidden from
    // list / dashboard / slideshow regardless of bloom count.
    // Backfill existing rows from created_at so legacy intercessions
    // have a sensible window without anyone having to touch them.
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_cycle_started_at TIMESTAMPTZ`);
    await run(client, `UPDATE shared_moments SET commitment_cycle_started_at = created_at WHERE commitment_cycle_started_at IS NULL`);
    // Hard expiry: community intercessions hide once their window
    // (cycleStartedAt + goalDays) passes — full stop. Two boot-time "revival"
    // UPDATEs used to live here; they reopened any expired intercession that
    // had recent prayer posts, and they ran on EVERY deploy. They'd been a
    // silent no-op for weeks because the moment_posts.window_date comparison
    // (TEXT vs ::date) threw — so once "Fix three Postgres errors" corrected
    // that cast, they started firing and brought every past community
    // intercession back to life. Removed. The only sanctioned way to keep an
    // intercession going is now Extend / Tend-freely (PATCH /moments/:id/goal),
    // which moves cycleStartedAt forward on purpose.
    //
    // One-time (idempotent) cleanup of the rows revival already reopened:
    // normalise cycleStartedAt back to created_at for any expired intercession
    // that was never extended, so it returns to hidden. Safe because:
    //   • goal_days > 0   — tend-freely sets goal_days = 0, so it's skipped
    //   • goal_tier <= 1  — every Extend bumps the tier to >= 2, so an
    //                       admin-extended intercession can never match
    //   • cycle_started_at <> created_at AND created_at + goal_days < NOW()
    //                     — only rows whose ORIGINAL window already passed but
    //                       whose cycle got pushed forward (i.e. the revival)
    // Once it runs, matched rows satisfy cycle_started_at = created_at, so the
    // WHERE stops matching — it self-limits to a permanent no-op and never
    // touches new / in-window intercessions (the window check excludes them).
    // Logs the count so it's auditable in the deploy logs.
    try {
      const cleanupWhere = `
        WHERE sm.template_type = 'intercession'
          AND sm.goal_days > 0
          AND COALESCE(sm.commitment_goal_tier, 1) <= 1
          AND sm.commitment_cycle_started_at IS NOT NULL
          AND sm.commitment_cycle_started_at <> sm.created_at
          AND sm.created_at + (sm.goal_days || ' days')::interval < NOW()`;
      const sel = await client.query(`SELECT COUNT(*)::int AS n FROM shared_moments sm ${cleanupWhere}`);
      const n: number = sel.rows?.[0]?.n ?? 0;
      logger.warn({ count: n }, `[migrate] hard-expiry: re-hiding ${n} auto-revived intercession(s)`);
      const upd = await client.query(`UPDATE shared_moments sm SET commitment_cycle_started_at = sm.created_at ${cleanupWhere}`);
      logger.warn({ rowCount: upd.rowCount ?? 0 }, "[migrate] hard-expiry cleanup complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ msg }, "[migrate] hard-expiry cleanup failed");
    }

    // Fix constraints that differ from old migration to current schema
    await run(client, `ALTER TABLE shared_moments ALTER COLUMN ritual_id DROP NOT NULL`);
    await run(client, `ALTER TABLE shared_moments ALTER COLUMN intention SET DEFAULT ''`);
    await run(client, `ALTER TABLE shared_moments ALTER COLUMN goal_days SET DEFAULT 30`);
    await run(client, `ALTER TABLE shared_moments ALTER COLUMN goal_days SET NOT NULL`);

    // Phoebe gathering fields on rituals
    await run(client, `ALTER TABLE rituals ADD COLUMN IF NOT EXISTS rhythm TEXT NOT NULL DEFAULT 'fortnightly'`);
    await run(client, `ALTER TABLE rituals ADD COLUMN IF NOT EXISTS has_intercession BOOLEAN NOT NULL DEFAULT false`);
    await run(client, `ALTER TABLE rituals ADD COLUMN IF NOT EXISTS has_fasting BOOLEAN NOT NULL DEFAULT false`);
    await run(client, `ALTER TABLE rituals ADD COLUMN IF NOT EXISTS intercession_intention TEXT`);
    await run(client, `ALTER TABLE rituals ADD COLUMN IF NOT EXISTS fasting_description TEXT`);
    await run(client, `ALTER TABLE rituals ADD COLUMN IF NOT EXISTS template TEXT`);
    await run(client, `ALTER TABLE rituals ADD COLUMN IF NOT EXISTS allow_member_invites BOOLEAN NOT NULL DEFAULT true`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS allow_member_invites BOOLEAN NOT NULL DEFAULT true`);
    // Optional community link for gatherings. When set, the gathering
    // shows on /groups/:slug/gatherings. Nullable — personal gatherings
    // (unattached) have group_id IS NULL.
    await run(client, `ALTER TABLE rituals ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL`);
    // Video-call link — when set, the gathering is an online call
    // (Zoom / Meet / Teams) rather than an in-person meet.
    await run(client, `ALTER TABLE rituals ADD COLUMN IF NOT EXISTS meeting_url TEXT`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_rituals_group_id ON rituals(group_id)`);

    // Per-meetup location (each scheduled gathering can be in a different place).
    // Added to the schema after the table was first created, so existing
    // deployments need this ALTER to unblock meetup selects.
    await run(client, `ALTER TABLE meetups ADD COLUMN IF NOT EXISTS location TEXT`);
    // Dedup stamp for the day-before gathering reminder push.
    await run(client, `ALTER TABLE meetups ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ`);

    // Calendar subscriptions — iCal (.ics) feeds a user overlays on their
    // calendar. The Drizzle schema (lib/db/schema/calendar_subscriptions)
    // shipped without a matching migration, so selects were 500ing with
    // "relation calendar_subscriptions does not exist". Create it here to
    // match the schema; columns mirror calendarSubscriptionsTable exactly.
    await run(client, `
      CREATE TABLE IF NOT EXISTS calendar_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        color_hex TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_user_id ON calendar_subscriptions(user_id)`);

    // Fix missing ON DELETE CASCADE on existing FK constraints (safe to re-run)
    await run(client, `ALTER TABLE rituals DROP CONSTRAINT IF EXISTS rituals_owner_id_fkey`);
    await run(client, `ALTER TABLE rituals ADD CONSTRAINT rituals_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE`);
    await run(client, `ALTER TABLE moment_posts DROP CONSTRAINT IF EXISTS moment_posts_moment_id_fkey`);
    await run(client, `ALTER TABLE moment_posts ADD CONSTRAINT moment_posts_moment_id_fkey FOREIGN KEY (moment_id) REFERENCES shared_moments(id) ON DELETE CASCADE`);
    await run(client, `ALTER TABLE moment_windows DROP CONSTRAINT IF EXISTS moment_windows_moment_id_fkey`);
    await run(client, `ALTER TABLE moment_windows ADD CONSTRAINT moment_windows_moment_id_fkey FOREIGN KEY (moment_id) REFERENCES shared_moments(id) ON DELETE CASCADE`);
    // Postgres does NOT auto-index FK columns. moment_id is the hottest filter
    // in the app (GET /api/moments fans out per-moment reads of both tables),
    // so without these every lookup was a sequential scan. Composite on posts
    // also serves the per-window (moment_id, window_date) "today's posts" read.
    await run(client, `CREATE INDEX IF NOT EXISTS idx_moment_posts_moment_id ON moment_posts(moment_id, window_date)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_moment_windows_moment_id ON moment_windows(moment_id)`);
    // Fix guest_name NOT NULL on existing rows (backfill then add constraint)
    await run(client, `UPDATE moment_posts SET guest_name = 'Unknown' WHERE guest_name IS NULL`);
    await run(client, `ALTER TABLE moment_posts ALTER COLUMN guest_name SET NOT NULL`);

    // ── Prayer tables ────────────────────────────────────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_requests (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        is_answered BOOLEAN NOT NULL DEFAULT false,
        answered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_responses (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(request_id, user_id)
      )
    `);

    // ── Prayer: new columns + prayer_words table ─────────────────────────────
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS created_by_name TEXT`);
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false`);
    // "One time" community ask — surfaces first + leaves a person's list once
    // they've prayed it; false = ongoing. See routes/prayer.ts list filter+sort.
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS one_time BOOLEAN NOT NULL DEFAULT false`);
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`);
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS close_reason TEXT`);
    await run(client, `UPDATE prayer_requests SET expires_at = created_at + INTERVAL '3 days' WHERE expires_at IS NULL`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_words (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // is_private: when true, the word is visible only to the request
    // owner + the author. Default false to preserve legacy behavior
    // for rows written before this column existed.
    await run(client, `ALTER TABLE prayer_words ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false`);
    // renewal_nudge_sent_at: stamped when the 1-day-left renewal push
    // fires for a prayer request, so the cron doesn't re-send.
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS renewal_nudge_sent_at TIMESTAMPTZ`);
    // Life-event fields (kind = 'life-event'): a dated thing + the owner's update.
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ`);
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS event_title TEXT`);
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS life_event_followup_sent_at TIMESTAMPTZ`);
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS event_update TEXT`);
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS event_updated_at TIMESTAMPTZ`);


    // Connection cache — persists even when practices are deleted
    await run(client, `
      CREATE TABLE IF NOT EXISTS user_connections_cache (
        user_email TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        contact_name TEXT,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_email, contact_email)
      )
    `);

    // Member "suggest a time" (ritual_time_suggestions) removed along with
    // the rest of the RSVP/scheduling-poll system — dropped at the end.

    // Magic link tokens for email-based login
    await run(client, `
      CREATE TABLE IF NOT EXISTS email_login_tokens (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Password-based auth
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ`);

    // Imprint formation tracking
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS correspondence_imprint_completed BOOLEAN NOT NULL DEFAULT false`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS gathering_imprint_completed BOOLEAN NOT NULL DEFAULT false`);

    // ── Daily Office tables ──────────────────────────────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS bcp_texts (
        id SERIAL PRIMARY KEY,
        text_key TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        bcp_reference TEXT,
        content TEXT NOT NULL,
        season_restriction TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS scripture_cache (
        id SERIAL PRIMARY KEY,
        reference TEXT NOT NULL,
        cache_date DATE NOT NULL,
        nrsv_text TEXT NOT NULL,
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (reference, cache_date)
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS morning_prayer_cache (
        id SERIAL PRIMARY KEY,
        cache_date DATE NOT NULL UNIQUE,
        liturgical_year INTEGER NOT NULL,
        liturgical_season TEXT NOT NULL,
        proper_number INTEGER,
        feast_name TEXT,
        slides_json JSONB NOT NULL,
        assembled_at TIMESTAMPTZ DEFAULT NOW(),
        assembled_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // ── Eleanor Letters tables ────────────────────────────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS correspondences (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        frequency TEXT NOT NULL DEFAULT 'fortnightly',
        group_type TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS correspondence_members (
        id SERIAL PRIMARY KEY,
        correspondence_id INTEGER NOT NULL REFERENCES correspondences(id),
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        email TEXT NOT NULL,
        name TEXT,
        invite_token TEXT NOT NULL UNIQUE,
        joined_at TIMESTAMPTZ,
        last_letter_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS letters (
        id SERIAL PRIMARY KEY,
        correspondence_id INTEGER NOT NULL REFERENCES correspondences(id),
        author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        author_email TEXT NOT NULL,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        letter_number INTEGER NOT NULL,
        period_number INTEGER NOT NULL,
        period_start_date DATE NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_by JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS letter_drafts (
        id SERIAL PRIMARY KEY,
        correspondence_id INTEGER NOT NULL REFERENCES correspondences(id),
        author_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        author_email TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        period_start_date DATE NOT NULL,
        last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (correspondence_id, author_email, period_start_date)
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS letter_reminders (
        id SERIAL PRIMARY KEY,
        correspondence_id INTEGER NOT NULL REFERENCES correspondences(id),
        member_email TEXT NOT NULL,
        period_start_date DATE NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (correspondence_id, member_email, period_start_date)
      )
    `);

    // ── Lectio Divina tables ─────────────────────────────────────────────────
    // These were originally created via drizzle-kit push during development
    // and were never added to the runtime migration, so fresh deploys (or any
    // deploy where the column set has drifted) would blow up on the first
    // lectio read. Idempotent DDL so it's safe to run on every boot.
    await run(client, `
      CREATE TABLE IF NOT EXISTS lectionary_readings (
        id SERIAL PRIMARY KEY,
        sunday_date DATE NOT NULL UNIQUE,
        sunday_name TEXT NOT NULL,
        liturgical_season TEXT,
        liturgical_year TEXT,
        gospel_reference TEXT NOT NULL,
        gospel_text TEXT NOT NULL,
        source_url TEXT,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS lectio_reflections (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        sunday_date DATE NOT NULL,
        user_token TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_email TEXT,
        stage TEXT NOT NULL,
        reflection_text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Column added to the schema after the table was first created — add it
    // on existing deployments that missed the original drizzle-kit push.
    await run(client, `ALTER TABLE lectio_reflections ADD COLUMN IF NOT EXISTS user_email TEXT`);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS lectio_reflections_unique_stage
      ON lectio_reflections (moment_id, sunday_date, user_token, stage)
    `);

    // ── Postmark columns ─────────────────────────────────────────────────────
    await run(client, `ALTER TABLE letters ADD COLUMN IF NOT EXISTS postmark_city TEXT`);
    await run(client, `ALTER TABLE letters ADD COLUMN IF NOT EXISTS postmark_country TEXT`);
    await run(client, `ALTER TABLE correspondence_members ADD COLUMN IF NOT EXISTS home_city TEXT`);
    await run(client, `ALTER TABLE correspondence_members ADD COLUMN IF NOT EXISTS home_country TEXT`);
    await run(client, `ALTER TABLE correspondence_members ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);

    // ── Letter cadence + calendar columns ────────────────────────────────────
    await run(client, `ALTER TABLE correspondences ADD COLUMN IF NOT EXISTS first_exchange_complete BOOLEAN NOT NULL DEFAULT FALSE`);
    await run(client, `ALTER TABLE correspondence_members ADD COLUMN IF NOT EXISTS calendar_prompt_state TEXT`);
    await run(client, `ALTER TABLE correspondence_members ADD COLUMN IF NOT EXISTS last_calendar_event_id TEXT`);
    await run(client, `ALTER TABLE correspondence_members ADD COLUMN IF NOT EXISTS overdue_calendar_event_id TEXT`);

    // Backfill first_exchange_complete = true for any one-to-one correspondence
    // that already has letters from two distinct authors (the first exchange is done).
    await run(client, `
      UPDATE correspondences c
      SET first_exchange_complete = TRUE
      WHERE c.group_type = 'one_to_one'
        AND c.first_exchange_complete = FALSE
        AND (
          SELECT COUNT(DISTINCT l.author_email)
          FROM letters l
          WHERE l.correspondence_id = c.id
        ) >= 2
    `);

    // The Google-Calendar-based Daily Bell (bell_enabled, daily_bell_time,
    // bell_calendar_event_id: a calendar invite the user accepted/declined,
    // polled via the Google Calendar API) was removed entirely (owner) —
    // dropped at the end of this migration. `timezone` is still used broadly
    // (office reminders, etc.), so it stays.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT`);

    // ── Daily prayer-slideshow invite gate ──────────────────────────────────
    // Account-scoped "last shown" date so dismissing the popup on one
    // device silences it on every other device signed into the same
    // account for the rest of the local day.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS prayer_invite_last_shown_date TEXT`);

    // ── Letter window pushes ───────────────────────────────────────────────
    // Dedupe table for the scheduler that fires "your write window
    // opened" (small_group, once per period) and "your reply window is
    // still open" (one_to_one, fired N days after a letter you haven't
    // responded to). One row per (correspondence, user, periodStart,
    // kind) so a long-running scheduler tick or a redeploy can't
    // double-push.
    await run(client, `
      CREATE TABLE IF NOT EXISTS letter_window_pushes (
        id SERIAL PRIMARY KEY,
        correspondence_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        period_start_date TEXT NOT NULL,
        kind TEXT NOT NULL,                                -- "open" | "respond"
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS letter_window_pushes_uk ON letter_window_pushes (correspondence_id, user_id, period_start_date, kind)`);

    // Phone-number contact discovery was removed (privacy simplification); its
    // columns/indexes are dropped at the end of this migration.

    // ── Waitlist ─────────────────────────────────────────────────────────────
    // Public-facing signup queue: people who want in before invite-based
    // signup or pilot access opens to them.
    await run(client, `
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        reason TEXT,
        source TEXT NOT NULL DEFAULT 'homepage',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // One-time backfill: every user who already saw the popup before the
    // column existed (the earlier PATCH 500'd, so their stamp never
    // landed). Seed today's server-local date so we don't re-prompt them
    // on this boot. Idempotent because it only touches NULL rows, and the
    // subsequent ordinary flow overwrites per real dismissals.
    await run(client, `UPDATE users SET prayer_invite_last_shown_date = to_char(CURRENT_DATE, 'YYYY-MM-DD') WHERE prayer_invite_last_shown_date IS NULL`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS bell_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bell_date TEXT NOT NULL,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_bell_notifications_user_date ON bell_notifications (user_id, bell_date)`);

    // ── User mutes ─────────────────────────────────────────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS user_mutes (
        id SERIAL PRIMARY KEY,
        muter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        muted_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (muter_id, muted_user_id)
      )
    `);

    // ── Feedback ───────────────────────────────────────────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name TEXT NOT NULL,
        user_email TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Group practices ────────────────────────────────────────────────────
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_shared_moments_group_id ON shared_moments (group_id)`);

    // ── Community-wide invite link ─────────────────────────────────────────
    // Each group has a single shareable token. Anyone with the link can
    // join the community (replaces per-email invites in the UI). Admins
    // can rotate via POST /api/groups/:slug/rotate-invite.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token TEXT`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_invite_token ON groups (invite_token) WHERE invite_token IS NOT NULL`);
    // Backfill: every existing group gets a fresh random token. md5(random())
    // is unique-enough for this — we just need an unguessable slug-like
    // string. Only touches rows where the column is still NULL, so this is
    // idempotent and safe to run on every boot.
    await run(client, `UPDATE groups SET invite_token = replace(md5(random()::text || clock_timestamp()::text), '-', '') WHERE invite_token IS NULL`);

    // ── Group admin notification acknowledgments ──────────────────────────
    // One row per (admin, group, kind, event). Inserted when the admin
    // dismisses the "new arrival" popup. The list query left-anti-joins
    // against this table so an admin sees each event exactly once.
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_admin_notifications_ack (
        id SERIAL PRIMARY KEY,
        admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        event_id INTEGER NOT NULL,
        acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gana_unique
      ON group_admin_notifications_ack (admin_user_id, group_id, kind, event_id)
    `);

    // ── Prayer-request group scoping ──────────────────────────────────────
    // Prayer requests can now live on a community's prayer wall. Nullable —
    // existing rows stay as personal (non-group) requests. Index on group_id
    // keeps the community-wall lookup cheap.
    await run(client, `
      ALTER TABLE prayer_requests
      ADD COLUMN IF NOT EXISTS group_id INTEGER
      REFERENCES groups(id) ON DELETE CASCADE
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS idx_prayer_requests_group_id
      ON prayer_requests (group_id) WHERE group_id IS NOT NULL
    `);

    // ── User onboarding flag ──────────────────────────────────────────────
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false`);

    // ── Fellows (HISTORICAL — feature removed) ─────────────────────────────
    // The fellows/fellow-invites feature was removed in favor of letter
    // correspondents as the prayer-feed prioritization signal; the Letters
    // feature has since ALSO been removed (2026-07-23) and its tables dropped
    // at the end of this migration, so that signal no longer exists.
    // These CREATE TABLE IF NOT EXISTS calls stay so fresh installs don't
    // fail partway through historical migrations that reference the tables.
    // No runtime code reads or writes them. Safe to leave; safe to drop
    // in a future cleanup migration.
    await run(client, `
      CREATE TABLE IF NOT EXISTS fellows (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        fellow_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, fellow_user_id)
      )
    `);

    // ── Fellow invites (HISTORICAL — feature removed; see note above) ─────
    await run(client, `
      CREATE TABLE IF NOT EXISTS fellow_invites (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        recipient_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS fellow_invites_unique ON fellow_invites (sender_id, recipient_email) WHERE status = 'pending'`);

    // ── Gratitude sharing ──────────────────────────────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS gratitude_responses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS gratitude_seen (
        id SERIAL PRIMARY KEY,
        gratitude_id INTEGER NOT NULL REFERENCES gratitude_responses(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_prayer_at TIMESTAMPTZ`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS gratitude_seen_unique ON gratitude_seen (gratitude_id, user_id)`);

    // ── Private journal (daily written reflection) ─────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS journal_entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prompt TEXT,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_journal_entries_user_created ON journal_entries (user_id, created_at DESC)`);

    // ── Office audio alignments (podcast → office-section timestamps) ──────
    await run(client, `
      CREATE TABLE IF NOT EXISTS office_audio_alignments (
        id SERIAL PRIMARY KEY,
        show TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'forward-movement',
        episode_date TEXT NOT NULL,
        episode_guid TEXT,
        audio_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        aligner TEXT,
        duration_seconds INTEGER,
        sections JSONB,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_office_alignment_episode ON office_audio_alignments (show, source, episode_date)`);

    // ── Practice completion (Way of Love beta home) ───────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS practice_completion (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        section TEXT NOT NULL,
        local_date TEXT NOT NULL,
        week_start TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_practice_completion ON practice_completion (user_id, section, local_date)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_practice_completion_user_week ON practice_completion (user_id, week_start)`);

    // ── Bless — the weekly "bless your community" intention cycle ──────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS bless_intention (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start TEXT NOT NULL,
        text TEXT NOT NULL,
        type TEXT,
        recipient TEXT,
        reminder_time TEXT,
        reminder_fired_date TEXT,
        done_at TIMESTAMPTZ,
        carried_from INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `ALTER TABLE bless_intention ADD COLUMN IF NOT EXISTS reminder_fired_date TEXT`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_bless_intention_user_week ON bless_intention (user_id, week_start)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS bless_week (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start TEXT NOT NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_bless_week ON bless_week (user_id, week_start)`);

    // ── Gather — propose a get-together, collect availability, confirm ──────
    // Ad-hoc, guest-friendly, share-token scheduling (distinct from the
    // community-scoped scheduled_gatherings / gathering_members tables).
    await run(client, `
      CREATE TABLE IF NOT EXISTS gather (
        id SERIAL PRIMARY KEY,
        organizer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        note TEXT,
        place TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        share_token TEXT NOT NULL,
        confirmed_option_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_gather_share_token ON gather (share_token)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_gather_organizer ON gather (organizer_user_id)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS gather_option (
        id SERIAL PRIMARY KEY,
        gather_id INTEGER NOT NULL REFERENCES gather(id) ON DELETE CASCADE,
        datetime TIMESTAMPTZ NOT NULL,
        label TEXT
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_gather_option_gather ON gather_option (gather_id)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS gather_response (
        id SERIAL PRIMARY KEY,
        gather_id INTEGER NOT NULL REFERENCES gather(id) ON DELETE CASCADE,
        respondent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        guest_name TEXT,
        guest_email TEXT,
        suggested_time TEXT,
        response_token TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_gather_response_token ON gather_response (response_token)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_gather_response_gather ON gather_response (gather_id)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS gather_response_option (
        response_id INTEGER NOT NULL REFERENCES gather_response(id) ON DELETE CASCADE,
        option_id INTEGER NOT NULL REFERENCES gather_option(id) ON DELETE CASCADE,
        availability TEXT NOT NULL,
        PRIMARY KEY (response_id, option_id)
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS gather_invitee (
        id SERIAL PRIMARY KEY,
        gather_id INTEGER NOT NULL REFERENCES gather(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        email TEXT,
        notified_at TIMESTAMPTZ
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_gather_invitee_gather ON gather_invitee (gather_id)`);

    // ── prayers_for — private, directed prayers one user holds for another
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayers_for (
        id SERIAL PRIMARY KEY,
        prayer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prayer_text TEXT NOT NULL,
        duration_days INTEGER NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        acknowledged_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS prayers_for_prayer_user ON prayers_for (prayer_user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS prayers_for_recipient ON prayers_for (recipient_user_id)`);

    // ── Prayer Dialogue (1:1 "prayer for the day") ─────────────────────────
    // prayer_partnerships — the 1:1 bond (normalized lo/hi pair; one active
    // partner per person, enforced in the route layer).
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_partnerships (
        id SERIAL PRIMARY KEY,
        user_lo_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_hi_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invited_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        accepted_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        ended_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS prayer_partnerships_pair ON prayer_partnerships (user_lo_id, user_hi_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS prayer_partnerships_lo ON prayer_partnerships (user_lo_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS prayer_partnerships_hi ON prayer_partnerships (user_hi_id)`);

    // walk_pairings — "Walking together": mutual-opt-in layer on the Fellow
    // bond; one normalized lo/hi row per pair. Today-only dots shared only when
    // status='active'. Mirrors prayer_partnerships.
    await run(client, `
      CREATE TABLE IF NOT EXISTS walk_pairings (
        id SERIAL PRIMARY KEY,
        user_lo_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_hi_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invited_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        intention TEXT,
        paused_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        lo_celebrated_date TEXT,
        hi_celebrated_date TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        accepted_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        ended_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS walk_pairings_pair ON walk_pairings (user_lo_id, user_hi_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS walk_pairings_lo ON walk_pairings (user_lo_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS walk_pairings_hi ON walk_pairings (user_hi_id)`);
    // walk_nudges — one-tap encouragement between companions (no threading).
    await run(client, `
      CREATE TABLE IF NOT EXISTS walk_nudges (
        id SERIAL PRIMARY KEY,
        pair_id INTEGER NOT NULL REFERENCES walk_pairings(id) ON DELETE CASCADE,
        from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS walk_nudges_to ON walk_nudges (to_user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS walk_nudges_pair ON walk_nudges (pair_id)`);

    // fellow_prefs — the owner's one-way per-fellow sharing settings: a
    // subjective "same place" marker + whether my plans are visible to them.
    await run(client, `
      CREATE TABLE IF NOT EXISTS fellow_prefs (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        fellow_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        same_place BOOLEAN NOT NULL DEFAULT FALSE,
        share_plans BOOLEAN NOT NULL DEFAULT TRUE,
        share_progress BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `ALTER TABLE fellow_prefs ADD COLUMN IF NOT EXISTS share_progress BOOLEAN NOT NULL DEFAULT TRUE`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS fellow_prefs_owner_fellow ON fellow_prefs (owner_id, fellow_user_id)`);

    // daily_prayers — one "prayer for the day" per author per local day,
    // shared with ALL the author's partners (author-scoped, not partner-scoped).
    await run(client, `
      CREATE TABLE IF NOT EXISTS daily_prayers (
        id SERIAL PRIMARY KEY,
        author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ymd TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // A pre-multi-thread build scoped the prayer to a single partner; the
    // prayer for the day is now shared with every partner, so shed those cols.
    await run(client, `ALTER TABLE daily_prayers DROP COLUMN IF EXISTS partner_id`);
    await run(client, `ALTER TABLE daily_prayers DROP COLUMN IF EXISTS partnership_id`);
    await run(client, `DROP INDEX IF EXISTS daily_prayers_partnership`);
    await run(client, `DROP INDEX IF EXISTS daily_prayers_partner`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS daily_prayers_author_ymd ON daily_prayers (author_id, ymd)`);
    await run(client, `CREATE INDEX IF NOT EXISTS daily_prayers_author ON daily_prayers (author_id, created_at)`);
    // Next-morning delivery: a shared prayer is sealed until the next morning
    // in the author's timezone, so a partner wakes up to it (Snapchat-style).
    // deliver_after = the absolute instant it becomes visible to partners;
    // notified_at = when the deferred "new prayer" push was sent (the morning
    // sweep stamps it so it fires once). Both NULL on legacy rows → those stay
    // immediately visible and are never re-pushed (the sweep skips NULLs).
    await run(client, `ALTER TABLE daily_prayers ADD COLUMN IF NOT EXISTS deliver_after TIMESTAMPTZ`);
    await run(client, `ALTER TABLE daily_prayers ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ`);
    // The morning sweep scans for due-but-unnotified rows; index that predicate.
    await run(client, `CREATE INDEX IF NOT EXISTS daily_prayers_delivery ON daily_prayers (deliver_after) WHERE notified_at IS NULL`);

    // prayer_attentions — the attention/"view receipt" (>=3s = counted/prayed).
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_attentions (
        id SERIAL PRIMARY KEY,
        daily_prayer_id INTEGER NOT NULL REFERENCES daily_prayers(id) ON DELETE CASCADE,
        viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attention_seconds INTEGER NOT NULL DEFAULT 0,
        counted_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS prayer_attentions_prayer_viewer ON prayer_attentions (daily_prayer_id, viewer_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS prayer_attentions_viewer ON prayer_attentions (viewer_id)`);

    // ── Prayer Circles (beta) ──────────────────────────────────────────────
    // A prayer circle is a group with a shared intention. These columns are
    // nullable/defaulted so existing groups keep working unchanged, and the
    // new `circle_daily_focus` table stores what each circle is praying for
    // on a given day. Idempotent — safe to run on every boot.
    //
    // CRITICAL: without these ALTERs, every `SELECT * FROM groups` fails
    // against older databases and the whole community surface goes blank.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_prayer_circle BOOLEAN NOT NULL DEFAULT false`);
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS intention TEXT`);
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS circle_description TEXT`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS circle_daily_focus (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        focus_date TEXT NOT NULL,
        focus_type TEXT NOT NULL,
        subject_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        subject_text TEXT,
        added_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_circle_daily_focus_group_date ON circle_daily_focus (group_id, focus_date)`);

    // ── Prayer Circles: multi-intention cards ─────────────────────────────
    // A circle can hold many intentions at once, each as its own card.
    // Replaces the old single groups.intention/circle_description column
    // pair; the legacy columns stay put as a "first intention" stash
    // used only during group creation.
    //
    // Idempotent creation + a one-time backfill that seeds one row per
    // circle whose legacy intention was set and hasn't already been
    // ported over (the NOT EXISTS guard is what makes the backfill
    // safe to rerun on every boot).
    await run(client, `
      CREATE TABLE IF NOT EXISTS circle_intentions (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_circle_intentions_group ON circle_intentions (group_id) WHERE archived_at IS NULL`);
    await run(client, `
      INSERT INTO circle_intentions (group_id, title, description, created_by_user_id, sort_order, created_at)
      SELECT g.id, g.intention, g.circle_description, g.created_by_user_id, 0, g.created_at
      FROM groups g
      WHERE g.is_prayer_circle = TRUE
        AND g.intention IS NOT NULL
        AND length(trim(g.intention)) > 0
        AND NOT EXISTS (
          SELECT 1 FROM circle_intentions ci
          WHERE ci.group_id = g.id
        )
    `);

    // ── device_tokens — APNs/FCM push tokens for native mobile clients ─────
    // One row per (user_id, platform, token). Re-registration is an upsert
    // via the UNIQUE index; `last_seen_at` is bumped so we can prune tokens
    // idle longer than ~60 days (APNs returns "unregistered" for those
    // anyway). `invalidated_at` is set when APNs reports a dead token.
    await run(client, `
      CREATE TABLE IF NOT EXISTS device_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        token TEXT NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        invalidated_at TIMESTAMPTZ
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_user_platform_token_idx ON device_tokens (user_id, platform, token)`);

    // ── web_push_subscriptions — VAPID push subs for browser users ────────
    // Android Chrome / Firefox / Edge etc. Once the user grants
    // notification permission, the browser hands us a PushSubscription
    // (endpoint URL + p256dh + auth keys) which we store here. The bell
    // sender posts encrypted payloads to that endpoint with web-push.
    await run(client, `
      CREATE TABLE IF NOT EXISTS web_push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        invalidated_at TIMESTAMPTZ
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS web_push_subscriptions_user_endpoint_idx ON web_push_subscriptions (user_id, endpoint)`);

    // ── Prayer-request Amens ───────────────────────────────────────────────
    // One row per "Amen" tap on someone else's prayer request. The owner sees
    // an aggregate count (today / all-time) of how many times their request
    // has been prayed over. Non-owners never see the number — praying for
    // someone stays anonymous to the wider community, only visible to the
    // person being carried. Cascades on request delete and on user delete.
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_request_amens (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prayed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_request_amens_request_id ON prayer_request_amens (request_id)`);

    // adopted_prayers — "Pray along": a user adopts someone else's prayer
    // intention so it joins their OWN prayer list + daily slideshow going
    // forward (distinct from a one-day amen). releasedAt = null while active;
    // re-adopting revives the same row. Unique on (request, adopter) so a
    // person carries an intention at most once.
    await run(client, `
      CREATE TABLE IF NOT EXISTS adopted_prayers (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
        adopter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        adopted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS idx_adopted_prayers_request_adopter ON adopted_prayers (request_id, adopter_user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_adopted_prayers_adopter ON adopted_prayers (adopter_user_id)`);

    // Daily "you've been held in prayer today" notification queue.
    // Created on the first non-owner amen of a request on a given day
    // (in the recipient's tz); incremented on each subsequent amen
    // during the 2-hour batching window; claimed by the scanner after
    // 2h and pushed once. Unique on (request, recipient, day) so re-amens
    // after sent_at don't generate a second notification that day.
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_held_notifications (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
        recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_key TEXT NOT NULL,
        first_amen_at TIMESTAMPTZ NOT NULL,
        first_amen_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amen_count INTEGER NOT NULL DEFAULT 1,
        sent_at TIMESTAMPTZ
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_phn_pending ON prayer_held_notifications (sent_at, first_amen_at)`);
    // Recipient-scoped uniqueness. An earlier model batched per
    // (request_id, day_key) — fine when only the owner ever got
    // notified. We now also enqueue rows for tagged users (the
    // "praying for my friend Matthew" feature), so a SECOND row per
    // (request, day) with a different recipient_id is legitimate. This
    // three-column index is the real constraint the amen upsert targets
    // (routes/prayer.ts → ON CONFLICT request_id, recipient_id, day_key).
    //
    // We DROP the legacy narrow index if a prior deploy created it, but we
    // no longer CREATE it first: once multi-recipient rows exist, the
    // narrow (request_id, day_key) unique index can't be built, so that
    // step failed on EVERY boot ("could not create unique index
    // uniq_phn_request_day … is duplicated"). Harmless (it's superseded +
    // dropped right after) but noisy — removed.
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_phn_request_recipient_day ON prayer_held_notifications (request_id, recipient_id, day_key)`);
    await run(client, `DROP INDEX IF EXISTS uniq_phn_request_day`);

    // ── Group service schedules ───────────────────────────────────────────
    // A community can have one recurring service schedule — e.g. "Sunday
    // Services" with multiple times on the same weekday. Rendered as ONE
    // card on the dashboard; click reveals all service times.
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_service_schedules (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Sunday Services',
        day_of_week INTEGER NOT NULL DEFAULT 0,
        times JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_group_service_schedule_group_id
      ON group_service_schedules (group_id)
    `);
    // Back-compat: add the optional schedule-level `location` column for
    // communities whose db predates it. Nullable because most schedules won't
    // have a single place yet.
    await run(client, `ALTER TABLE group_service_schedules ADD COLUMN IF NOT EXISTS location TEXT`);

    // ── Prayer Feeds (beta) ───────────────────────────────────────────────
    // A subscribable cause (e.g. "Climate Justice") where the creator
    // publishes a new intention every day. Four tables:
    //   prayer_feeds               — the cause itself
    //   prayer_feed_entries        — one per day; the intention
    //   prayer_feed_subscriptions  — who follows the feed
    //   prayer_feed_prayers        — who prayed which entry
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_feeds (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        tagline TEXT,
        cover_emoji TEXT,
        cover_image_url TEXT,
        creator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        timezone TEXT NOT NULL DEFAULT 'America/New_York',
        state TEXT NOT NULL DEFAULT 'draft',
        subscriber_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_prayer_feeds_slug ON prayer_feeds (slug)`);

    // Phoebe Parish — `kind` partitions feeds. "general" is the legacy
    // shape (anyone can subscribe, the creator publishes content);
    // "parish" is a Phoebe Parish congregation with at-most-one
    // subscription per user (enforced via users.parish_feed_id).
    // Idempotent: existing rows fall through the default 'general'.
    await run(client, `ALTER TABLE prayer_feeds ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'general'`);
    await run(client, `ALTER TABLE prayer_feeds ADD COLUMN IF NOT EXISTS parish_evening_recap_sent_date TEXT`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_feed_entries (
        id SERIAL PRIMARY KEY,
        feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        entry_date DATE NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        scripture_ref TEXT,
        image_url TEXT,
        state TEXT NOT NULL DEFAULT 'draft',
        pray_count INTEGER NOT NULL DEFAULT 0,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_feed_entries_feed_date ON prayer_feed_entries (feed_id, entry_date)`);

    // Ministry sources — scraped-event sources, one per prayer feed. Shipped in
    // the Drizzle schema (lib/db/schema/ministry_sources) without a matching
    // migration, so the ministries manager + scraper were hitting "relation
    // ministry_sources does not exist". Created here, mirroring the schema, and
    // placed after prayer_feeds so the feed_id FK resolves on a fresh DB too.
    await run(client, `
      CREATE TABLE IF NOT EXISTS ministry_sources (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        events_url TEXT NOT NULL,
        news_url TEXT,
        feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        last_status TEXT,
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_ministry_sources_feed_id ON ministry_sources(feed_id)`);

    // Parish admins — additional admins for a Phoebe Parish feed (the
    // creator is implicitly an admin; see canManageParish in routes/parish.ts).
    // Schema-defined (lib/db/src/schema/parish_admins) with no prior runtime
    // CREATE. Placed after prayer_feeds so the parish_feed_id FK resolves on a
    // fresh DB. Columns mirror the schema exactly.
    await run(client, `
      CREATE TABLE IF NOT EXISTS parish_admins (
        id SERIAL PRIMARY KEY,
        parish_feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_parish_admins_pair ON parish_admins (parish_feed_id, user_id)`);

    // Parish "ways to get involved" opportunities — a priest publishes worship
    // roles + service ministries + community groups; parishioners tap
    // "I'm interested". Schema: lib/db/src/schema/parish_opportunities +
    // parish_opportunity_interests. Placed after prayer_feeds so the FK resolves.
    await run(client, `
      CREATE TABLE IF NOT EXISTS parish_opportunities (
        id SERIAL PRIMARY KEY,
        parish_feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'other',
        schedule_note TEXT,
        contact TEXT,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_parish_opportunities_feed ON parish_opportunities (parish_feed_id)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS parish_opportunity_interests (
        id SERIAL PRIMARY KEY,
        opportunity_id INTEGER NOT NULL REFERENCES parish_opportunities(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT,
        email TEXT,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_parish_opp_interest_pair ON parish_opportunity_interests (opportunity_id, user_id)`);

    // The leader's prayer list — the priest's ongoing intentions the parish prays
    // WITH them (parish_prayer_list) + who prayed each (parish_prayer_list_prayers,
    // one row per (item,user) for an idempotent "prayed with N" count).
    await run(client, `
      CREATE TABLE IF NOT EXISTS parish_prayer_list (
        id SERIAL PRIMARY KEY,
        parish_feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_parish_prayer_list_feed ON parish_prayer_list (parish_feed_id)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS parish_prayer_list_prayers (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES parish_prayer_list(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_parish_prayer_list_prayer_pair ON parish_prayer_list_prayers (item_id, user_id)`);

    // ── Multi-slot prayer feed entries ─────────────────────────────────────
    // Each (feed_id, entry_date) supports up to three entries — slots
    // 1/2/3. Each slot becomes its own slide on the subscriber side, so
    // an admin can program three distinct intentions per day.
    //
    // Migration steps (idempotent — runs every boot):
    //   1. Add `slot` column with default 1 if missing. Existing rows
    //      land on slot=1 so single-slot legacy data keeps working.
    //   2. Drop the old (feed_id, entry_date) unique index — it
    //      conflicts with the new triple unique once a feed has more
    //      than one entry per day.
    //   3. Create the new (feed_id, entry_date, slot) unique index.
    await run(client, `ALTER TABLE prayer_feed_entries ADD COLUMN IF NOT EXISTS slot INTEGER NOT NULL DEFAULT 1`);
    // Optional "Learn more" URL — surfaces as a pill CTA on the
    // subscriber's intercession slide. Mirrors the Bible.com pill
    // on lectionary slides.
    await run(client, `ALTER TABLE prayer_feed_entries ADD COLUMN IF NOT EXISTS learn_more_url TEXT`);
    await run(client, `DROP INDEX IF EXISTS uniq_prayer_feed_entries_feed_date`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_prayer_feed_entries_feed_date_slot ON prayer_feed_entries (feed_id, entry_date, slot)`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_feed_subscriptions (
        id SERIAL PRIMARY KEY,
        feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        muted_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_prayer_feed_subscriptions_feed_user ON prayer_feed_subscriptions (feed_id, user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_feed_subscriptions_user ON prayer_feed_subscriptions (user_id)`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_feed_prayers (
        id SERIAL PRIMARY KEY,
        feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        entry_id INTEGER NOT NULL REFERENCES prayer_feed_entries(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_local DATE NOT NULL,
        reflection_text TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_prayer_feed_prayers_entry_user ON prayer_feed_prayers (entry_id, user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_feed_prayers_feed_day ON prayer_feed_prayers (feed_id, day_local)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_feed_prayers_user ON prayer_feed_prayers (user_id)`);

    // ── prayer_feed_recurring_entries ─────────────────────────────────────
    // Daily / weekly templates that auto-expand into the daily
    // slide deck on the subscriber side. Concrete prayer_feed_entries
    // override these on a specific date+slot.
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_feed_recurring_entries (
        id SERIAL PRIMARY KEY,
        feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        slot INTEGER NOT NULL,
        recurrence_kind TEXT NOT NULL,
        weekdays_mask INTEGER NOT NULL DEFAULT 127,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        learn_more_url TEXT,
        state TEXT NOT NULL DEFAULT 'live',
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_feed_recurring_feed_slot ON prayer_feed_recurring_entries (feed_id, slot)`);

    // (Removed: a per-deploy DELETE that collapsed duplicate templates
    // per (feed, slot) to one row. It was meant as a one-time cleanup
    // but kept eating user data on every Railway redeploy — admins
    // reported losing newly-saved templates after pushes. The POST
    // /recurring handler picks a free slot at the application layer
    // now, so duplicates shouldn't form, and any pre-existing dupes
    // can be tidied via the manage UI's Delete buttons rather than
    // a destructive migration.)

    // ── prayer_feed_groups ────────────────────────────────────────────────
    // Many-to-many between feeds and communities. Adding a group binds
    // the feed to it AND auto-subscribes every joined member of the
    // group to the feed (the API handler does the subscription
    // INSERT). Removing a binding doesn't unsubscribe individuals.
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_feed_groups (
        id SERIAL PRIMARY KEY,
        feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_prayer_feed_groups_pair ON prayer_feed_groups (feed_id, group_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_feed_groups_feed ON prayer_feed_groups (feed_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_feed_groups_group ON prayer_feed_groups (group_id)`);

    // ── prayer_sessions ─────────────────────────────────────────────────────
    // Per-user time-spent ledger. One row per finished session in the
    // slideshow / Office / Devotion viewer. The metrics page rolls
    // these up by community to surface a "Time praying" row.
    //
    // Why a dedicated table instead of widening prayer_request_amens?
    // (a) Sessions don't have a target row to attach to (the slideshow
    //     is a deck, not a single request).
    // (b) Sessions cap at 60 min and exclude <5 sec passes — those
    //     filters should live next to the duration column, not be
    //     re-applied at every read site.
    // (c) Surface granularity (slideshow vs. morning-prayer vs.
    //     morning-devotion etc.) lets the metrics page break down
    //     where the time came from, which we'd lose if we conflated
    //     it with amen rows.
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        surface TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ NOT NULL
      )
    `);
    // Composite index for the per-user "this week / this month" rollups
    // the metrics page does. Covering both columns means the rollup is
    // an index-only range scan.
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_sessions_user_ended ON prayer_sessions (user_id, ended_at)`);
    // High-water mark of the slide index the user reached during
    // the session. The metrics CTE filters office sessions to those
    // with slides_completed ≥ 3 so a tap-and-bail doesn't count.
    // Nullable on the table; the SQL treats NULL as "qualifies"
    // (legacy rows pre-dating this column).
    await run(client, `ALTER TABLE prayer_sessions ADD COLUMN IF NOT EXISTS slides_completed INTEGER`);
    // Per-session visibility — when TRUE, the row is hidden from other
    // users' "who sat with me" companion lookups (the contemplation
    // summary screen and the history-overlap row). The owner always
    // sees their own private sits in their own history. Default FALSE
    // so existing rows behave as before; the contemplation summary
    // toggle is the only surface that flips this today.
    await run(client, `ALTER TABLE prayer_sessions ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE`);

    // Routine backlog — the past routines a person can revert to. Snapshots
    // are taken BEFORE a routine changes (opening the customizer, accepting an
    // AI-built one, restoring an older one), so each row is a rhythm they
    // actually lived with. `spec` is a whole PrescribedRoutineSpec, the shape
    // prescribed routines and the interview already use, so restoring is just
    // applyRoutineSpecToUser with an older spec.
    await run(client, `
      CREATE TABLE IF NOT EXISTS routine_snapshots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        spec JSONB NOT NULL,
        source TEXT NOT NULL DEFAULT 'customizer',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // The only read pattern: this user's snapshots, newest first.
    await run(client, `CREATE INDEX IF NOT EXISTS routine_snapshots_user_created_idx ON routine_snapshots (user_id, created_at)`);

    // Designated places to breathe — admin-authored, a short curated list.
    // lat/lng belong to the PLACE (a fixed public spot an admin typed in),
    // never to a person: the device compares its own position against these
    // on-device and sends only a boolean. See schema/breath_places.ts for why
    // that distinction is what lets this exist at all.
    await run(client, `
      CREATE TABLE IF NOT EXISTS breath_places (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        subtitle TEXT,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        radius_meters INTEGER NOT NULL DEFAULT 150,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS breath_places_active_idx ON breath_places (active, name)`);
    // A place's own backdrop photos — https URLs, since the app's bundled photo
    // libraries are glob'd at build time and can't serve a runtime-created place.
    await run(client, `ALTER TABLE breath_places ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb`);
    // The glyph in the centre of the breathing rings. NULL keeps the globe.
    await run(client, `ALTER TABLE breath_places ADD COLUMN IF NOT EXISTS center_emoji TEXT`);

    /**
     * The first designated place — The Flamingo, at Virginia Theological
     * Seminary. Seeded rather than left to the admin UI so it exists the
     * moment this deploys, and because its photo library ships INSIDE the app
     * (bundled:flamingos → src/assets/breath-places/flamingos) and therefore
     * can't be typed as a URL.
     *
     * Keyed on the name so re-running migrate() never duplicates it, and
     * deliberately NOT an upsert: once this row exists, an admin editing it
     * (moving it, changing its radius, retiring it) must not be overwritten on
     * the next boot. The seed's job is to bring it into being, not to own it.
     */
    await run(client, `
      INSERT INTO breath_places (name, subtitle, lat, lng, radius_meters, center_emoji, photo_urls)
      -- 161m ≈ 0.1 miles (owner: "let anyone within .1 miles check in").
      SELECT 'The Flamingo', 'Virginia Theological Seminary', 38.8210, -77.0930, 161, '🦩', '["bundled:flamingos"]'::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM breath_places WHERE name = 'The Flamingo')
    `);
    /**
     * Say out loud whether the place actually exists after that.
     *
     * run() deliberately swallows statement errors — right for a migration
     * that must not wedge a boot on one bad ALTER, wrong for a seed whose
     * whole job is to put a row there. A failed INSERT looked identical to a
     * successful one, and the only symptom was "the flamingo is not showing
     * up" with nothing in the logs to point at. One cheap SELECT turns that
     * into an answer.
     */
    try {
      const check = await client.query(`SELECT COUNT(*)::int AS n FROM breath_places WHERE name = 'The Flamingo'`);
      const n = (check as { rows?: Array<{ n?: number }> }).rows?.[0]?.n ?? 0;
      if (n > 0) logger.info({ n }, "[migrate] breath_places: The Flamingo present");
      else logger.warn({}, "[migrate] breath_places: The Flamingo MISSING after seed — the INSERT failed (see the warning above it)");
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[migrate] breath_places: could not verify the seed");
    }
    // NOTE: the breath_sessions place columns are NOT added here. This block
    // runs ~1700 lines BEFORE `CREATE TABLE breath_sessions`, so on any boot
    // where that table does not yet exist the ALTERs fail against a missing
    // table — and run() swallows the error. The table is then created without
    // place_id, and every /breath/places query (which selects bs.place_id)
    // 500s, which reads in the app as "Couldn't reach the places just now".
    // They now live directly after the CREATE. Search: breath_sessions_place_day_idx.

    // What each person's daily silence goal WAS on a given day, so raising the
    // goal can't retroactively un-keep days they actually kept. Written lazily
    // when the practice week is computed.
    await run(client, `
      CREATE TABLE IF NOT EXISTS contemplation_goal_history (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ymd TEXT NOT NULL,
        goal_minutes INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, ymd)
      )
    `);
    // source: a display tag for WHERE a contemplation sit came from, distinct
    // from `surface` (which stays "contemplation" so the goal/stats/streak
    // rollups keep counting it). Today only "cobreathe" is set — so the
    // Contemplation history can label a Cobreathe sit as such instead of an
    // anonymous timer sit. NULL = a plain silent sit.
    await run(client, `ALTER TABLE prayer_sessions ADD COLUMN IF NOT EXISTS source TEXT`);
    // Per-side contemplation attribution ("morning"|"evening") — lets the
    // server echo per-side done-state across the user's devices.
    await run(client, `ALTER TABLE prayer_sessions ADD COLUMN IF NOT EXISTS contemplation_side TEXT`);
    // completed: true only when the user finished the office/devotion slideshow
    // (closing Amen/Done) or attested it from the book. The office-history /
    // "prayed today" rollups require this for the four office surfaces, so a
    // partial sit that auto-commits on unmount no longer counts the office.
    //
    // Adding + backfilling happen together inside a DO guard that only runs
    // when the column doesn't yet exist — so the one-time grandfather (mark all
    // EXISTING office/cathedral/podcast sessions completed, so historical
    // streaks + office-history don't retroactively drop) runs exactly once and
    // never re-flips the partial sessions written after this ships.
    await run(client, `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'prayer_sessions' AND column_name = 'completed'
        ) THEN
          ALTER TABLE prayer_sessions ADD COLUMN completed BOOLEAN NOT NULL DEFAULT FALSE;
          UPDATE prayer_sessions SET completed = TRUE
          WHERE surface IN (
            'morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion',
            'national-cathedral', 'morning-office-podcast', 'evening-office-podcast'
          );
        END IF;
      END $$;
    `);

    // Apple Health / HealthKit integration removed (privacy simplification): the
    // app no longer reads mindful minutes or steps. The contemplation_health_minutes
    // and daily_health_steps tables are dropped at the end of this migration.

    // ── Sign in with Apple — add apple_id column + partial-unique index ─────
    // `sub` from a verified Apple identity token. Partial-unique so existing
    // Google-only / email-only users don't trip a uniqueness check on NULL.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id TEXT`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS users_apple_id_idx ON users (apple_id) WHERE apple_id IS NOT NULL`);

    // ── Daily prayer-list streak (Duolingo-style celebration) ────────────────
    // prayer_streak_count: current consecutive-days count.
    // prayer_streak_last_date: YYYY-MM-DD in the user's local timezone.
    // Compare vs today-local to decide increment / reset / no-op.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS prayer_streak_count INTEGER NOT NULL DEFAULT 0`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS prayer_streak_last_date TEXT`);

    // Timestamp for the re-showing daily-prayer-list popup. Lets the
    // dashboard re-offer the list every six hours of idle when the user
    // still hasn't prayed — instead of the old once-per-day behavior.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS prayer_invite_last_shown_at TIMESTAMPTZ`);

    // When a user's prayer request expires naturally (expiresAt passes
    // without them marking it answered or released), we pop up a
    // closing card the next time they visit /prayer-list showing how
    // many people prayed for it. This column tracks which requests have
    // had that closing moment acknowledged.
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS release_popup_seen_at TIMESTAMPTZ`);

    // Additional-groups junction for intercessions: a moment can show up
    // in multiple communities' home feeds without duplicating the row.
    // Primary ownership still lives on shared_moments.group_id; this
    // table only lists the "also visible from" groups.
    await run(client, `
      CREATE TABLE IF NOT EXISTS moment_groups (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (moment_id, group_id)
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_moment_groups_moment ON moment_groups(moment_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_moment_groups_group ON moment_groups(group_id)`);

    // ── Orphan cleanup: group_members rows pointing to deleted users ──
    // Accounts deleted before we wired explicit cleanup into
    // DELETE /api/users/me left their group_members row behind. Two
    // scenarios we have to cover separately:
    //
    //   (a) The FK had no cascade at all → user_id still points to a
    //       users.id that no longer exists.
    //   (b) The FK had ON DELETE SET NULL (older drizzle-kit push
    //       behavior) → user_id became NULL but joined_at stayed,
    //       so the row now looks exactly like a pending invitee.
    //
    // The distinguishing mark for (b) is joined_at IS NOT NULL — a
    // legitimate invitee never has joined_at set. Both cleanups below
    // run unconditionally; the second is the one that actually fixes
    // the "still showing the deleted user in the member count" bug
    // the user has been hitting. Idempotent and safe to re-run.
    await run(client, `
      DELETE FROM group_members
      WHERE user_id IS NOT NULL
        AND user_id NOT IN (SELECT id FROM users)
    `);
    await run(client, `
      DELETE FROM group_members
      WHERE joined_at IS NOT NULL
        AND LOWER(email) NOT IN (SELECT LOWER(email) FROM users)
    `);

    // Same story for moment_user_tokens (practice participation) — a
    // deleted user's token lingers and keeps counting toward the
    // practice's memberCount. The email-not-in-users heuristic sweeps
    // both "deleted account" and "never-signed-up invitee" rows; we
    // narrow to rows that had real activity (calendar connected OR
    // posts logged) so pending email invites stay alive.
    await run(client, `
      DELETE FROM moment_posts mp
      WHERE EXISTS (
        SELECT 1 FROM moment_user_tokens mut
        WHERE mut.user_token = mp.user_token
          AND LOWER(mut.email) NOT IN (SELECT LOWER(email) FROM users)
      )
    `);
    await run(client, `
      DELETE FROM moment_user_tokens
      WHERE LOWER(email) NOT IN (SELECT LOWER(email) FROM users)
        AND (
          calendar_connected = true
          OR personal_time IS NOT NULL
          OR google_calendar_event_id IS NOT NULL
        )
    `);

    // Also drop stray moment_posts whose token is completely orphaned
    // (its moment_user_tokens row is gone). Shouldn't happen after the
    // step above, but keep as a sweep for any historical drift.
    await run(client, `
      DELETE FROM moment_posts
      WHERE user_token NOT IN (SELECT user_token FROM moment_user_tokens)
    `);

    // Clean up prayer_request_amens, lectio_reflections, and other
    // email-keyed engagement surfaces for deleted users. These are all
    // email-keyed (no users.id FK), so a cascade can't reach them.
    // Each is idempotent — re-running is a no-op once orphans are gone.
    await run(client, `
      DELETE FROM lectio_reflections
      WHERE user_email IS NOT NULL
        AND LOWER(user_email) NOT IN (SELECT LOWER(email) FROM users)
    `);

    // Belt-and-suspenders: enforce cascade on group_members.user_id so
    // future deletes go through the DB even if a caller forgets the
    // explicit cleanup. Drop + re-add is the safe idempotent path.
    await run(client, `
      ALTER TABLE group_members
      DROP CONSTRAINT IF EXISTS group_members_user_id_fkey
    `);
    await run(client, `
      ALTER TABLE group_members
      ADD CONSTRAINT group_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    `);

    // content_reports — user reports of objectionable UGC. Required by
    // App Store review (Guideline 1.2): apps with user-generated content
    // must offer in-app reporting and operator follow-up within 24h.
    // The table records who reported what, why, and a status field for
    // the eventual moderation queue. Idempotent CREATE so re-deploys
    // don't trip over "already exists."
    await run(client, `
      CREATE TABLE IF NOT EXISTS content_reports (
        id SERIAL PRIMARY KEY,
        reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        reviewed_at TIMESTAMP WITH TIME ZONE
      )
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
        ON content_reports (status, created_at)
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS idx_content_reports_reporter
        ON content_reports (reporter_user_id)
    `);

    // prayer_requests.kind — author's framing at submission ("request",
    // "life-event", "justice"). Stored as text so we can add new flavors
    // without another migration. Drives the optional pill on cards and
    // in the slideshow; existing rows backfill to the default "request".
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'request'`);

    // ── Phoebe Climate (invite-only section) ────────────────────────────────
    // climate_enrolled flag
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS climate_enrolled BOOLEAN NOT NULL DEFAULT FALSE`);

    // climate_onboarding_completed — separate from onboarding_completed,
    // tracks the climate-specific intro slides shown once after signup.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS climate_onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE`);

    // climate_only — true for users created via /climate signup. Existing
    // Phoebe users keep the default false even if they later get
    // climate_enrolled. Used to hide non-climate nav from the W&W cohort.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS climate_only BOOLEAN NOT NULL DEFAULT FALSE`);

    // El Jardín portal tier flags (mirror the climate pattern). jardin_only
    // accounts are created via the Jardín portal signup and see only Jardín.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS jardin_enrolled BOOLEAN NOT NULL DEFAULT FALSE`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS jardin_only BOOLEAN NOT NULL DEFAULT FALSE`);

    // parish_id FK (nullable, no NOT NULL)
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_id INTEGER REFERENCES groups(id)`);

    // Phoebe Parish — pointer to the user's chosen parish feed (kind="parish"
    // in prayer_feeds). At most one parish per user is enforced by this
    // column existing as a single FK rather than a join table. The
    // simplified parish-only UI is gated by:
    //   parish_feed_id IS NOT NULL
    //     AND user has no row in beta_users
    //     AND user has no rows in group_members
    // Joining a community via invite link writes a group_members row,
    // which flips the gate and unlocks the full app on the next
    // request — no separate promotion job needed.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_feed_id INTEGER REFERENCES prayer_feeds(id) ON DELETE SET NULL`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_users_parish_feed_id ON users (parish_feed_id) WHERE parish_feed_id IS NOT NULL`);

    // Office reminder prefs for Phoebe Parish users. Three-way enum
    // per side of the day ("none" / "office" / "devotion"), with
    // optional time overrides. Morning DEFAULT is now 'devotion'
    // (see backfill block below); evening DEFAULT stays 'none'.
    // BCP Daily Office: include the Confession of Sin + Absolution at
    // the top of MP/EP? Default OFF — opt-in from Settings.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS bcp_show_confession BOOLEAN NOT NULL DEFAULT FALSE`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_office_morning_pref TEXT NOT NULL DEFAULT 'none'`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_office_evening_pref TEXT NOT NULL DEFAULT 'none'`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_office_morning_time TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_office_evening_time TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_office_morning_sent_date TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_office_evening_sent_date TEXT`);
    // Evening follow-up reminder dedup — a second nudge ~3h after the initial
    // evening reminder if evening prayer still isn't done and it's before 10pm.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_office_evening_followup_sent_date TEXT`);
    // Morning follow-up reminder dedup (same idea, morning side).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_office_morning_followup_sent_date TEXT`);
    // "gentle" (one reminder per side) vs "nudge" (also send the follow-up
    // above). Chosen in the customizer's closing Notifications step.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_style TEXT NOT NULL DEFAULT 'gentle'`);
    // Daily contemplation goal (minutes; 0 = off) + per-day nudge dedup stamp
    // + whether the ~7pm nudge is enabled (default true).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS contemplation_goal_minutes INTEGER NOT NULL DEFAULT 0`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS contemplation_goal_sent_date TEXT`);
    // Daily steps goal (Apple Health) + one-per-day "reached" push dedupe.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_step_goal INTEGER NOT NULL DEFAULT 0`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_step_reached_date TEXT`);
    // Personal, shareable 1:1 prayer-dialogue invite token (Heart to Hearts).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS prayer_partner_invite_token TEXT`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS users_prayer_partner_invite_token_uk ON users (prayer_partner_invite_token)`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS contemplation_reminder_enabled BOOLEAN NOT NULL DEFAULT true`);
    // Weekly Way of Love review — Sunday-evening reminder (opt-out) + per-week dedup stamp.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_review_reminder BOOLEAN NOT NULL DEFAULT true`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_review_nudge_sent_date TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS routine_audit_nudge_sent_date TEXT`);
    // YYYY-MM-DD (parish TZ) of the last Saturday-evening parish-recap
    // push we fired for this user. NULL = never sent. Added separately
    // because the column was introduced in 62639d5 without a migrate.ts
    // entry — every drizzle select().from(usersTable) crashed in
    // production with _DrizzleQueryError "column does not exist" until
    // this ALTER landed, including passport.deserializeUser on the auth
    // middleware (so any logged-in request to /dashboard / /service-worker.js
    // returned the generic 500 JSON, which is what Safari displayed
    // when the user navigated back from the slideshow).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS parish_weekly_recap_sent_date TEXT`);

    // ── Default morning office reminder → 'devotion' ──────────────────────
    // The morning office pref originally defaulted to 'none' so legacy
    // rows didn't start receiving pushes without consent. With the
    // home redesign — daily rhythm anchored on the office — that
    // conservative default left fresh users with no nudge at all,
    // and the feature stayed invisible until they hunted in Settings.
    //
    // This block flips the default to 'devotion' (the short ~3-min
    // BCP form) AND backfills existing rows whose pref is still the
    // old 'none'. We gate the backfill on the column's CURRENT default
    // — so once the default has been flipped, the UPDATE is skipped on
    // every later boot (idempotent without a marker column). Users
    // who deliberately set 'none' in Settings *after* this migration
    // runs are not affected: the gate prevents re-running.
    await run(client, `
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = 'parish_office_morning_pref'
            AND (column_default IS NULL OR column_default NOT LIKE '%devotion%')
        ) THEN
          UPDATE users
            SET parish_office_morning_pref = 'devotion'
            WHERE parish_office_morning_pref = 'none';
        END IF;
      END $$;
    `);
    await run(client, `ALTER TABLE users ALTER COLUMN parish_office_morning_pref SET DEFAULT 'devotion'`);

    // BCP-47 locale code. Default English so legacy rows render in
    // English without backfill. Beta users can flip to "es" via
    // Settings → Language; non-beta accounts stay locked to English
    // at the API surface (the settings toggle is hidden for them).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en'`);

    // Home-screen layout customization (the "Customize" pill → page).
    // JSON { order: string[], hidden: string[] } of home-module keys.
    // NULL = not customized (dashboard derives a default from
    // feed_first_home, preserving the existing layout).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS home_layout JSONB`);
    // Custom rituals (user-defined daily anchors) + per-day state, synced across
    // devices — an opaque blob owned by the client (lib/customAnchors).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_anchors JSONB`);
    // Routine settings (office levels, slots, etc.) synced across devices as one
    // blob (lib/routineSync) so a person's rhythm matches phone ↔ web.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS rule_config JSONB`);
    // "Grow my silence" ladder state (opt-in guided contemplation program).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS silence_ladder JSONB`);
    // Phone-sabbath rest days (weekday numbers 0=Sun..6=Sat).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS rest_days JSONB`);

    // Backfill: a word of comfort now counts as an amen, but words written
    // before that shipped (2026-06-17) have no amen row, so their authors never
    // appeared in the "who prayed for me" rail. Create the missing amen rows,
    // bucketed by the OWNER's timezone (matching the read-side dedup), using the
    // word's created_at as prayed_at so it lands on the right day. Idempotent
    // (NOT EXISTS) and skips owner self-words (excluded from the rail anyway).
    await run(client, `
      INSERT INTO prayer_request_amens (request_id, user_id, prayed_at)
      SELECT w.request_id, w.author_user_id, w.created_at
      FROM prayer_words w
      JOIN prayer_requests r ON r.id = w.request_id
      LEFT JOIN users ou ON ou.id = r.owner_id
      WHERE w.author_user_id <> r.owner_id
        AND NOT EXISTS (
          SELECT 1 FROM prayer_request_amens a
          WHERE a.request_id = w.request_id
            AND a.user_id = w.author_user_id
            AND (a.prayed_at AT TIME ZONE COALESCE(ou.timezone, 'UTC'))::date
              = (w.created_at AT TIME ZONE COALESCE(ou.timezone, 'UTC'))::date
        )
    `);

    // Master notifications switch (Settings → Notifications). Default
    // true so existing users keep their notifications; sendPushToUser
    // suppresses every push when false.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT true`);
    // Master switch for non-essential ("bulk") email — newsletters,
    // announcements, weekly digest, prayer-invite prompts. The email-channel
    // sibling of push_enabled. Default true; the email footer's Unsubscribe
    // link (and Settings → Emails) flips it false. Transactional mail is not
    // gated by this. See lib/email.ts for the send-side gate.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT true`);

    // App-open metrics (admin metrics page). One row per user per 15-min
    // window; the unique (user_id, bucket) index dedups rapid re-opens so
    // POST /api/app-open's onConflictDoNothing collapses them. This table
    // was added to the schema + the /admin/metrics query but its CREATE
    // was missing — so /admin/metrics 500'd ("app metrics not loading")
    // because the combined query referenced a non-existent table.
    await run(client, `
      CREATE TABLE IF NOT EXISTS app_opens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bucket INTEGER NOT NULL,
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_app_opens_user_bucket ON app_opens (user_id, bucket)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_app_opens_opened_at ON app_opens (opened_at)`);

    // ── Standard daily bell time → 09:30 ────────────────────────────────────
    // Default went from 07:00 → 09:30 by user direction (a more
    // pastoral hour). Idempotent: re-running this on a DB that's
    // already moved past 07:00 is a no-op since the WHERE clause
    // only catches rows still on the old default.
    // REMOVED (2026-07-21 data audit): this ran on every boot, so a user who
    // deliberately chose 07:00 in Settings was moved to 09:30 again on the next
    // deploy. The comment above called it idempotent — true only for the
    // IS NULL half. Its one-time work is long done; use runOnce if ever needed.

    // Platform-owned feeds: drop NOT NULL on creator_user_id so editorial
    // feeds (phoebe-climate) can exist without a human creator. The
    // existing FK + ON DELETE CASCADE behaviour for user-created feeds
    // is unchanged — only the nullability is relaxed.
    await run(client, `ALTER TABLE prayer_feeds ALTER COLUMN creator_user_id DROP NOT NULL`);

    // Switch prayer_feeds.creator_user_id from ON DELETE CASCADE → SET NULL.
    // A parish/feed is a SHARED object: if the creating priest deletes their
    // account, CASCADE would destroy the entire congregation's feed (and, via
    // their own cascades, every subscription/opportunity/season). SET NULL
    // orphans it instead — a staff admin can reassign a new priest. Idempotent:
    // only rewrites the FK when it isn't already SET NULL (confdeltype 'n').
    await run(client, `
      DO $$
      DECLARE cname text;
      BEGIN
        SELECT conname INTO cname
          FROM pg_constraint
         WHERE conrelid = 'prayer_feeds'::regclass
           AND contype  = 'f'
           AND confrelid = 'users'::regclass
           AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                 WHERE attrelid = 'prayer_feeds'::regclass
                                   AND attname = 'creator_user_id')]
           AND confdeltype <> 'n';
        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE prayer_feeds DROP CONSTRAINT %I', cname);
          ALTER TABLE prayer_feeds
            ADD CONSTRAINT prayer_feeds_creator_user_id_fkey
            FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // ── Column backfill ──────────────────────────────────────────────────
    // These columns exist in the Drizzle schema but were never given an
    // ALTER here, so a from-scratch deploy (new env / disaster recovery)
    // was missing them. Existing prod already has them (from an old
    // drizzle-kit push), so `ADD COLUMN IF NOT EXISTS` is a no-op there and
    // safe to re-run every boot. The prayer_feeds.visibility one MUST come
    // before the phoebe-climate seed below, whose INSERT names that column.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS offices_only BOOLEAN NOT NULL DEFAULT FALSE`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_sent_date TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS home_feed_id INTEGER`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS feed_first_home BOOLEAN NOT NULL DEFAULT TRUE`);
    await run(client, `ALTER TABLE gratitude_responses ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT FALSE`);
    await run(client, `ALTER TABLE prayer_feeds ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'`);
    await run(client, `ALTER TABLE prayer_feed_entries ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'custom'`);
    await run(client, `ALTER TABLE prayer_feed_recurring_entries ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'custom'`);
    // Persistent auth tokens: hard-expiry column (90-day TTL set at mint).
    await run(client, `ALTER TABLE persistent_auth_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);

    // Seed the phoebe-climate feed (platform-owned, creator_user_id NULL).
    // Idempotent — skips if the slug already exists. visibility=public
    // so it surfaces on the public /feed/phoebe-climate landing the
    // welcome chooser links to.
    await run(client, `
      INSERT INTO prayer_feeds (slug, title, timezone, state, visibility, creator_user_id)
      VALUES ('phoebe-climate', 'Phoebe Climate', 'America/New_York', 'live', 'public', NULL)
      ON CONFLICT DO NOTHING
    `);

    // Defensive: if a previous run seeded phoebe-climate with a human
    // creator, null it out now so the row is platform-owned everywhere.
    await run(client, `UPDATE prayer_feeds SET creator_user_id = NULL WHERE slug = 'phoebe-climate' AND creator_user_id IS NOT NULL`);

    // Defensive: an earlier seed that ran before the visibility column
    // existed (or before this seed set it) would leave phoebe-climate
    // on the schema default 'private', which 404s the public landing —
    // so force visibility back to public on every boot.
    await run(client, `UPDATE prayer_feeds SET visibility = 'public' WHERE slug = 'phoebe-climate'`);
    // Promote a never-launched draft to live, but DON'T touch a deliberate
    // 'paused' — that's the admin "Off" switch. Forcing state='live' on
    // every boot (as this once did) silently undid turning the feed off,
    // so it kept reappearing in slideshows after every deploy.
    await run(client, `UPDATE prayer_feeds SET state = 'live' WHERE slug = 'phoebe-climate' AND state = 'draft'`);

    // Seed the Virginia Theological Seminary feed — same platform-owned
    // shape as phoebe-climate above (creator_user_id NULL, public so the
    // /feed/vts landing page resolves). Following this feed is what
    // ENTITLES a user to VTS-only content: today that's the Dean's
    // Commentary reflection source, which is hidden from every picker
    // until you follow (see lib/entitlements.ts + useEntitlements on the
    // client). The feed row must therefore always exist, or the gate has
    // nothing to check and the content is unreachable — hence seeding it
    // here rather than expecting someone to create it in the admin UI.
    await run(client, `
      INSERT INTO prayer_feeds (slug, title, tagline, cover_emoji, timezone, state, visibility, creator_user_id)
      VALUES ('vts', 'Virginia Theological Seminary', 'The Dean''s Commentary, weekdays', '🦩', 'America/New_York', 'live', 'public', NULL)
      ON CONFLICT DO NOTHING
    `);
    // Same defensive re-assertions phoebe-climate needs: keep it
    // platform-owned and publicly resolvable, and promote a never-launched
    // draft — but never override a deliberate 'paused' (the admin Off switch).
    await run(client, `UPDATE prayer_feeds SET creator_user_id = NULL WHERE slug = 'vts' AND creator_user_id IS NOT NULL`);
    await run(client, `UPDATE prayer_feeds SET visibility = 'public' WHERE slug = 'vts'`);
    await run(client, `UPDATE prayer_feeds SET state = 'live' WHERE slug = 'vts' AND state = 'draft'`);

    // group_announcements gains optional event-shape columns so a single
    // announcement can be flagged as a prayer walk. Climate tab surfaces
    // every upcoming kind='prayer_walk' row across all groups.
    await run(client, `ALTER TABLE group_announcements ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'announcement'`);
    await run(client, `ALTER TABLE group_announcements ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ`);
    await run(client, `ALTER TABLE group_announcements ADD COLUMN IF NOT EXISTS location TEXT`);

    // Climate push opt-out: have runClimateDailySender honor users.bell_enabled
    // so a climate user can mute the 7am push from settings. Backfill
    // bell_enabled=true for everyone currently climate-enrolled — they signed
    // up expecting the push, so we don't want the new gate to silently mute
    // them on the next deploy.
    // REMOVED (2026-07-21 data audit): ran on every boot, so a climate-enrolled
    // user who muted the bell had it re-enabled on the next deploy — the exact
    // silent un-muting the comment above set out to avoid, just aimed at the
    // user's own choice instead. Use runOnce if this is ever needed again.

    // Phoebe Climate v2: feed-scoped community intercessions. A
    // shared_moment can now be attached to a prayer_feed instead of a
    // group; reconcileFeedPracticeMembers mints/removes
    // moment_user_tokens against feed subscriptions so the moment
    // surfaces on /api/moments + prayer-mode for every subscriber.
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS prayer_feed_id INTEGER REFERENCES prayer_feeds(id) ON DELETE SET NULL`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_shared_moments_prayer_feed ON shared_moments (prayer_feed_id)`);
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS learn_more_url TEXT`);
    // Auto-fetched title of the learn_more_url article — shown above the
    // "Learn more →" pill on the intercession slide.
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS learn_more_title TEXT`);
    // Scheduled time at which the "new intercession on your feed" push
    // fans out to subscribers — set to NOW()+15min on insert so the
    // editor has a grace window to fix typos / delete a mis-published
    // intercession before subscribers get pinged. The scanner in
    // bellSender.runFeedIntercessionPushSender picks up rows where this
    // is non-null and in the past, fires the push, then NULLs it.
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS notify_subscribers_at TIMESTAMP WITH TIME ZONE`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_shared_moments_notify_due ON shared_moments (notify_subscribers_at) WHERE notify_subscribers_at IS NOT NULL`);
    // The user who scheduled the delayed push above. Scanner passes
    // this through to sendNewFeedIntercessionPush as excludeUserId so
    // the publisher doesn't get pinged about their own intercession
    // 15 minutes later. No FK so a deleted user row doesn't cascade
    // damage onto the intercession — a null/dangling id just means
    // the scanner doesn't filter, which is the existing behavior.
    await run(client, `ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS published_by_user_id INTEGER`);

    // group_announcements gains feed scope: prayer walks + announcements
    // can now belong to a feed instead of a group. group_id becomes
    // nullable so the existing CASCADE-on-delete still makes sense for
    // group-scoped rows while feed-scoped rows just leave it null.
    await run(client, `ALTER TABLE group_announcements ALTER COLUMN group_id DROP NOT NULL`);
    await run(client, `ALTER TABLE group_announcements ADD COLUMN IF NOT EXISTS prayer_feed_id INTEGER REFERENCES prayer_feeds(id) ON DELETE CASCADE`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_group_announcements_prayer_feed ON group_announcements (prayer_feed_id)`);

    // ── Prayer-feed events ──────────────────────────────────────────────────
    // A feed manager can attach time-bound events (vigils, days of prayer,
    // webinars) to their feed; subscribers see them in-app. Lean, announce-
    // only model — no RSVP / calendar fan-out in v1. state = published |
    // cancelled (soft cancel). reminder_sent_at dedups the day-before push.
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_feed_events (
        id SERIAL PRIMARY KEY,
        feed_id INTEGER NOT NULL REFERENCES prayer_feeds(id) ON DELETE CASCADE,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ,
        location TEXT,
        join_url TEXT,
        state TEXT NOT NULL DEFAULT 'published',
        reminder_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_feed_events_feed_starts ON prayer_feed_events (feed_id, starts_at)`);

    // ── Group daily reflections (beta) ───────────────────────────────────
    // A community pins a daily-reflection source (CAC or Forward Day by
    // Day), members tap out to read it, then write a short reflection
    // shared with the community. Comments are open to any group member.
    // Idempotent DDL — runs on every boot.
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_reflection_sources (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        set_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_reflections (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reflection_date DATE NOT NULL,
        source TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS group_reflections_unique_per_day
      ON group_reflections (group_id, user_id, reflection_date, source)
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS group_reflections_by_group_date
      ON group_reflections (group_id, reflection_date)
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_reflection_comments (
        id SERIAL PRIMARY KEY,
        reflection_id INTEGER NOT NULL REFERENCES group_reflections(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS group_reflection_comments_by_reflection
      ON group_reflection_comments (reflection_id, created_at)
    `);

    // ── Sunday service reflections (beta) ────────────────────────────────
    // Per-group flag + last-notified stamp. Reuses the existing
    // group_reflections + group_reflection_comments tables — Sunday
    // reflections are stored with source='sunday' and
    // reflection_date = the Sunday of the service week, so a member's
    // upsert during the week edits in place.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS sunday_reflections_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS sunday_reflection_notified_at TIMESTAMPTZ`);

    // ── Contemplation community template (beta) ──────────────────────────
    // focus="contemplation" swaps the community Home to a shared contemplation
    // goal + the CAC daily meditation; null = a standard office community.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS focus TEXT`);
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS contemplation_goal_minutes INTEGER`);
    // Owner: "a setting in groups to turn on and off prayer list" — see
    // schema comment in groups.ts for the public-group hard-gate.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS prayer_requests_enabled BOOLEAN NOT NULL DEFAULT false`);
    // Owner: "don't have list in community directly turned on inherently."
    // The ADD COLUMN above is a no-op wherever the column already exists (it
    // was originally created DEFAULT true), so flip the default explicitly.
    // This only affects rows inserted from here on — every existing group
    // keeps the value it already has, which is why there's no UPDATE.
    await run(client, `ALTER TABLE groups ALTER COLUMN prayer_requests_enabled SET DEFAULT false`);

    // ── Beta Messages (beta-only) ────────────────────────────────────────
    // Unlimited 1:1 messaging between beta users (Letters-style UI, no
    // cadence limit). One conversation per pair (enforced in the route
    // layer); two member rows carry each user's read cursor.
    await run(client, `
      CREATE TABLE IF NOT EXISTS beta_conversations (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS beta_conversation_members (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES beta_conversations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_read_at TIMESTAMPTZ,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS beta_conv_members_unique
      ON beta_conversation_members (conversation_id, user_id)
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS beta_conv_members_by_user
      ON beta_conversation_members (user_id)
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS beta_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES beta_conversations(id) ON DELETE CASCADE,
        sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS beta_messages_by_conversation
      ON beta_messages (conversation_id, created_at)
    `);

    // ── Rule-of-life requests (BETA) — a member asks their community's clergy
    //    for help building a daily prayer routine. The app carries the ask; the
    //    discernment happens with a real person.
    await run(client, `
      CREATE TABLE IF NOT EXISTS rule_of_life_requests (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'requested',
        responded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        responded_at TIMESTAMPTZ
      )
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS rule_of_life_requests_by_group
      ON rule_of_life_requests (group_id, status)
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS rule_of_life_requests_by_user
      ON rule_of_life_requests (user_id)
    `);

    // rhythm_parties — "keeping a rhythm together": 2–3 people sharing one
    // 30-day commitment. The invite token CARRIES the rule (preset_id), so
    // accepting applies the same rhythm and aligns everyone to one Day-N count.
    await run(client, `
      CREATE TABLE IF NOT EXISTS rhythm_parties (
        id SERIAL PRIMARY KEY,
        created_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        preset_id TEXT NOT NULL,
        days INTEGER NOT NULL DEFAULT 30,
        start_ymd TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS rhythm_parties_token ON rhythm_parties (token)`);
    await run(client, `CREATE INDEX IF NOT EXISTS rhythm_parties_by_creator ON rhythm_parties (created_by_id)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS rhythm_party_members (
        id SERIAL PRIMARY KEY,
        party_id INTEGER NOT NULL REFERENCES rhythm_parties(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS rhythm_party_members_once ON rhythm_party_members (party_id, user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS rhythm_party_members_by_user ON rhythm_party_members (user_id)`);

    // Group chat was removed (privacy simplification); the group_messages /
    // group_message_reads tables are dropped at the end of this migration.

    // ── Prescribed routines — a community admin / clergy designs a daily
    //    rhythm for someone and shares it as a token link; the recipient opens
    //    /routine/:token and (on accept) has it applied to their account.
    //    group_id is NULLABLE: null = an app-wide PRESET rule minted by a
    //    super admin (no community attached), joinable by anyone with the link.
    await run(client, `
      CREATE TABLE IF NOT EXISTS prescribed_routines (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT,
        spec JSONB NOT NULL,
        accept_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Envs created before presets: relax the original NOT NULL.
    await run(client, `
      ALTER TABLE prescribed_routines ALTER COLUMN group_id DROP NOT NULL
    `);
    // Community RULE OF LIFE — the prescribed_routines row that carries the
    // daily rhythm this community keeps together (members adopt it in one
    // tap; "praying WITH each other"). Placed here (not in the groups block)
    // because the FK needs prescribed_routines to exist first.
    await run(client, `
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS rule_routine_id
      INTEGER REFERENCES prescribed_routines(id) ON DELETE SET NULL
    `);
    // Parish standing rule of life — the always-on daily rhythm a priest sets
    // for the whole congregation. Same FK-after-prescribed_routines reasoning.
    await run(client, `
      ALTER TABLE prayer_feeds ADD COLUMN IF NOT EXISTS rule_routine_id
      INTEGER REFERENCES prescribed_routines(id) ON DELETE SET NULL
    `);
    // Who has taken up a parish's standing rhythm — one row per (rule, user).
    // The unique index makes /parish/rule/adopt idempotent (no count inflation)
    // and lets each member's card know if they've already adopted. FK needs
    // prescribed_routines, so it lives here (after that table is created).
    await run(client, `
      CREATE TABLE IF NOT EXISTS parish_rule_adoptions (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER NOT NULL REFERENCES prescribed_routines(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_parish_rule_adoption_pair ON parish_rule_adoptions (rule_id, user_id)`);
    await run(client, `
      CREATE INDEX IF NOT EXISTS prescribed_routines_by_group
      ON prescribed_routines (group_id)
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS prescribed_routines_by_creator
      ON prescribed_routines (created_by_user_id)
    `);

    // ── Group weekly plan (NOT YET PUBLIC — client is behind a flag) — a
    //    church programs a checklist of practices for the week between Sundays
    //    (read a CAC meditation, Co-Breathe once, 10 min of silence, a
    //    podcast); members tick items done. week_start = that week's Sunday.
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_weekly_items (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        week_start DATE NOT NULL,
        kind TEXT NOT NULL DEFAULT 'custom',
        title TEXT NOT NULL,
        detail TEXT,
        target INTEGER NOT NULL DEFAULT 1,
        sort INTEGER NOT NULL DEFAULT 0,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS group_weekly_items_by_group_week
      ON group_weekly_items (group_id, week_start)
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_weekly_completions (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES group_weekly_items(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS group_weekly_completions_item_user
      ON group_weekly_completions (item_id, user_id)
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS group_weekly_completions_by_user
      ON group_weekly_completions (user_id)
    `);
    // Leader-authored content payload (pdf / deck / episode kinds).
    await run(client, `
      ALTER TABLE group_weekly_items ADD COLUMN IF NOT EXISTS payload JSONB
    `);
    // Uploaded weekly-plan PDFs (raw bytes; pilot-scale, pruned by retention).
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_weekly_pdfs (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        page_count INTEGER,
        data BYTEA NOT NULL,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS group_weekly_pdfs_by_group
      ON group_weekly_pdfs (group_id)
    `);

    // ── Group "ways to get involved" opportunities — rebuilt from the
    //    deleted Phoebe Parish system's parish_opportunities /
    //    parish_opportunity_interests tables (094181c0), scoped to a group
    //    instead of a parish feed. An admin publishes opportunities (worship
    //    roles, service ministries, anything); members tap "I'm interested".
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_opportunities (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'other',
        schedule_note TEXT,
        contact TEXT,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_group_opportunities_group ON group_opportunities (group_id)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_opportunity_interests (
        id SERIAL PRIMARY KEY,
        opportunity_id INTEGER NOT NULL REFERENCES group_opportunities(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT,
        email TEXT,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_group_opp_interest_pair ON group_opportunity_interests (opportunity_id, user_id)`);

    // ── Creator seasons — a creator turns the practice their content inspired
    //    into a bounded 2–4 week season: one-tap join link applies the practice
    //    (prescribed-routines spec), a cohort-shared Day-N clock, daily
    //    check-ins the group witnesses, and short async creator notes.
    await run(client, `
      CREATE TABLE IF NOT EXISTS creator_seasons (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL,
        title TEXT NOT NULL,
        creator_name TEXT NOT NULL,
        description TEXT,
        spec JSONB NOT NULL,
        duration_days INTEGER NOT NULL DEFAULT 21,
        start_ymd TEXT NOT NULL,
        created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS creator_seasons_token ON creator_seasons (token)
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS creator_seasons_by_creator ON creator_seasons (created_by_user_id)
    `);
    // COMMUNITY seasons — a group's leaders run a bounded season for the whole
    // community; NULL keeps the original creator-audience shape.
    await run(client, `
      ALTER TABLE creator_seasons ADD COLUMN IF NOT EXISTS group_id
      INTEGER REFERENCES groups(id) ON DELETE CASCADE
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS creator_seasons_by_group ON creator_seasons (group_id)
    `);
    // Parish seasons — a priest runs a bounded season for the whole
    // congregation. NULL keeps the creator/community shape.
    await run(client, `
      ALTER TABLE creator_seasons ADD COLUMN IF NOT EXISTS parish_feed_id
      INTEGER REFERENCES prayer_feeds(id) ON DELETE CASCADE
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS creator_seasons_by_parish ON creator_seasons (parish_feed_id)
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS creator_season_members (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES creator_seasons(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS creator_season_members_once
      ON creator_season_members (season_id, user_id)
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS creator_season_members_by_user
      ON creator_season_members (user_id)
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS creator_season_notes (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES creator_seasons(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS creator_season_notes_by_season
      ON creator_season_notes (season_id)
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS creator_season_checkins (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES creator_seasons(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ymd TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS creator_season_checkins_once
      ON creator_season_checkins (season_id, user_id, ymd)
    `);
    await run(client, `
      CREATE INDEX IF NOT EXISTS creator_season_checkins_by_season_day
      ON creator_season_checkins (season_id, ymd)
    `);

    // ── Home-load perf indexes (prayer-streak hot path) ──────────────────
    // Amen "prayed with me today" scan is bounded to the last 48h per request.
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_request_amens_request_prayed ON prayer_request_amens (request_id, prayed_at)`);
    // Check-in streak scans filter moment_posts by user_token + is_checkin.
    await run(client, `CREATE INDEX IF NOT EXISTS idx_moment_posts_token_checkin ON moment_posts (user_token, is_checkin)`);
    // Resolve a user's tokens by LOWER(email) via a functional index instead of
    // a full-table scan of moment_user_tokens.
    await run(client, `CREATE INDEX IF NOT EXISTS idx_moment_user_tokens_lower_email ON moment_user_tokens (LOWER(email))`);

    // ── Podcast engagement — listening history + recommendations ─────────
    // Episode snapshots (external feeds, no local episode table) so we
    // can render history + the community-recommendations feed from the DB.
    await run(client, `
      CREATE TABLE IF NOT EXISTS podcast_listens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        show_slug TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        episode_title TEXT,
        episode_audio_url TEXT,
        episode_image_url TEXT,
        duration_seconds INTEGER,
        published_at TEXT,
        show_title TEXT,
        show_artwork TEXT,
        first_listened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_listened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS podcast_listens_unique ON podcast_listens (user_id, show_slug, episode_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS podcast_listens_by_user ON podcast_listens (user_id, last_listened_at)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS podcast_recommendations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        show_slug TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        episode_title TEXT,
        episode_audio_url TEXT,
        episode_image_url TEXT,
        duration_seconds INTEGER,
        published_at TEXT,
        show_title TEXT,
        show_artwork TEXT,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS podcast_recommendations_unique ON podcast_recommendations (user_id, show_slug, episode_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS podcast_recommendations_by_episode ON podcast_recommendations (show_slug, episode_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS podcast_recommendations_by_recent ON podcast_recommendations (created_at)`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS podcast_listen_list (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        show_slug       TEXT NOT NULL,
        episode_id      TEXT NOT NULL,
        episode_title   TEXT,
        episode_audio_url TEXT,
        episode_image_url TEXT,
        duration_seconds INTEGER,
        published_at    TEXT,
        show_title      TEXT,
        show_artwork    TEXT,
        position        INTEGER NOT NULL DEFAULT 0,
        added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS podcast_listen_list_unique ON podcast_listen_list (user_id, show_slug, episode_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS podcast_listen_list_by_user ON podcast_listen_list (user_id, position)`);

    // Backfill: every existing climate-enrolled user gets a subscription
    // to phoebe-climate so they pick up feed-scoped intercessions on
    // their dashboard and slideshow without a manual opt-in step.
    await run(client, `
      INSERT INTO prayer_feed_subscriptions (feed_id, user_id)
      SELECT pf.id, u.id
      FROM users u
      CROSS JOIN prayer_feeds pf
      WHERE u.climate_enrolled = true
        AND pf.slug = 'phoebe-climate'
      ON CONFLICT DO NOTHING
    `);
    await run(client, `
      UPDATE prayer_feeds
      SET subscriber_count = (
        SELECT COUNT(*)::int FROM prayer_feed_subscriptions s
        WHERE s.feed_id = prayer_feeds.id
      )
      WHERE slug = 'phoebe-climate'
    `);

    // Communities discovery + admin-approved join requests.
    //   • groups.is_public — public communities show in the browse picker.
    //   • group_join_requests — pending list per community; admin
    //     accepts → row decision='accepted' + group_members insert.
    // Default flipped to TRUE: every new community is browseable from
    // /communities/browse out of the gate. The earlier ADD COLUMN that
    // ran with default false stays compatible — we ALTER the default
    // for new rows AND backfill any legacy rows that were created
    // before the flip.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE`);
    await run(client, `ALTER TABLE groups ALTER COLUMN is_public SET DEFAULT TRUE`);
    // REMOVED (2026-07-21 data audit): ran on every boot. Inert today only
    // because nothing sets is_public = false — but it was a landmine: the first
    // deploy after a "make this community private" control shipped would have
    // silently flipped every private community public. The defaults above cover
    // new and legacy rows; use runOnce if a real backfill is ever needed.
    // Last time an admin sent the "How can I pray for you?" community
    // prompt push. Once-per-7-days rate limit enforced server-side. Null
    // = never sent — that's the eligible default.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS last_prayer_invite_at TIMESTAMPTZ`);
    // The prompt the admin chose for the most recent "Ask your
    // community" send (preset or custom). The share-prayer page reads
    // it so the slide asks the same question the push / email did.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS prayer_invite_prompt TEXT`);
    // PUBLIC no-login version: pilot groups — their members are the only users
    // exempt from the light shape once the guest flag flips.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_pilot_group BOOLEAN NOT NULL DEFAULT false`);
    // Free-text location (city/state) for the public directory (churches,
    // parishes) — searchable/browsable alongside name. No geocoding: plain
    // ILIKE matching, same pattern as the name search already in use.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS city TEXT`);
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS state TEXT`);
    // Per-user daily dedup for the "How can we pray for you?" email.
    // YYYY-MM-DD UTC. NULL = never received.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_prayer_invite_email_date TEXT`);
    // Parish-scoped "pastoral concern" prayer requests. When set, the
    // request is visible only to the requester + parish admin(s); never
    // surfaces in garden / slideshow / other parishioners' lists.
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS parish_feed_id INTEGER`);
    // direct_only — a request DIRECTED privately to specific fellows (the tagged
    // users): only the owner + tagged recipients can see it; never enters the
    // garden / slideshow / other connections' surfaces (mirrors parish_feed_id).
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS direct_only BOOLEAN NOT NULL DEFAULT false`);
    await run(
      client,
      `DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM information_schema.table_constraints
           WHERE constraint_name = 'prayer_requests_parish_feed_fk'
         ) THEN
           ALTER TABLE prayer_requests
             ADD CONSTRAINT prayer_requests_parish_feed_fk
             FOREIGN KEY (parish_feed_id) REFERENCES prayer_feeds(id)
             ON DELETE CASCADE;
         END IF;
       END $$;`,
    );
    await run(client, `
      CREATE TABLE IF NOT EXISTS group_join_requests (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        decided_at TIMESTAMPTZ,
        decision TEXT,
        decided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE (group_id, user_id)
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_group_join_requests_pending ON group_join_requests (group_id) WHERE decision IS NULL`);

    // BCP Daily Office texts (confession, absolution, opening sentences,
    // canticles, Pascha Nostrum, etc.) live in bcp_texts. The seed is
    // upsert-safe — runs on every boot so a fresh DB or a missed seed
    // step doesn't leave the office showing "[key — see BCP]" placeholders.
    // morning_prayer_cache is wiped here too so any cached row that was
    // assembled BEFORE the seed completed re-assembles with real text.
    try {
      await run(client, `TRUNCATE TABLE morning_prayer_cache`);
      const { seedBcpTexts } = await import("../seeds/bcpTexts");
      await seedBcpTexts();
      logger.info("BCP texts seeded + morning_prayer_cache cleared");
    } catch (err) {
      logger.error({ err }, "BCP text seed failed (non-fatal — server still starts)");
    }

    // ── Diocese of New York — 2026 Calendar of Intercession ──────────────────
    // A platform-owned, public Prayer Feed: one parish/ministry/cause to pray
    // for each calendar day, from the diocese's published intercession cycle.
    // Idempotent — upserts the feed + 365 daily entries on every boot.
    try {
      const { seedDioceseNyIntercession } = await import("../seeds/dioceseNyIntercession");
      const n = await seedDioceseNyIntercession();
      logger.info(`Diocese of NY intercession feed seeded (${n} entries)`);
    } catch (err) {
      logger.error({ err }, "Diocese of NY intercession seed failed (non-fatal — server still starts)");
    }

    // ── Anglican Cycle of Prayer — worldwide Communion intercession ──────────
    // A platform-owned, public Prayer Feed: one Communion diocese/province to
    // pray for each calendar day, from the Anglican Communion's own freely-
    // shareable Cycle of Prayer. Idempotent — upserts the feed + 365 daily
    // entries on every boot. Sibling to the Diocese of NY feed.
    try {
      const { seedAnglicanCycleOfPrayer } = await import("../seeds/anglicanCycleOfPrayer");
      const n = await seedAnglicanCycleOfPrayer();
      logger.info(`Anglican Cycle of Prayer feed seeded (${n} entries)`);
    } catch (err) {
      logger.error({ err }, "Anglican Cycle of Prayer seed failed (non-fatal — server still starts)");
    }

    // ── Newsletters ────────────────────────────────────────────────────────
    // Admin-composed newsletter emails. One row per send for audit history.
    // recipient_scope is "all" (every user) or "groups" (members of the
    // group ids in group_ids).
    await run(client, `
      CREATE TABLE IF NOT EXISTS newsletters (
        id SERIAL PRIMARY KEY,
        subject TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        recipient_scope TEXT NOT NULL,
        group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        recipient_count INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        sent_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sent_by_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Per-recipient failure audit (jsonb array of emails Gmail wouldn't
    // accept on the background fan-out). Added later — wrap in IF NOT
    // EXISTS so the column appears on existing deployments too.
    await run(client, `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS failed_recipients JSONB NOT NULL DEFAULT '[]'::jsonb`);
    // sent_by_user_id was created as ON DELETE CASCADE, which wipes
    // the entire audit trail if the admin who composed the send is
    // ever deleted. An audit row should outlive the user. Drop the
    // constraint, make the column nullable, re-add it as ON DELETE
    // SET NULL.
    await run(client, `ALTER TABLE newsletters DROP CONSTRAINT IF EXISTS newsletters_sent_by_user_id_fkey`);
    await run(client, `ALTER TABLE newsletters ALTER COLUMN sent_by_user_id DROP NOT NULL`);
    await run(client, `ALTER TABLE newsletters ADD CONSTRAINT newsletters_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL`);

    // ── correspondence_members.invitation_sent_at ─────────────────────────
    // Per-member stamp of "we've emailed this pending recipient their
    // invitation." Replaces the global isFirstLetter gate that meant
    // anyone added to a small_group correspondence after letter 1 was
    // never sent an invitation. The route now invites a pending member
    // the first letter they appear on, then stamps this column so
    // subsequent letters don't re-spam. Backfill timestamps for any
    // existing joined members so we don't accidentally re-invite them
    // on the next letter; pending members keep NULL so they get their
    // overdue invitation on the next letter.
    await run(client, `ALTER TABLE correspondence_members ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ`);
    await run(client, `UPDATE correspondence_members SET invitation_sent_at = joined_at WHERE invitation_sent_at IS NULL AND joined_at IS NOT NULL`);

    // ── Meetup RSVPs ──────────────────────────────────────────────────────
    // Going / Maybe RSVPs on gathering meetups. Mirrors action_rsvps:
    // one row per (meetup, user); clearing an RSVP deletes the row;
    // status is "going" | "maybe". Unique index enforces the
    // one-row-per-user invariant.
    await run(client, `
      CREATE TABLE IF NOT EXISTS meetup_rsvps (
        id SERIAL PRIMARY KEY,
        meetup_id INTEGER NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_meetup_rsvp_meetup_user ON meetup_rsvps (meetup_id, user_id)`);

    // ── Ritual <-> Groups join (multi-community gatherings) ──────────────
    // A gathering can span more than one community: the primary host
    // stays on rituals.group_id; this table holds additional invited
    // communities. Members of ANY linked community see the gathering
    // on their dashboard, can RSVP, and are union'd into the
    // calendar-invite attendee list. Mirrors how intercessions span
    // multiple communities.
    await run(client, `
      CREATE TABLE IF NOT EXISTS ritual_groups (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_ritual_groups_ritual_group ON ritual_groups (ritual_id, group_id)`);

    // ── Repair NULL group_members.role ────────────────────────────────────
    // The schema defines role as NOT NULL DEFAULT 'member', but some rows
    // were inserted before that default existed and left role NULL. SQL
    // member-count queries use `role <> 'hidden_admin'`, which silently
    // drops NULL-role rows (NULL <> 'x' is NULL, not true) — so those
    // members vanished from counts and from newsletter recipient lists.
    // Backfill the intended default. Idempotent.
    await run(client, `UPDATE group_members SET role = 'member' WHERE role IS NULL`);

    // ── Followers vs. members tier (2026-07-24) ─────────────────────────────
    // "member" used to be the only non-admin role — functionally already a
    // "follower" (anonymous, count-only; see GET /groups/:slug). Introducing
    // a genuinely smaller, admin-curated "member" tier (visible to fellow
    // non-admins on the roster) means the OLD "member" rows need to become
    // "follower" — a ONE-TIME reclassification of existing data, not a
    // policy to keep re-imposing (an admin who later promotes someone to
    // "member" must have that stick across every future deploy). Uses
    // runOnce, not a bare UPDATE, for exactly the reason documented on
    // runOnce above.
    await runOnce(
      client,
      "group_members_member_to_follower_2026_07_24",
      `UPDATE group_members SET role = 'follower' WHERE role = 'member'`,
    );
    // Existing databases created the column with the old DEFAULT 'member' —
    // bring the live default in line with the Drizzle schema. Genuinely
    // idempotent (ALTER ... SET DEFAULT), so a plain `run` is correct here.
    await run(client, `ALTER TABLE group_members ALTER COLUMN role SET DEFAULT 'follower'`);

    // ── Shareable prayer requests + Fellows (revived) ─────────────────────
    // Three pieces work together:
    //   1. prayer_requests.share_token — opaque slug minted at insert
    //      time. Hands the owner a no-auth deep link (/p/:token) they
    //      can pass to anyone. We backfill existing rows so every
    //      request gets a token without needing a write from the
    //      owner. UNIQUE index for fast lookup by token.
    //   2. anonymous_amens — rows recorded when a visitor without an
    //      account taps Amen on /p/:token. Keyed by client-generated
    //      session_id so we can later "claim" them onto a real account
    //      at signup. claimed_by_user_id / claimed_at are stamped at
    //      claim time so re-runs of the linker are idempotent.
    //   3. fellows — a directional (user_id → fellow_user_id) social
    //      connection that lives OUTSIDE community membership. The
    //      table already exists in the schema (marked historical); we
    //      keep CREATE TABLE IF NOT EXISTS so a fresh install gets it
    //      without depending on the prior historical migration block
    //      having run. Insert pattern is "two rows per pair" (A→B and
    //      B→A) so a single-side query returns my fellows.
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS share_token TEXT`);
    // Backfill — use gen_random_uuid() rendered as hex so existing
    // rows pick up a token without us needing to round-trip each one
    // through application code. UPDATE …WHERE share_token IS NULL keeps
    // this idempotent on re-deploys.
    await run(client, `
      UPDATE prayer_requests
      SET share_token = REPLACE(gen_random_uuid()::text, '-', '')
      WHERE share_token IS NULL
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS idx_prayer_requests_share_token ON prayer_requests (share_token) WHERE share_token IS NOT NULL`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS anonymous_amens (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        visitor_name TEXT,
        claimed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        claimed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_anonymous_amens_session ON anonymous_amens (session_id) WHERE claimed_at IS NULL`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_anonymous_amen ON anonymous_amens (request_id, session_id)`);

    // fellows already created above as a historical table — this is
    // belt-and-suspenders for fresh installs that hit this block first.
    await run(client, `
      CREATE TABLE IF NOT EXISTS fellows (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        fellow_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, fellow_user_id)
      )
    `);
    // Source column — distinguishes share-link auto-creation from any
    // future manual-add flow, plus drives future copy ("you became
    // Fellows because Maria amened your prayer request"). Idempotent
    // add so old environments don't error.
    await run(client, `ALTER TABLE fellows ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'shared_prayer'`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_fellows_user_id ON fellows (user_id)`);
    // Fellowship is symmetric and queried both directions: getFellowUserIds
    // (lib/garden.ts) filters `WHERE user_id = X OR fellow_user_id = X`, hit from
    // many authenticated reads (prayer list, feed, moments prayed-with) plus push
    // fan-out. Without an index on the REVERSE column, the OR's second branch
    // falls back to a full seq scan of fellows on every garden cache miss; this
    // lets Postgres BitmapOr the two single-column indexes instead.
    await run(client, `CREATE INDEX IF NOT EXISTS idx_fellows_fellow_user_id ON fellows (fellow_user_id)`);

    // ── beta_users.seen_welcome ────────────────────────────────────────────
    // The schema (lib/db/src/schema/groups.ts) declares seen_welcome on
    // beta_users with NOT NULL DEFAULT false. Production didn't have the
    // column added before drizzle started generating INSERTs that
    // reference it — the Pilot Users admin tool 500'd with "42703
    // undefined_column" until we ran a manual ALTER. Idempotent
    // IF NOT EXISTS so re-deploys are safe.
    await run(client, `ALTER TABLE beta_users ADD COLUMN IF NOT EXISTS seen_welcome BOOLEAN NOT NULL DEFAULT false`);

    // ── Prayer-request tags ────────────────────────────────────────────────
    // Owner can name specific Phoebe users in a prayer request ("praying
    // for my friend Matthew"). Tagged users:
    //   • can see the request regardless of garden / fellow / community
    //     membership (the GET /api/prayer-requests list joins tags in);
    //   • receive a push on first amen + on any word of comfort;
    //   • can remove themselves (sets removed_at; row stays for audit).
    // UNIQUE (request_id, tagged_user_id) — re-tagging flips removed_at
    // back to NULL on the existing row instead of inserting a dup.
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_request_tags (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
        tagged_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        removed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (request_id, tagged_user_id)
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_request_tags_user ON prayer_request_tags (tagged_user_id) WHERE removed_at IS NULL`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_request_tags_request ON prayer_request_tags (request_id) WHERE removed_at IS NULL`);

    // BCP Daily Office — flip the Confession of Sin default from
    // opt-in to opt-out. The original column (added at line 1408
    // above) defaulted to FALSE, so the office began with the
    // Opening Sentence and the penitential opening was a hidden
    // preference. We now ship Confession + Absolution as part of
    // the default office, in line with how most parishes pray it,
    // and the Settings toggle lets a user skip it.
    //
    // Two steps, both idempotent / safe to re-run:
    //   1. Change the column default so a fresh signup gets TRUE.
    //   2. Flip every existing FALSE row to TRUE. The vast majority
    //      of those rows are users who never opened the Settings
    //      toggle (it was hidden in a section most never browse),
    //      so treating them as "wants the default" matches intent.
    //      The handful who explicitly turned it OFF can flip it
    //      back from Settings — a one-tap recovery, and a much
    //      smaller cohort than the silently-defaulting majority
    //      we're trying to serve.
    await run(client, `ALTER TABLE users ALTER COLUMN bcp_show_confession SET DEFAULT TRUE`);
    // The backfill that used to sit here (UPDATE … SET TRUE WHERE FALSE) has
    // been REMOVED. migrate() runs on every boot, so it wasn't a one-time
    // backfill — it re-imposed the default on every deploy, switching the
    // Confession back on for anyone who had deliberately turned it off in
    // Settings. Its work completed on the first deploy years of boots ago; the
    // default above is what new rows need. (2026-07-21 data audit. If a
    // backfill like this is ever needed again, use runOnce.)

    // Default prayer level — Settings picker decides which depth the
    // home-screen office card's CTA jumps to. Values: "devotion" (BCP
    // short form, the established default), "office" (full Morning/
    // Evening Prayer), or "intercessions" (the community prayer-mode
    // slideshow). Existing users inherit "devotion" via the column
    // default so behavior is unchanged until they opt into a different
    // level.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS default_prayer_level TEXT NOT NULL DEFAULT 'devotion'`);

    // Re-introduce the prayer chooser as the default "Begin prayer"
    // destination. The button used to drop straight into a single
    // depth (the column's 'devotion' default); product direction
    // reverted to showing the options screen, with an explicit
    // per-depth default as an opt-in shortcut. The new sentinel value
    // 'ask' means "show me the chooser."
    //
    // One-time data move, guarded by the column's own DEFAULT so it
    // runs exactly once: while the default is still the old 'devotion',
    // flip everyone sitting on that silent default over to 'ask' (so
    // the chooser comes back for them), then advance the column default
    // to 'ask'. Users who explicitly picked 'office' or 'intercessions'
    // keep their choice — only the historical silent default is moved.
    // After this runs, column_default is 'ask' and the guard is false
    // forever, so a user who later re-selects 'devotion' is never
    // clobbered on the next boot.
    await run(client, `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users'
            AND column_name = 'default_prayer_level'
            AND column_default LIKE '%devotion%'
        ) THEN
          UPDATE users SET default_prayer_level = 'ask' WHERE default_prayer_level = 'devotion';
          ALTER TABLE users ALTER COLUMN default_prayer_level SET DEFAULT 'ask';
        END IF;
      END $$;
    `);

    // Scheduler heartbeat / audit log — one row per scheduler tick per
    // sender so we can answer "did the bell sender actually run this
    // morning?" from the DB without relying on ephemeral Railway logs.
    //
    // Insert at tick start (status = 'running'), update at the end
    // with completed_at + duration_ms + status ('completed' or
    // 'failed'). On failure we ALSO push to Sentry — this table is
    // the long-term audit trail, Sentry is the realtime alert.
    //
    // Tail with: SELECT sender_name, started_at, duration_ms, status
    // FROM scheduler_runs ORDER BY started_at DESC LIMIT 50;
    //
    // The retention story is "trim manually if it grows past
    // ~1M rows" — at 15 sender invocations every 15 min that's
    // ~1.4k rows/day, ~500k rows/year. Fine for years before
    // pruning matters.
    await run(client, `
      CREATE TABLE IF NOT EXISTS scheduler_runs (
        id              SERIAL PRIMARY KEY,
        sender_name     TEXT        NOT NULL,
        started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at    TIMESTAMPTZ,
        duration_ms     INTEGER,
        status          TEXT        NOT NULL DEFAULT 'running',
        error_message   TEXT
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_scheduler_runs_name_started ON scheduler_runs (sender_name, started_at DESC)`);

    // ── Hot-path foreign-key indexes (DB audit, finding #1) ──────────────
    // These junction / owner columns are scanned on nearly every
    // authenticated request (dashboard load, prayer-list, group detail,
    // correspondence list) but previously had no index — only the
    // invite_token / share_token uniques were covered. At current scale
    // these are cheap seq scans on small tables; by 10-50k DAU they'd be
    // the dominant query cost. Plain CREATE INDEX (not CONCURRENTLY)
    // because migrate runs at boot before the server listens, and the
    // tables are still small enough that the brief lock is invisible —
    // revisit with CONCURRENTLY + an out-of-band migration if any table
    // grows past a few hundred thousand rows. All IF NOT EXISTS, so this
    // block is idempotent like the rest of migrate().
    await run(client, `CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members (group_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members (user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_requests_owner_id ON prayer_requests (owner_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_words_request_id ON prayer_words (request_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_request_amens_request_id ON prayer_request_amens (request_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_correspondence_members_corr_id ON correspondence_members (correspondence_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_correspondence_members_user_id ON correspondence_members (user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_correspondence_members_email ON correspondence_members (email)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_letters_correspondence_id ON letters (correspondence_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_moment_user_tokens_moment_id ON moment_user_tokens (moment_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_moment_user_tokens_email ON moment_user_tokens (email)`);
    // moment_id lookups are already covered by the UNIQUE (moment_id,
    // group_id) constraint's index (moment_id is its leading column);
    // we only need the standalone group_id index for "what practices
    // is this group linked to" reverse lookups.
    await run(client, `CREATE INDEX IF NOT EXISTS idx_moment_groups_group_id ON moment_groups (group_id)`);

    // ── Rule of Life sessions ─────────────────────────────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS rule_of_life_sessions (
        id                    SERIAL PRIMARY KEY,
        created_by_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_name          TEXT,
        mode                  TEXT NOT NULL DEFAULT 'self',
        locale                TEXT NOT NULL DEFAULT 'en',
        answers               JSONB NOT NULL DEFAULT '{}',
        narrative             TEXT,
        plain_summary         TEXT,
        settings              JSONB,
        connection_focus      TEXT,
        anchor                TEXT,
        applied_at            TIMESTAMPTZ,
        delivered_to          TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_rule_of_life_user ON rule_of_life_sessions (created_by_user_id)`);

    // Gatherings scheduler removed entirely (owner: "we don't want RSVP
    // data") — scheduled_gatherings, gathering_members (invite/RSVP status),
    // and availability_patterns are dropped at the end of this migration.

    // ── Forward Day by Day audio marks ────────────────────────────────────────
    // Per-episode skip points (scripture start + donation-appeal start) so
    // Reflect & Sit can skip the FDD intro/outro. Precomputed by the worker.
    await run(client, `
      CREATE TABLE IF NOT EXISTS fdd_audio_marks (
        id                  SERIAL PRIMARY KEY,
        episode_date        TEXT NOT NULL UNIQUE,
        episode_guid        TEXT,
        audio_url           TEXT,
        status              TEXT NOT NULL DEFAULT 'pending',
        scripture_start_sec INTEGER,
        appeal_start_sec    INTEGER,
        duration_seconds    INTEGER,
        detector            TEXT,
        error               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── user_wol — persisted Way of Love selections ──────────────────────
    // One row per user. `selections` is a JSONB map of practiceId →
    // { optionIds: string[], custom: string } so the daily-practice page
    // can show + edit what each person committed to without requiring a
    // new rule-of-life session.
    await run(client, `
      CREATE TABLE IF NOT EXISTS user_wol (
        user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        selections JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── "Places I've been prayed for" map ───────────────────────────────────
    // Coarse (~1 mile) location attached to an amen, set only when the pray-er
    // opted in to sharing location and the OS granted permission. NULL = the
    // (default) opted-out case. Powers the personal prayed-for map.
    await run(client, `ALTER TABLE prayer_request_amens ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await run(client, `ALTER TABLE prayer_request_amens ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
    // The share-location opt-in toggles (share_pray_location / share_breath_location)
    // were removed (privacy simplification); the columns are dropped at the end.
    // PUBLIC no-login version: anonymous device users (silently provisioned on
    // first guest boot so push/reminders/prefs-sync work with no credentials).
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false`);

    // ── CAC daily reflection: read presence + shared journal ────────────────
    // cac_reads: one row per (user, local day) recording that they opened the
    // CAC Daily Reflection — powers the "who in my community read today" faces.
    await run(client, `
      CREATE TABLE IF NOT EXISTS cac_reads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ymd TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS cac_reads_user_day ON cac_reads (user_id, ymd)`);
    await run(client, `CREATE INDEX IF NOT EXISTS cac_reads_ymd ON cac_reads (ymd)`);
    // cac_reflections: a gratitude-style journal on the reflection — private
    // by default, optionally shared to the viewer's community wall.
    await run(client, `
      CREATE TABLE IF NOT EXISTS cac_reflections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        shared BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS cac_reflections_user ON cac_reflections (user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS cac_reflections_shared_created ON cac_reflections (shared, created_at)`);
    // Title of the reflection the entry was written about (e.g. "Giving Is
    // Receiving"), so "Your reflections" can label each by date + title.
    // Nullable — older rows predate it and just show the date.
    await run(client, `ALTER TABLE cac_reflections ADD COLUMN IF NOT EXISTS title TEXT`);

    // ── Shared "thoughts" for the other daily reflections (fdd, ssje) ───────
    // CAC's Daily Meditation has cac_reflections (above). "Forward Day by Day"
    // (fdd) and the Society of St John the Evangelist (ssje) get the same
    // community surface here — what others in your garden wrote about a given
    // day's reflection. Unlike cac_reflections (day inferred from created_at),
    // these carry the newsletter `day` explicitly so a thought maps to the
    // exact reflection it responds to. shared defaults TRUE — these are
    // community-facing by design. The uniform /api/reflections/:source/thoughts
    // endpoints read cac_reflections for "cac" and this table for "fdd"/"ssje".
    await run(client, `
      CREATE TABLE IF NOT EXISTS reflection_thoughts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        day TEXT NOT NULL,
        text TEXT NOT NULL,
        shared BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS reflection_thoughts_source_day ON reflection_thoughts (source, day)`);
    await run(client, `CREATE INDEX IF NOT EXISTS reflection_thoughts_user ON reflection_thoughts (user_id)`);

    // ── Hot-path performance indexes ────────────────────────────────────────
    // The "garden" (getGardenUserIds) joins group_members.email ↔ users.email
    // case-insensitively on every authenticated read; without functional
    // LOWER(email) indexes that's a seq-scan-driven join. And the prayed-for
    // map + community-prayed-week scan prayer_request_amens by (user_id,
    // prayed_at) but the only amens index is on request_id.
    await run(client, `CREATE INDEX IF NOT EXISTS idx_group_members_lower_email ON group_members (LOWER(email))`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email))`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_request_amens_user_prayed ON prayer_request_amens (user_id, prayed_at)`);

    // ── El Jardin — personal study + formation tools ─────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS jardin_bible_studies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_chapter TEXT NOT NULL DEFAULT '',
        main_theme TEXT NOT NULL DEFAULT '',
        key_verses TEXT NOT NULL DEFAULT '',
        symbols_keywords TEXT NOT NULL DEFAULT '',
        application TEXT NOT NULL DEFAULT '',
        takeaways TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS jardin_bible_studies_user ON jardin_bible_studies (user_id)`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS jardin_character_studies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        name_meaning TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT '',
        time_period TEXT NOT NULL DEFAULT '',
        strengths TEXT NOT NULL DEFAULT '',
        weaknesses TEXT NOT NULL DEFAULT '',
        key_events TEXT NOT NULL DEFAULT '',
        lessons_learned TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS jardin_character_studies_user ON jardin_character_studies (user_id)`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS jardin_sermon_notes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sermon_date TEXT NOT NULL DEFAULT '',
        preacher TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        scripture TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS jardin_sermon_notes_user ON jardin_sermon_notes (user_id, created_at DESC)`);

    await run(client, `
      CREATE TABLE IF NOT EXISTS jardin_next_sunday (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        scripture TEXT NOT NULL DEFAULT '',
        web_link TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await run(client, `
      CREATE TABLE IF NOT EXISTS jardin_friends (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, friend_id)
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS jardin_friends_user ON jardin_friends (user_id)`);

    // ── jardin_reading_reads (El Jardín daily reading plan check-in) ─────────
    // One row per (user, local day) marking that they read the day's passage.
    // Powers the "Lectura de hoy" check-in + a reading streak.
    await run(client, `
      CREATE TABLE IF NOT EXISTS jardin_reading_reads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        plan_index INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS jardin_reading_reads_user_day_uk ON jardin_reading_reads (user_id, day)`);

    // ── breath_sessions (Breathing Together beta) ────────────────────────────
    // "Con-spire" — con + spirare, to breathe together. One row per (user,
    // local day); the completion screen counts rows for that day string to
    // tell the person how many others they breathed with. `day` is the
    // user's local YYYY-MM-DD, same TEXT convention as practice_completion
    // and contemplation_health_minutes. Additive + idempotent.
    await run(client, `
      CREATE TABLE IF NOT EXISTS breath_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        seconds INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS breath_sessions_user_day_uk ON breath_sessions (user_id, day)`);
    await run(client, `CREATE INDEX IF NOT EXISTS breath_sessions_day_idx ON breath_sessions (day)`);
    // Where a breath was kept, and whether the device confirmed it. Both
    // nullable/defaulted so every existing row stays valid — breathing
    // anywhere is still the practice; a place is an option, never a
    // requirement. MUST stay after the CREATE above (see the note where these
    // used to live, up with the breath_places block).
    await run(client, `ALTER TABLE breath_sessions ADD COLUMN IF NOT EXISTS place_id INTEGER REFERENCES breath_places(id) ON DELETE SET NULL`);
    await run(client, `ALTER TABLE breath_sessions ADD COLUMN IF NOT EXISTS place_verified BOOLEAN NOT NULL DEFAULT FALSE`);
    await run(client, `CREATE INDEX IF NOT EXISTS breath_sessions_place_day_idx ON breath_sessions (place_id, day)`);
    // Say plainly whether the columns the places endpoint depends on are
    // actually there — run() is silent on failure, and a missing column here
    // is invisible until the app shows an error instead of a list of places.
    try {
      const cols = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'breath_sessions' AND column_name IN ('place_id','place_verified')`,
      );
      const have = cols.rows.map((r: { column_name: string }) => r.column_name).sort();
      if (have.length === 2) logger.info({ have }, "[migrate] breath_sessions: place columns present");
      else logger.warn({ have }, "[migrate] breath_sessions: place columns MISSING — /breath/places will 500");
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[migrate] breath_sessions: could not verify place columns");
    }

    // ── listening_entries (Audio Divina log — account-wide) ─────────────────
    // Append log of "sacred listening" sittings (what + how), one row per log.
    await run(client, `
      CREATE TABLE IF NOT EXISTS listening_entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        medium TEXT NOT NULL,
        what TEXT NOT NULL DEFAULT '',
        artwork_url TEXT NOT NULL DEFAULT '',
        experience TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `ALTER TABLE listening_entries ADD COLUMN IF NOT EXISTS artwork_url TEXT NOT NULL DEFAULT ''`);
    await run(client, `ALTER TABLE listening_entries ADD COLUMN IF NOT EXISTS experience TEXT NOT NULL DEFAULT ''`);
    await run(client, `ALTER TABLE listening_entries ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT FALSE`);
    await run(client, `CREATE INDEX IF NOT EXISTS listening_entries_user_idx ON listening_entries (user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS listening_entries_user_day_idx ON listening_entries (user_id, day)`);

    // ── lectio_log_entries (Lectio Divina log — account-wide, private) ──────
    // Append log of "sacred reading" sittings (passage + what you felt drawn to
    // / called to do), one row per log. Distinct from the lectionary feature
    // (lectio_reflections). `day` is the caller's LOCAL calendar day.
    await run(client, `
      CREATE TABLE IF NOT EXISTS lectio_log_entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        passage TEXT NOT NULL DEFAULT '',
        reflection TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS lectio_log_entries_user_idx ON lectio_log_entries (user_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS lectio_log_entries_user_day_idx ON lectio_log_entries (user_id, day)`);

    // ── practice_log_entries (generic log: Reading + Podcasts) ──────────────
    // One append log keyed by `kind` ("reading" | "podcasts"): what you read /
    // listened to + optional notes, privately or shared with fellows.
    await run(client, `
      CREATE TABLE IF NOT EXISTS practice_log_entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        day TEXT NOT NULL,
        what TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        shared BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS practice_log_entries_user_kind_idx ON practice_log_entries (user_id, kind)`);
    await run(client, `CREATE INDEX IF NOT EXISTS practice_log_entries_shared_idx ON practice_log_entries (kind, shared)`);

    // ── prayer_intentions (the personal prayer list) ────────────────────────
    // A private list of the things / people a user is holding in prayer. Each
    // item is either free text ("peace in Sudan") or a person (name + optional
    // note). Private by default; `shared` flips true once the user posts it to
    // a community / their circle (which creates a normal prayer_request — the
    // pray-along/amen infra — and we stash its id in shared_request_id).
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_intentions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'text',
        person_name TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        answered BOOLEAN NOT NULL DEFAULT FALSE,
        answered_at TIMESTAMPTZ,
        shared BOOLEAN NOT NULL DEFAULT FALSE,
        shared_request_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS prayer_intentions_user_idx ON prayer_intentions (user_id, answered, created_at)`);

    // Per-intention "prayed today" tracking — owner: the Prayer List
    // routine card reads "X out of Y prayers have been prayed" from this,
    // distinct from `answered` (a permanent resolution) and from the old
    // single practice_completion "prayer-list" flag (a manual all-or-
    // nothing check-off with no per-item detail). One row per (intention,
    // local day) the viewer walked past in PrayThrough (intentions.tsx).
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_intention_prayed_days (
        id SERIAL PRIMARY KEY,
        intention_id INTEGER NOT NULL REFERENCES prayer_intentions(id) ON DELETE CASCADE,
        ymd TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (intention_id, ymd)
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS prayer_intention_prayed_days_intention_idx ON prayer_intention_prayed_days (intention_id, ymd)`);

    // ── reflection_reads (Forward Day by Day / SSJE read-state) ──────────────
    // CAC reads live in cac_reads (richer — community read presence); this
    // table carries the other daily-reflection sources so the daily-progress
    // Reflect anchor syncs across devices for them too. `ymd` is the user's
    // local YYYY-MM-DD; unique (user, source, day) makes a repeat open a no-op.
    await run(client, `
      CREATE TABLE IF NOT EXISTS reflection_reads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        ymd TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS reflection_reads_user_source_ymd_uk ON reflection_reads (user_id, source, ymd)`);

    // Fellows manual-add (beta) reuses the existing fellows + fellow_invites
    // tables — no new table. fellow_invites carries pending requests; the two
    // symmetric fellows rows are the accepted link (already in the garden /
    // prayer-request visibility). An index on the request lookups:
    await run(client, `CREATE INDEX IF NOT EXISTS idx_fellow_invites_recipient_status ON fellow_invites (recipient_id, status)`);

    // ── forum_posts / forum_replies (group forum) ────────────────────────────
    // A message board scoped to a group: members post threads, any member
    // replies (flat). Powers the El Jardín group forum; reusable by any group.
    await run(client, `
      CREATE TABLE IF NOT EXISTS forum_posts (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS forum_posts_by_group ON forum_posts (group_id, created_at)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS forum_replies (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS forum_replies_by_post ON forum_replies (post_id, created_at)`);

    // Fellow plans — the "How About" surface: a person shares something they're
    // going to, and their active Fellows can say they'll come. Personal (one
    // host), visible only to the host + the host's fellows.
    await run(client, `
      CREATE TABLE IF NOT EXISTS fellow_plans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        note TEXT,
        location TEXT,
        emoji TEXT,
        starts_at TIMESTAMPTZ,
        when_text TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        share_token TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Lazily-minted public share token (existing tables predate the column).
    await run(client, `ALTER TABLE fellow_plans ADD COLUMN IF NOT EXISTS share_token TEXT`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_fellow_plans_share_token ON fellow_plans (share_token) WHERE share_token IS NOT NULL`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_fellow_plans_user ON fellow_plans (user_id)`);
    // The feed query filters by host IN (...) AND status='open' — a composite
    // index serves that directly.
    await run(client, `CREATE INDEX IF NOT EXISTS idx_fellow_plans_user_status ON fellow_plans (user_id, status)`);
    // Candidate times for a plan that's still being scheduled (the time organizer).
    await run(client, `
      CREATE TABLE IF NOT EXISTS fellow_plan_times (
        id SERIAL PRIMARY KEY,
        plan_id INTEGER NOT NULL REFERENCES fellow_plans(id) ON DELETE CASCADE,
        starts_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_fellow_plan_times_plan ON fellow_plan_times (plan_id)`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS fellow_plan_rsvps (
        id SERIAL PRIMARY KEY,
        plan_id INTEGER NOT NULL REFERENCES fellow_plans(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_time_id INTEGER REFERENCES fellow_plan_times(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Existing tables predate per-time leanings: add the column + relax the
    // unique index into two partials (one whole-plan RSVP per user, one leaning
    // per user+time). The OLD plain unique is dropped once (new names differ).
    await run(client, `ALTER TABLE fellow_plan_rsvps ADD COLUMN IF NOT EXISTS plan_time_id INTEGER REFERENCES fellow_plan_times(id) ON DELETE CASCADE`);
    await run(client, `DROP INDEX IF EXISTS uniq_fellow_plan_rsvp_plan_user`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_fellow_plan_rsvp_plan_user_whole ON fellow_plan_rsvps (plan_id, user_id) WHERE plan_time_id IS NULL`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_fellow_plan_rsvp_plan_user_time ON fellow_plan_rsvps (plan_id, user_id, plan_time_id) WHERE plan_time_id IS NOT NULL`);

    // One-tap "🙌 encouragement" between Fellows (direct, no pairing).
    await run(client, `
      CREATE TABLE IF NOT EXISTS fellow_encouragements (
        id SERIAL PRIMARY KEY,
        from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        seen_at TIMESTAMPTZ
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_fellow_encouragements_to ON fellow_encouragements (to_user_id)`);

    // Fellows "Turn" 🔆 — one presence act per user per LOCAL day. The first of
    // the three coarse fellow lights (Turn / Learn / Pray); Learn + Pray are
    // derived from existing reads/sessions, only Turn needs its own row.
    await run(client, `
      CREATE TABLE IF NOT EXISTS presence_turns (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ymd TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS presence_turns_user_ymd ON presence_turns (user_id, ymd)`);

    // Fellows invite LINK — one stable shareable "be my fellow" token per
    // sender. Anyone who opens /fellow/<token> and signs in becomes a fellow
    // (createFellowPair). One row per sender (unique sender_id) so the link
    // never changes. Distinct from fellow_invites (which is a directed,
    // recipient-bound pending request).
    await run(client, `
      CREATE TABLE IF NOT EXISTS fellow_link_invites (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS fellow_link_invites_sender ON fellow_link_invites (sender_id)`);

    // Per-user static ECDH public key (E2E voice memos). Private key stays on device.
    await run(client, `
      CREATE TABLE IF NOT EXISTS user_public_keys (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        public_key_jwk TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // (Voice memos feature removed — its voice_memos table is no longer created.
    // Any existing table in prod is left orphaned/harmless; not dropped here.)

    // Letters feature removed + data dropped (owner-approved 2026-07-23).
    // The letters/correspondence CREATE + ALTER DDL earlier in this file is
    // left as-is (harmless — CREATE ... IF NOT EXISTS is a no-op once these
    // drops have run). Dropped in FK-safe order (children first). CASCADE
    // also clears letter_drafts / letter_reminders / letter_window_pushes,
    // which reference correspondences(id).
    await run(client, `DROP TABLE IF EXISTS letters CASCADE`);
    await run(client, `DROP TABLE IF EXISTS correspondence_members CASCADE`);
    await run(client, `DROP TABLE IF EXISTS correspondences CASCADE`);

    // More features removed + their free-text/journal data dropped
    // (owner-approved 2026-07-23). Same pattern as letters above: the CREATE
    // DDL earlier in this file is a harmless no-op once these drops run.
    // CASCADE handles FK order (children before parents).
    await run(client, `DROP TABLE IF EXISTS gratitude_seen CASCADE`);
    await run(client, `DROP TABLE IF EXISTS gratitude_responses CASCADE`);
    await run(client, `DROP TABLE IF EXISTS reflection_thoughts CASCADE`);
    await run(client, `DROP TABLE IF EXISTS group_reflection_comments CASCADE`);
    await run(client, `DROP TABLE IF EXISTS group_reflections CASCADE`);
    await run(client, `DROP TABLE IF EXISTS group_reflection_sources CASCADE`);
    await run(client, `DROP TABLE IF EXISTS lectio_reflections CASCADE`);
    await run(client, `DROP TABLE IF EXISTS lectio_log_entries CASCADE`);
    await run(client, `DROP TABLE IF EXISTS journal_entries CASCADE`);
    // NOTE: user_mutes is deliberately NOT dropped — the mute *filtering*
    // (excluding muted users from prayer delivery / feeds / counts) still reads
    // it across ~9 kept routes. Only the mute UI/CRUD was removed. Keep the table.
    await run(client, `DROP TABLE IF EXISTS user_public_keys CASCADE`);

    // Non-core feature removals 2026-07-23 (batches 1-6): drop the dropped
    // features' tables. Audited: kept tables that other kept code still reads
    // (creator_seasons [community seasons], fellows/fellow_prefs [How About
    // plans], waitlist [signup/deletion DELETEs], user_mutes [mute filtering],
    // user_connections_cache [contacts/moments]) are deliberately NOT dropped.
    // CASCADE handles FK order.
    await run(client, `DROP TABLE IF EXISTS rhythm_party_members CASCADE`);
    await run(client, `DROP TABLE IF EXISTS rhythm_parties CASCADE`);
    await run(client, `DROP TABLE IF EXISTS prayer_partnerships CASCADE`);
    await run(client, `DROP TABLE IF EXISTS prayers_for CASCADE`);
    await run(client, `DROP TABLE IF EXISTS daily_prayers CASCADE`);
    await run(client, `DROP TABLE IF EXISTS prayer_attentions CASCADE`);
    // prayer_intentions restored 2026-07-29 — private prayer list feature un-deleted.
    await run(client, `DROP TABLE IF EXISTS fellow_invites CASCADE`);
    await run(client, `DROP TABLE IF EXISTS fellow_encouragements CASCADE`);
    await run(client, `DROP TABLE IF EXISTS fellow_link_invites CASCADE`);
    await run(client, `DROP TABLE IF EXISTS walk_pairings CASCADE`);
    await run(client, `DROP TABLE IF EXISTS walk_nudges CASCADE`);
    await run(client, `DROP TABLE IF EXISTS rule_of_life_requests CASCADE`);
    await run(client, `DROP TABLE IF EXISTS bless_intention CASCADE`);
    await run(client, `DROP TABLE IF EXISTS bless_week CASCADE`);
    await run(client, `DROP TABLE IF EXISTS parish_opportunity_interests CASCADE`);
    await run(client, `DROP TABLE IF EXISTS parish_opportunities CASCADE`);
    await run(client, `DROP TABLE IF EXISTS parish_prayer_list_prayers CASCADE`);
    await run(client, `DROP TABLE IF EXISTS parish_prayer_list CASCADE`);
    await run(client, `DROP TABLE IF EXISTS feedback CASCADE`);

    // ── Privacy simplification: phone contact-discovery, group chat, and the
    //    share-location opt-ins were removed. Drop their tables + columns so no
    //    phone numbers, chat bodies, or location flags remain at rest.
    await run(client, `DROP TABLE IF EXISTS group_message_reads CASCADE`);
    await run(client, `DROP TABLE IF EXISTS group_messages CASCADE`);
    await run(client, `DROP INDEX IF EXISTS users_phone_normalized_uk`);
    await run(client, `DROP INDEX IF EXISTS users_phone_hash_idx`);
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS phone_number`);
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS phone_number_normalized`);
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS phone_hash`);
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS phone_verified_at`);
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS discoverable_by_phone`);
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS share_pray_location`);
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS share_breath_location`);

    // ── Apple Health / HealthKit removal: no more mindful-minutes or step data.
    await run(client, `DROP TABLE IF EXISTS contemplation_health_minutes CASCADE`);
    await run(client, `DROP TABLE IF EXISTS daily_health_steps CASCADE`);

    // ── RSVP data removal (owner: "we don't want RSVP data"). These two tables
    //    are already dead (0 readers): the meetup RSVP store and the civic-
    //    action RSVP store. Drop them so no RSVP records remain at rest.
    await run(client, `DROP TABLE IF EXISTS meetup_rsvps CASCADE`);
    await run(client, `DROP TABLE IF EXISTS action_rsvps CASCADE`);
    // The gathering scheduler (invite/RSVP status + availability polling) was
    // removed entirely — no meetup RSVP or "who can meet when" data collected.
    await run(client, `DROP TABLE IF EXISTS availability_patterns CASCADE`);
    await run(client, `DROP TABLE IF EXISTS gathering_members CASCADE`);
    await run(client, `DROP TABLE IF EXISTS scheduled_gatherings CASCADE`);
    // The ritual/tradition scheduling-poll system was removed entirely too —
    // guest RSVP responses, per-invitee tokens, and member time-suggestions.
    await run(client, `DROP TABLE IF EXISTS schedule_responses CASCADE`);
    await run(client, `DROP TABLE IF EXISTS scheduling_responses CASCADE`);
    await run(client, `DROP TABLE IF EXISTS invite_tokens CASCADE`);
    await run(client, `DROP TABLE IF EXISTS ritual_time_suggestions CASCADE`);

    // ── Google-Calendar Daily Bell removal — no calendar invite/RSVP polling
    //    remains for the daily reminder. The push-based bell (bellSender.ts,
    //    bell_notifications dedup table) is unrelated and stays.
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS bell_enabled`);
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS daily_bell_time`);
    await run(client, `ALTER TABLE users DROP COLUMN IF EXISTS bell_calendar_event_id`);

    // ── Fellows (1:1 social layer) removed entirely — Plans/How About, prefs,
    //    the connection graph. No live readers remain.
    await run(client, `DROP TABLE IF EXISTS fellow_plan_rsvps CASCADE`);
    await run(client, `DROP TABLE IF EXISTS fellow_plan_times CASCADE`);
    await run(client, `DROP TABLE IF EXISTS fellow_plans CASCADE`);
    await run(client, `DROP TABLE IF EXISTS fellow_prefs CASCADE`);
    await run(client, `DROP TABLE IF EXISTS fellows CASCADE`);

    // ── Gathering invitees/calendar-invites removed — a gathering is now a
    //    posted announcement, not something with an attendee list or RSVP.
    await run(client, `ALTER TABLE rituals DROP COLUMN IF EXISTS participants`);
    await run(client, `ALTER TABLE rituals DROP COLUMN IF EXISTS allow_member_invites`);
    await run(client, `ALTER TABLE meetups DROP COLUMN IF EXISTS google_calendar_event_id`);

    // ── Novenas — a nine-day (dayCount-configurable) library entry, ridden
    //    one day at a time in the daily routine. novena_progress tracks
    //    AT MOST ONE active novena per user (partial unique index below) —
    //    currentDay advances only when the user marks that day complete,
    //    never by the calendar; last_completed_local_date is how "already
    //    prayed today's day" resets each morning (same convention as
    //    practice_completion's local_date — client supplies its own
    //    timezone's today).
    await run(client, `
      CREATE TABLE IF NOT EXISTS novenas (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        saint TEXT,
        source_note TEXT,
        day_count INTEGER NOT NULL DEFAULT 9,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(client, `
      CREATE TABLE IF NOT EXISTS novena_days (
        id SERIAL PRIMARY KEY,
        novena_id INTEGER NOT NULL REFERENCES novenas(id) ON DELETE CASCADE,
        day_number INTEGER NOT NULL,
        title TEXT,
        body TEXT NOT NULL
      )
    `);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_novena_day ON novena_days (novena_id, day_number)`);
    // Shown on the preview/detail page alongside source_note. sort_order lets
    // the library list override alphabetical-by-title for a given novena.
    // Added after the initial table.
    await run(client, `ALTER TABLE novenas ADD COLUMN IF NOT EXISTS history TEXT`);
    await run(client, `ALTER TABLE novenas ADD COLUMN IF NOT EXISTS intention TEXT`);
    await run(client, `ALTER TABLE novenas ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`);
    // Stable identifier for the seeder to match on — title is a renameable
    // display value, so matching by title meant a rename never updated the
    // existing row, it just silently seeded a duplicate under the new title
    // while the original (with the user's real progress attached via
    // novena_progress's FK) kept its stale title forever. code never changes.
    await run(client, `ALTER TABLE novenas ADD COLUMN IF NOT EXISTS code TEXT`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_novenas_code ON novenas (code) WHERE code IS NOT NULL`);
    // When set, the route splices the actual BCP Psalter text (bcp_texts) in
    // ahead of `body` at render time, instead of re-transcribing psalm text
    // by hand into seed data. Added after the initial table.
    await run(client, `ALTER TABLE novena_days ADD COLUMN IF NOT EXISTS psalm_number INTEGER`);
    // Declared on the schema (lib/db/src/schema/novenas.ts) but this ALTER
    // was never actually added — Drizzle's select() queries every declared
    // column, so GET /api/me/novena has been failing with "column
    // novena_days.psalm_verse_range does not exist" on every call in
    // production. This is THE root cause of "novenas aren't working."
    await run(client, `ALTER TABLE novena_days ADD COLUMN IF NOT EXISTS psalm_verse_range TEXT`);
    await run(client, `
      CREATE TABLE IF NOT EXISTS novena_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        novena_id INTEGER NOT NULL REFERENCES novenas(id) ON DELETE CASCADE,
        current_day INTEGER NOT NULL DEFAULT 1,
        last_completed_local_date TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);
    // replace-vs-addition: null rides alongside the routine as its own card;
    // "morning"/"evening" takes over that side's anchor for as long as this
    // novena is active. Added after the initial table — ADD COLUMN for
    // existing databases.
    await run(client, `ALTER TABLE novena_progress ADD COLUMN IF NOT EXISTS replaces_slot TEXT`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_novena_progress_user ON novena_progress (user_id)`);
    await run(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_novena_progress_active_per_user
      ON novena_progress (user_id) WHERE status = 'active'
    `);

    // Seed the novena library, matched by the stable `code` (not title —
    // title is a renameable display value; matching by it meant a rename
    // never updated the row, it just silently seeded a duplicate under the
    // new title while the original, with the user's real progress attached,
    // kept its stale title forever — see the "two St. Teresa's" incident).
    //
    // legacyTitles covers a novena's title(s) before code existed, so the
    // FIRST boot after this migration adopts the old row (preserving its id
    // and any attached novena_progress) instead of creating a fresh
    // duplicate. Any other row that still collides on code or title gets
    // archived (never deleted — it may be referenced by a progress row's FK).
    const seedNovena = async (n: {
      code: string; title: string; saint: string | null; sourceNote: string | null;
      history?: string | null; intention?: string | null; sortOrder?: number; dayCount: number;
      legacyTitles?: string[];
      days: Array<{ dayNumber: number; title: string | null; body: string; psalmNumber?: number | null }>;
    }): Promise<void> => {
      try {
        const byCode = await client.query(`SELECT id FROM novenas WHERE code = $1`, [n.code]);
        let novenaId: number | null = (byCode as unknown as { rows: Array<{ id: number }> }).rows[0]?.id ?? null;

        if (novenaId === null) {
          const candidateTitles = [n.title, ...(n.legacyTitles ?? [])];
          const legacy = await client.query(
            `SELECT id FROM novenas WHERE code IS NULL AND title = ANY($1::text[]) ORDER BY id ASC LIMIT 1`,
            [candidateTitles],
          );
          novenaId = (legacy as unknown as { rows: Array<{ id: number }> }).rows[0]?.id ?? null;
        }

        if (novenaId === null) {
          const inserted = await client.query(
            `INSERT INTO novenas (code, title, saint, source_note, history, intention, sort_order, day_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [n.code, n.title, n.saint, n.sourceNote, n.history ?? null, n.intention ?? null, n.sortOrder ?? 0, n.dayCount],
          ) as unknown as { rows: Array<{ id: number }> };
          novenaId = inserted.rows[0]!.id;
          for (const day of n.days) {
            await client.query(
              `INSERT INTO novena_days (novena_id, day_number, title, body, psalm_number) VALUES ($1, $2, $3, $4, $5)`,
              [novenaId, day.dayNumber, day.title, day.body, day.psalmNumber ?? null],
            );
          }
          logger.info({ novenaId }, "Seeded novena: " + n.title);
        } else {
          await client.query(
            `UPDATE novenas SET code = $1, title = $2, saint = $3, source_note = $4, history = $5, intention = $6, sort_order = $7, day_count = $8 WHERE id = $9`,
            [n.code, n.title, n.saint, n.sourceNote, n.history ?? null, n.intention ?? null, n.sortOrder ?? 0, n.dayCount, novenaId],
          );
        }

        // Hide (not delete) any stray duplicate left over from before code
        // existed, or from a title collision.
        await client.query(
          `UPDATE novenas SET archived_at = NOW() WHERE id != $1 AND archived_at IS NULL AND (code = $2 OR title = ANY($3::text[]))`,
          [novenaId, n.code, [n.title, ...(n.legacyTitles ?? [])]],
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ msg, code: n.code }, "Novena seed warning");
      }
    };

    await seedNovena({
      code: "teresa", title: NOVENA_TERESA.title, saint: NOVENA_TERESA.saint, sourceNote: NOVENA_TERESA.sourceNote,
      history: NOVENA_TERESA.history, intention: NOVENA_TERESA.intention, dayCount: NOVENA_TERESA.dayCount,
      // Titles this novena has carried before code-based matching existed.
      legacyTitles: ["Novena of Saint Teresa", "Novena of St. Teresa of Jesus", "Novena of St. Teresa of Jesus (of Ávila)", "Novena of St. Teresa of Ávila"],
      days: NOVENA_TERESA.days,
    });
    await seedNovena({
      code: "carmel", title: NOVENA_CARMEL.title, saint: NOVENA_CARMEL.saint, sourceNote: NOVENA_CARMEL.sourceNote,
      history: NOVENA_CARMEL.history, intention: NOVENA_CARMEL.intention, sortOrder: NOVENA_CARMEL.sortOrder, dayCount: NOVENA_CARMEL.dayCount,
      legacyTitles: ["Novena of Our Lady of Mount Carmel"],
      days: NOVENA_CARMEL.days,
    });
    // "Nine Days of Prayer with Creation" — pulled from the app per owner
    // decision (its content sourcing needed more work than a quick pass
    // could responsibly deliver). Archived rather than deleted: no user had
    // started it, but archiving is the FK-safe pattern this schema already
    // uses to hide a novena from the library without touching novena_days /
    // novena_progress. Not re-seeded going forward.
    try {
      await client.query(`UPDATE novenas SET archived_at = NOW() WHERE code = 'creation' AND archived_at IS NULL`);
      // Defensive: if anyone actually started it before it was pulled, don't
      // leave their progress row pinned to "active" — that would both show a
      // ghost card for a novena no longer in the library AND (per the
      // one-active-novena-at-a-time rule) sit there as their "current" one
      // until they happened to start something else with confirmSwitch.
      await client.query(
        `UPDATE novena_progress SET status = 'abandoned' WHERE status = 'active' AND novena_id IN (SELECT id FROM novenas WHERE code = 'creation')`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ msg }, "Novena archive warning");
    }
    await seedNovena({
      code: "francis", title: NOVENA_FRANCIS.title, saint: NOVENA_FRANCIS.saint, sourceNote: NOVENA_FRANCIS.sourceNote,
      history: NOVENA_FRANCIS.history, intention: NOVENA_FRANCIS.intention, dayCount: NOVENA_FRANCIS.dayCount,
      legacyTitles: ["Nine Days with St. Francis of Assisi"],
      days: NOVENA_FRANCIS.days,
    });
    await seedNovena({
      code: "discernment", title: NOVENA_DISCERNMENT.title, saint: NOVENA_DISCERNMENT.saint, sourceNote: NOVENA_DISCERNMENT.sourceNote,
      history: NOVENA_DISCERNMENT.history, intention: NOVENA_DISCERNMENT.intention, dayCount: NOVENA_DISCERNMENT.dayCount,
      legacyTitles: ["A Novena for Personal Discernment"],
      days: NOVENA_DISCERNMENT.days,
    });

    // ── Prayer-request group scoping ─────────────────────────────────────
    // Which specific communities a shared prayer request was sent to.
    // Owner: "have it have you select which communities to share it with"
    // — before this table, sharing fanned out to EVERY group the
    // requester belonged to. A request with no rows here is a legacy/
    // ungrouped request and keeps the old whole-garden visibility as a
    // fallback (see prayer.ts).
    await run(client, `
      CREATE TABLE IF NOT EXISTS prayer_request_groups (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (request_id, group_id)
      )
    `);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_request_groups_request ON prayer_request_groups (request_id)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_request_groups_group ON prayer_request_groups (group_id)`);
    // Owner: "an admin should be able to mute a prayer request from the
    // group" — per-(request, group) moderation, distinct from the
    // per-viewer user_mutes table.
    await run(client, `ALTER TABLE prayer_request_groups ADD COLUMN IF NOT EXISTS muted_at TIMESTAMPTZ`);
    await run(client, `ALTER TABLE prayer_request_groups ADD COLUMN IF NOT EXISTS muted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);

    // Verify shared_moments columns exist
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'shared_moments' ORDER BY ordinal_position
    `);
    const cols = colCheck.rows.map((r: { column_name: string }) => r.column_name);
    logger.info({ cols }, "Database migration completed — shared_moments columns");
  } catch (err) {
    logger.error({ err }, "Database migration failed");
    throw err;
  } finally {
    client.release();
  }
}
