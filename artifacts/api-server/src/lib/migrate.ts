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
    await run(client, `CREATE INDEX IF NOT EXISTS idx_rituals_group_id ON rituals(group_id)`);

    // Per-meetup location (each scheduled gathering can be in a different place).
    // Added to the schema after the table was first created, so existing
    // deployments need this ALTER to unblock meetup selects.
    await run(client, `ALTER TABLE meetups ADD COLUMN IF NOT EXISTS location TEXT`);

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
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS uniq_prayer_feed_entries_feed_date ON prayer_feed_entries (feed_id, entry_date)`);
    await run(client, `CREATE INDEX IF NOT EXISTS idx_prayer_feed_entries_feed_date ON prayer_feed_entries (feed_id, entry_date)`);

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
