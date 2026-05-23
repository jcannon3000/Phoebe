/**
 * Admin App Metrics
 *
 * GET /api/admin/metrics — whole-app Today / This Week / All Time
 * tile data. Mirrors the per-community metrics dashboard exactly:
 *
 *   People praying   — distinct users with a prayer event
 *   Times prayed     — total prayer events (15-min dedup, no admin cap)
 *   Offices          — (user, day, morning|evening) office completions
 *                       (Daily Office / Devotion ≥3 slides)
 *   Prayer requests  — total requests created
 *
 * Same SQL semantics as /api/groups/:slug/metrics but without the
 * `members` scope — we don't filter to one community, we roll across
 * every user. The community-side ADMIN_DAILY_PRAYER_CAP is intentionally
 * skipped: the whole point of an admin dashboard is to see real
 * engagement totals, and there's no single "admin" identity in an
 * app-wide rollup.
 *
 * Gated to beta admins (beta_users.is_admin) — same gate the Newsletter
 * / Pilot Users / Reports tools use.
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, betaUsersTable, pool } from "@workspace/db";

const router: IRouter = Router();

type SessionUser = { id: number; email: string };
function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

async function isBetaAdmin(userId: number): Promise<boolean> {
  const [u] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!u) return false;
  try {
    const [beta] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch {
    return false;
  }
}

router.get("/admin/metrics", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(session.id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    // Bucket "today" / "this week" in Eastern Time — Phoebe runs out
    // of ET and admin intuition for "today" is the ET calendar day.
    // Matches the per-community endpoint's choice so the two pages
    // tell the same story.
    const tz = "America/New_York";
    const ymdFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = ymdFmt.format(new Date());
    const [tyStr, tmStr, tdStr] = todayStr.split("-");
    const todayUTC = new Date(Date.UTC(
      parseInt(tyStr, 10),
      parseInt(tmStr, 10) - 1,
      parseInt(tdStr, 10),
    ));
    todayUTC.setUTCDate(todayUTC.getUTCDate() - 6);
    const weekStartStr = todayUTC.toISOString().slice(0, 10);

    const q = await pool.query(`
      WITH session_candidates AS (
        -- Same definition as the community-scoped metrics endpoint,
        -- minus the members CTE: a "prayer event" candidate is an
        -- Amen tap OR an office / devotion completion that reached
        -- ≥3 slides. NULL slides_completed = legacy row pre-dating
        -- the column; treat as qualifying.
        SELECT user_id, occurred_at FROM (
          SELECT a.user_id, a.prayed_at AS occurred_at
          FROM prayer_request_amens a
          WHERE a.prayed_at IS NOT NULL

          UNION ALL

          SELECT ps.user_id, ps.ended_at AS occurred_at
          FROM prayer_sessions ps
          WHERE ps.surface IN (
              'morning-prayer',
              'evening-prayer',
              'morning-devotion',
              'early-evening-devotion'
            )
            AND (ps.slides_completed IS NULL OR ps.slides_completed >= 3)
        ) c
      ),
      session_with_lag AS (
        SELECT
          sc.user_id, sc.occurred_at,
          to_char((sc.occurred_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day,
          LAG(sc.occurred_at) OVER (
            PARTITION BY sc.user_id ORDER BY sc.occurred_at
          ) AS prev_at
        FROM session_candidates sc
      ),
      -- 15-min dedup so a tap-in / tap-out / tap-in burst stays
      -- one event. No admin cap (the community page caps because
      -- a single noisy admin can dominate a small group; at the
      -- app level we want the true total).
      prayer_events AS (
        SELECT user_id, day
        FROM session_with_lag
        WHERE prev_at IS NULL
           OR occurred_at - prev_at > INTERVAL '15 minutes'
      ),
      prayer_days AS (
        SELECT DISTINCT user_id, day FROM prayer_events
      ),
      -- Offices: (user, day, side) tuples. Side is "morning"
      -- (morning-prayer + morning-devotion) or "evening"
      -- (evening-prayer + early-evening-devotion). Max 2 per
      -- person per day.
      office_session_candidates AS (
        SELECT
          ps.user_id,
          ps.ended_at AS occurred_at,
          CASE
            WHEN ps.surface IN ('morning-prayer', 'morning-devotion') THEN 'morning'
            ELSE 'evening'
          END AS side
        FROM prayer_sessions ps
        WHERE ps.surface IN (
            'morning-prayer',
            'evening-prayer',
            'morning-devotion',
            'early-evening-devotion'
          )
          AND (ps.slides_completed IS NULL OR ps.slides_completed >= 3)
      ),
      office_days AS (
        SELECT DISTINCT
          user_id,
          side,
          to_char((occurred_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day
        FROM office_session_candidates
      )
      SELECT
        (SELECT COUNT(*) FROM users)::int AS total_users,

        (SELECT COUNT(*) FROM prayer_requests)::int AS prayer_requests_total,
        (SELECT COUNT(*) FROM prayer_requests
           WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $1)::int AS prayer_requests_today,
        (SELECT COUNT(*) FROM prayer_requests
           WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $2)::int AS prayer_requests_week,

        -- Distinct users praying in each window.
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days WHERE day >= $1)::int AS prayed_today,
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days WHERE day >= $2)::int AS prayed_week,
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days)::int AS prayed_all_time,

        -- Times prayed (15-min-deduped events).
        (SELECT COUNT(*) FROM prayer_events WHERE day >= $1)::int AS times_prayed_today,
        (SELECT COUNT(*) FROM prayer_events WHERE day >= $2)::int AS times_prayed_week,
        (SELECT COUNT(*) FROM prayer_events)::int AS times_prayed_total,

        -- Offices.
        (SELECT COUNT(*) FROM office_days WHERE day >= $1)::int AS offices_today,
        (SELECT COUNT(*) FROM office_days WHERE day >= $2)::int AS offices_week,
        (SELECT COUNT(*) FROM office_days)::int AS offices_total,

        -- New signups in each window — handy app-level signal.
        (SELECT COUNT(*) FROM users
           WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $1)::int AS new_users_today,
        (SELECT COUNT(*) FROM users
           WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $2)::int AS new_users_week
    `, [todayStr, weekStartStr, tz]);

    const row = q.rows[0] ?? {};
    res.json({
      totalUsers: Number(row.total_users ?? 0),
      newUsersToday: Number(row.new_users_today ?? 0),
      newUsersThisWeek: Number(row.new_users_week ?? 0),

      prayedToday: Number(row.prayed_today ?? 0),
      prayedThisWeek: Number(row.prayed_week ?? 0),
      prayedAllTime: Number(row.prayed_all_time ?? 0),

      timesPrayedToday: Number(row.times_prayed_today ?? 0),
      timesPrayedThisWeek: Number(row.times_prayed_week ?? 0),
      timesPrayedTotal: Number(row.times_prayed_total ?? 0),

      officesToday: Number(row.offices_today ?? 0),
      officesThisWeek: Number(row.offices_week ?? 0),
      officesTotal: Number(row.offices_total ?? 0),

      prayerRequestsToday: Number(row.prayer_requests_today ?? 0),
      prayerRequestsThisWeek: Number(row.prayer_requests_week ?? 0),
      prayerRequestsTotal: Number(row.prayer_requests_total ?? 0),
    });
  } catch (err) {
    console.error("[admin/metrics] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
