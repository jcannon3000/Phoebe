import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db, sharedMomentsTable, momentUserTokensTable,
  usersTable, betaUsersTable,
} from "@workspace/db";
import { pool } from "@workspace/db";
import { runBellSender } from "../lib/bellSender";

const router: IRouter = Router();

// Super-admin gate (beta_users.is_admin) — same check newsletter.ts / reports
// use. The fire-now endpoints below trigger a real push to the entire user
// base, so they must be admin-only, not just any logged-in session.
async function isBetaAdmin(userId: number): Promise<boolean> {
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return false;
  try {
    const [beta] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch { return false; }
}

// ─── Auth helper ────────────────────────────────────────────────────────────
function getUser(req: any): { id: number } | null {
  return (req as any).user ?? null;
}

// The Google-Calendar-based Daily Bell (a calendar invite the user accepted/
// declined, polled via the Google Calendar API — GET/PUT /bell/preferences,
// bell_enabled/daily_bell_time/bell_calendar_event_id) was removed entirely
// (owner). The push-based bell below (runBellSender, bell_notifications
// dedup) is unrelated and unaffected.

// ─── GET /api/bell/today — practices for the daily bell landing page ────────
router.get("/bell/today", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    // Get user's timezone and email via raw SQL
    const userResult = await pool.query(`SELECT email, name, timezone FROM users WHERE id = $1`, [user.id]);
    if (userResult.rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
    const u = { email: userResult.rows[0].email as string, name: userResult.rows[0].name as string | null, timezone: userResult.rows[0].timezone as string | null };
    const timezone = u.timezone ?? "America/New_York";

    // Get all practices where this user is a member (matched by email)
    const rows = await db
      .select({
        momentId: sharedMomentsTable.id,
        name: sharedMomentsTable.name,
        intention: sharedMomentsTable.intention,
        templateType: sharedMomentsTable.templateType,
        frequency: sharedMomentsTable.frequency,
        scheduledTime: sharedMomentsTable.scheduledTime,
        dayOfWeek: sharedMomentsTable.dayOfWeek,
        practiceDays: sharedMomentsTable.practiceDays,
        momentToken: sharedMomentsTable.momentToken,
        userToken: momentUserTokensTable.userToken,
        state: sharedMomentsTable.state,
      })
      .from(momentUserTokensTable)
      .innerJoin(sharedMomentsTable, eq(momentUserTokensTable.momentId, sharedMomentsTable.id))
      .where(
        and(
          eq(momentUserTokensTable.email, u.email.toLowerCase()),
          eq(sharedMomentsTable.state, "active"),
        ),
      );

    // Filter to actionable today
    const DOW_LC: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const RRULE_DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

    function getCurrentDayOfWeekInTz(tz: string): number {
      try {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).formatToParts(new Date());
        const name = (parts.find(p => p.type === "weekday")?.value ?? "").toLowerCase();
        return DOW_LC[name] ?? new Date().getDay();
      } catch { return new Date().getDay(); }
    }

    const todayDow = getCurrentDayOfWeekInTz(timezone);

    const actionable = rows.filter((r) => {
      if (r.frequency === "daily") return true;
      if (r.frequency === "weekly") {
        if (r.practiceDays) {
          try {
            const days: string[] = JSON.parse(r.practiceDays);
            if (days.length > 0) return days.some(d => {
              const up = d.toUpperCase();
              if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === todayDow;
              return DOW_LC[d.toLowerCase()] === todayDow;
            });
          } catch {}
        }
        if (r.dayOfWeek) {
          const up = r.dayOfWeek.toUpperCase();
          if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === todayDow;
          return DOW_LC[r.dayOfWeek.toLowerCase()] === todayDow;
        }
      }
      return true;
    });

    res.json({
      userName: u.name ?? "friend",
      timezone,
      practices: actionable.map((r) => ({
        id: r.momentId,
        name: r.name,
        intention: r.intention,
        templateType: r.templateType,
        frequency: r.frequency,
        scheduledTime: r.scheduledTime,
        momentToken: r.momentToken,
        userToken: r.userToken,
      })),
    });
  } catch (err) {
    console.error("GET /api/bell/today error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/bell/clear-today — wipe today's dedup row for caller ─────────
// Debug endpoint. Lets us re-test the scheduled bell path on the same day:
// after firing once via fire-now (or a real scheduled run), the
// bell_notifications row blocks any further sends until tomorrow. This
// removes that row so the next 15-min scheduler tick treats today as fresh.
router.post("/bell/clear-today", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const tzResult = await pool.query(`SELECT timezone FROM users WHERE id = $1`, [user.id]);
    const tz = (tzResult.rows[0]?.timezone as string | null) ?? "America/New_York";
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const r = await pool.query(
      `DELETE FROM bell_notifications WHERE user_id = $1 AND bell_date IN ($2, $3)`,
      [user.id, todayStr, `${todayStr}-evening`],
    );
    res.json({ ok: true, deleted: r.rowCount ?? 0, todayStr });
  } catch (err) {
    console.error("POST /api/bell/clear-today error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/bell/fire-now — immediately send bell to all enabled users ─────
// Debug/admin endpoint. Bypasses the time-window check and the already-sent
// dedup so you can force a push at any time to verify delivery.
router.post("/bell/fire-now", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(user.id))) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await runBellSender({ forceNow: true });
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/bell/fire-now error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
