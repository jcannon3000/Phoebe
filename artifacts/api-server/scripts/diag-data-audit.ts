/**
 * READ-ONLY diagnostic for the three open questions from the 2026-07-21 audits.
 * Runs SELECTs only — no INSERT, UPDATE, DELETE or DDL anywhere in this file.
 *
 *   cd artifacts/api-server
 *   # put a READ-ONLY production connection string in .env as DATABASE_URL, then:
 *   set -a; . ./.env; set +a
 *   pnpm dlx tsx scripts/diag-data-audit.ts
 *
 * Answers:
 *   1. Which practice the office reminder thinks the owner prays (the recurring
 *      "Praying the Psalms" push).
 *   2. Whether the five foreign keys really carry ON DELETE NO ACTION in prod —
 *      i.e. whether the constraint edits inside CREATE TABLE IF NOT EXISTS ever
 *      applied, and whether retention's anonymous-user purge can succeed.
 *   3. How many users have a NULL timezone — the blast radius for the day
 *      attribution findings.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

function rows(r: unknown): Record<string, unknown>[] {
  const any = r as { rows?: Record<string, unknown>[] };
  return Array.isArray(any?.rows) ? any.rows : (r as Record<string, unknown>[]);
}

async function main() {
  console.log("DB host:", (process.env["DATABASE_URL"] ?? "").replace(/.*@/, "").replace(/\/.*/, ""));

  // ── 1. The reminder's view of the owner's practice ────────────────────────
  console.log("\n=== 1. Office reminder inputs (owner) ===");
  const prefs = await db.execute(sql`
    SELECT id, email,
           parish_office_morning_pref  AS morning_pref,
           parish_office_evening_pref  AS evening_pref,
           parish_office_morning_time  AS morning_time,
           parish_office_evening_time  AS evening_time,
           rule_config -> 'values' ->> 'phoebe:office:level:morning' AS level_morning,
           rule_config -> 'values' ->> 'phoebe:office:level:evening' AS level_evening,
           rule_config ->> 'updatedAt' AS rule_updated_at,
           timezone
      FROM users
     WHERE LOWER(email) LIKE '%jcannon3000%'
  `);
  console.table(rows(prefs));

  // ── 2. Do the five FKs actually cascade in this database? ─────────────────
  // The DDL says ON DELETE SET NULL / CASCADE, but those clauses were added by
  // editing lines inside CREATE TABLE IF NOT EXISTS, which is a no-op on a
  // database where the table already exists. delete_rule is the ground truth.
  console.log("\n=== 2. Live ON DELETE rules for the five suspect FKs ===");
  console.log("    (expected SET NULL / CASCADE; 'NO ACTION' means the edit never applied)");
  const fks = await db.execute(sql`
    SELECT tc.table_name, kcu.column_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_name IN ('morning_prayer_cache','correspondences',
                             'correspondence_members','letters','letter_drafts')
     ORDER BY tc.table_name, kcu.column_name
  `);
  console.table(rows(fks));

  // Any OTHER FK into users(id) that would block a user delete outright.
  console.log("\n=== 2b. Every FK into users(id) whose delete_rule blocks deletion ===");
  const blocking = await db.execute(sql`
    SELECT tc.table_name, kcu.column_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = 'users'
       AND rc.delete_rule IN ('NO ACTION','RESTRICT')
     ORDER BY tc.table_name
  `);
  const blockingRows = rows(blocking);
  console.table(blockingRows);
  console.log(blockingRows.length === 0
    ? "    none — user deletion and the anonymous purge are unblocked."
    : `    ${blockingRows.length} blocking FK(s): the retention anonymous-user purge will abort on any user stamped in these.`);

  // ── 3. Blast radius of the day-attribution findings ───────────────────────
  console.log("\n=== 3. Timezone coverage ===");
  const tz = await db.execute(sql`
    SELECT COUNT(*)                                            AS total_users,
           COUNT(*) FILTER (WHERE timezone IS NULL)            AS null_tz,
           COUNT(*) FILTER (WHERE timezone IS NOT NULL)        AS has_tz,
           COUNT(*) FILTER (WHERE is_anonymous)                AS anonymous
      FROM users
  `);
  console.table(rows(tz));

  // How many anonymous users the retention sweep would currently delete.
  console.log("\n=== 3b. Anonymous users the retention sweep would delete tonight ===");
  const purge = await db.execute(sql`
    SELECT COUNT(*) AS would_delete
      FROM users u
     WHERE u.is_anonymous = TRUE
       AND u.created_at < NOW() - INTERVAL '1 year'
       AND NOT EXISTS (SELECT 1 FROM app_opens a WHERE a.user_id = u.id)
  `);
  console.table(rows(purge));
  console.log("    Of those, how many have REAL activity the predicate ignores:");
  const active = await db.execute(sql`
    SELECT COUNT(*) AS would_delete_despite_activity
      FROM users u
     WHERE u.is_anonymous = TRUE
       AND u.created_at < NOW() - INTERVAL '1 year'
       AND NOT EXISTS (SELECT 1 FROM app_opens a WHERE a.user_id = u.id)
       AND EXISTS (SELECT 1 FROM prayer_sessions s WHERE s.user_id = u.id)
  `);
  console.table(rows(active));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
