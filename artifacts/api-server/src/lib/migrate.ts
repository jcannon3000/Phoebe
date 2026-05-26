import { pool } from "@workspace/db";
import { logger } from "./logger";

// Minimal structural type for the object pool.connect() gives us — just
// what run() actually uses. Previously typed as
// `Awaited<ReturnType<typeof pool.connect>>` which resolves to `void`
// under the rebuilt @workspace/db declarations (pg's Pool.connect
// overload leaks through differently after the project-reference
// build). A local structural type avoids needing @types/pg in this
// package.
interface MigrateClient {
  query: (sql: string) => Promise<unknown>;
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

export async function migrate() {
  const client = await pool.connect();
  try {
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

      CREATE TABLE IF NOT EXISTS schedule_responses (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id),
        guest_name TEXT NOT NULL,
        guest_email TEXT,
        chosen_time TEXT,
        unavailable INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scheduling_responses (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        choice TEXT NOT NULL,
        chosen_time TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invite_tokens (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id),
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        responded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
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
    // Repair: the backfill above set cycleStartedAt = created_at for all
    // existing intercessions. Intercessions created more than goalDays ago
    // became immediately hidden even if they were actively being prayed.
    // Fix: for intercessions whose window is past but have had a prayer post
    // in the last 60 days, reset cycleStartedAt to NOW so the window opens
    // fresh. Intercessions with no recent activity stay hidden as intended.
    // Guard: only touch rows still at the original backfill value
    // (cycleStartedAt = created_at). Once we reset to NOW() — or an
    // admin extends the cycle — the condition is false and subsequent
    // restarts leave those rows alone. This prevents the UPDATE from
    // reopening an intercession the admin deliberately let expire.
    await run(client, `
      UPDATE shared_moments sm
      SET commitment_cycle_started_at = NOW()
      WHERE sm.template_type = 'intercession'
        AND sm.goal_days > 0
        AND sm.commitment_goal_reached_at IS NULL
        AND sm.commitment_cycle_started_at = sm.created_at
        AND sm.commitment_cycle_started_at + (sm.goal_days || ' days')::interval < NOW()
        AND EXISTS (
          SELECT 1 FROM moment_posts mp
          WHERE mp.moment_id = sm.id
            AND mp.window_date >= (CURRENT_DATE - INTERVAL '60 days')::date
        )
    `);
    // Repair 2: intercessions that hit their goal (commitmentGoalReachedAt set)
    // but the community kept praying past the 2-day Extend grace window.
    // The grace exists so the admin can see the Extend popup — if there is
    // recent activity it means people were still praying and the intercession
    // was unintentionally hidden, not intentionally retired. Clear the
    // goalReachedAt stamp and open a fresh cycle so it reappears.
    // Guard: only if non-archived AND has prayer posts in the last 14 days.
    await run(client, `
      UPDATE shared_moments sm
      SET commitment_goal_reached_at = NULL,
          commitment_cycle_started_at = NOW(),
          state = 'active'
      WHERE sm.template_type = 'intercession'
        AND sm.goal_days > 0
        AND sm.commitment_goal_reached_at IS NOT NULL
        AND sm.commitment_goal_reached_at + INTERVAL '2 days' < NOW()
        AND sm.state != 'archived'
        AND EXISTS (
          SELECT 1 FROM moment_posts mp
          WHERE mp.moment_id = sm.id
            AND mp.window_date >= (CURRENT_DATE - INTERVAL '14 days')::date
        )
    `);

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

    // Fix missing ON DELETE CASCADE on existing FK constraints (safe to re-run)
    await run(client, `ALTER TABLE rituals DROP CONSTRAINT IF EXISTS rituals_owner_id_fkey`);
    await run(client, `ALTER TABLE rituals ADD CONSTRAINT rituals_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE`);
    await run(client, `ALTER TABLE moment_posts DROP CONSTRAINT IF EXISTS moment_posts_moment_id_fkey`);
    await run(client, `ALTER TABLE moment_posts ADD CONSTRAINT moment_posts_moment_id_fkey FOREIGN KEY (moment_id) REFERENCES shared_moments(id) ON DELETE CASCADE`);
    await run(client, `ALTER TABLE moment_windows DROP CONSTRAINT IF EXISTS moment_windows_moment_id_fkey`);
    await run(client, `ALTER TABLE moment_windows ADD CONSTRAINT moment_windows_moment_id_fkey FOREIGN KEY (moment_id) REFERENCES shared_moments(id) ON DELETE CASCADE`);
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

    // Time suggestions from tradition members
    await run(client, `
      CREATE TABLE IF NOT EXISTS ritual_time_suggestions (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id) ON DELETE CASCADE,
        suggested_by_email TEXT NOT NULL,
        suggested_by_name TEXT,
        suggested_time TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

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
        assembled_by_user_id INTEGER REFERENCES users(id)
      )
    `);

    // ── Eleanor Letters tables ────────────────────────────────────────────────
    await run(client, `
      CREATE TABLE IF NOT EXISTS correspondences (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_by_user_id INTEGER REFERENCES users(id),
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
        user_id INTEGER REFERENCES users(id),
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
        author_user_id INTEGER REFERENCES users(id),
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
        author_user_id INTEGER REFERENCES users(id),
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

    // ── Daily Bell system ──────────────────────────────────────────────────
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS bell_enabled BOOLEAN NOT NULL DEFAULT false`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_bell_time TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS bell_calendar_event_id TEXT`);

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

    // ── Phone-number contact discovery ─────────────────────────────────────
    // Three columns:
    //   phone_number             — display form, what the user typed
    //   phone_number_normalized  — E.164 (e.g. "+15555550123"); UNIQUE so
    //                              one number → one account
    //   phone_hash               — SHA-256 of phone_number_normalized,
    //                              indexed for the contact-match lookup.
    //                              We only store + index the hash so a
    //                              dump of the device-uploaded contact
    //                              hashes can be matched without ever
    //                              keeping the raw uploaded numbers.
    // Verification (SMS) is intentionally deferred — for now any user
    // can self-attest. The trust model: matched contacts are surfaced
    // by the OWNER's address book, and we always show the matched
    // user's real Phoebe display name + avatar (not the uploader's
    // contact-book label) so an impersonator can't "become" someone
    // else's contact entry.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number_normalized TEXT`);
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_hash TEXT`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS users_phone_normalized_uk ON users (phone_number_normalized) WHERE phone_number_normalized IS NOT NULL`);
    await run(client, `CREATE INDEX IF NOT EXISTS users_phone_hash_idx ON users (phone_hash) WHERE phone_hash IS NOT NULL`);

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
    // correspondents as the prayer-feed prioritization signal (see
    // api-server/src/lib/correspondents.ts and GET /api/prayer-requests).
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

    // Daily "you've been held in prayer today" notification queue.
    // Created on the first non-owner amen of a request on a given day
    // (in the recipient's tz); incremented on each subsequent amen
    // during the 2-hour batching window; claimed by the scanner after
    // 2h and pushed once. Unique on (request, day) so re-amens after
    // sent_at don't generate a second notification that day.
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
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_phn_request_day ON prayer_held_notifications (request_id, day_key)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_phn_pending ON prayer_held_notifications (sent_at, first_amen_at)`);
    // Recipient-scoped unique. The original index above was
    // (request_id, day_key) — fine when only the owner ever got
    // batched. We now also enqueue rows for tagged users (the
    // "praying for my friend Matthew" feature), so a SECOND row per
    // (request, day) with a different recipient_id is legitimate.
    // Add a wider index covering all three columns and drop the
    // narrower one. IF NOT EXISTS / IF EXISTS make this safe on
    // re-deploys.
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

    // Master notifications switch (Settings → Notifications). Default
    // true so existing users keep their notifications; sendPushToUser
    // suppresses every push when false.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT true`);

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
    await run(client, `UPDATE users SET daily_bell_time = '09:30' WHERE daily_bell_time = '07:00' OR daily_bell_time IS NULL`);

    // Platform-owned feeds: drop NOT NULL on creator_user_id so editorial
    // feeds (phoebe-climate) can exist without a human creator. The
    // existing FK + ON DELETE CASCADE behaviour for user-created feeds
    // is unchanged — only the nullability is relaxed.
    await run(client, `ALTER TABLE prayer_feeds ALTER COLUMN creator_user_id DROP NOT NULL`);

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
    // on the schema default 'private', which 404s the public landing.
    // Force it back to live + public on every boot so the chooser link
    // works regardless of how the row was originally inserted.
    await run(client, `UPDATE prayer_feeds SET visibility = 'public', state = 'live' WHERE slug = 'phoebe-climate'`);

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
    await run(client, `UPDATE users SET bell_enabled = true WHERE climate_enrolled = true AND bell_enabled = false`);

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
    await run(client, `UPDATE groups SET is_public = TRUE WHERE is_public = FALSE`);
    // Last time an admin sent the "How can I pray for you?" community
    // prompt push. Once-per-7-days rate limit enforced server-side. Null
    // = never sent — that's the eligible default.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS last_prayer_invite_at TIMESTAMPTZ`);
    // The prompt the admin chose for the most recent "Ask your
    // community" send (preset or custom). The share-prayer page reads
    // it so the slide asks the same question the push / email did.
    await run(client, `ALTER TABLE groups ADD COLUMN IF NOT EXISTS prayer_invite_prompt TEXT`);
    // Per-user daily dedup for the "How can we pray for you?" email.
    // YYYY-MM-DD UTC. NULL = never received.
    await run(client, `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_prayer_invite_email_date TEXT`);
    // Parish-scoped "pastoral concern" prayer requests. When set, the
    // request is visible only to the requester + parish admin(s); never
    // surfaces in garden / slideshow / other parishioners' lists.
    await run(client, `ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS parish_feed_id INTEGER`);
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
    await run(client, `UPDATE users SET bcp_show_confession = TRUE WHERE bcp_show_confession = FALSE`);

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
