import { Router, type IRouter } from "express";
import { eq, and, inArray, asc, desc, isNull } from "drizzle-orm";
import {
  db, sharedMomentsTable, momentUserTokensTable,
  groupsTable, groupMembersTable, circleDailyFocusTable, circleIntentionsTable, usersTable,
  betaUsersTable,
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

    // ── Prayer Circles (beta) — surface today's focus alongside practices.
    // For every circle group this user is a member of, include the stated
    // intention plus today's focus entries (in the viewer's timezone). The
    // existing bell cadence / delivery mechanism is untouched — we only
    // enrich the payload the bell screen renders.
    //
    // `focusDate` is stored in the adder's timezone; we match against the
    // *viewer's* "today". During the overlap window between timezones a
    // circle member may briefly see yesterday's or tomorrow's focus — a
    // known beta limitation we accept to keep the schema simple.
    const circles = await (async () => {
      try {
        // Find circle groups this user belongs to. We match via user id first
        // (the modern linkage), falling back to email to catch legacy rows
        // whose userId wasn't stitched back on signup.
        const memberRows = await db
          .select({
            groupId: groupsTable.id,
            groupName: groupsTable.name,
            groupSlug: groupsTable.slug,
            groupEmoji: groupsTable.emoji,
            intention: groupsTable.intention,
          })
          .from(groupMembersTable)
          .innerJoin(groupsTable, eq(groupMembersTable.groupId, groupsTable.id))
          .where(and(
            eq(groupsTable.isPrayerCircle, true),
            eq(groupMembersTable.userId, user.id),
          ));

        if (memberRows.length === 0) return [];

        // Today in the *viewer's* timezone, in the same YYYY-MM-DD format the
        // focus table stores.
        const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());

        const groupIds = memberRows.map(r => r.groupId);
        const focusRows = await db.select().from(circleDailyFocusTable)
          .where(and(
            inArray(circleDailyFocusTable.groupId, groupIds),
            eq(circleDailyFocusTable.focusDate, todayStr),
          ))
          .orderBy(desc(circleDailyFocusTable.createdAt));

        // Active intentions (all non-archived rows) for each of this user's
        // circles. Falls back silently to [] if the table isn't migrated yet.
        let intentionRows: Array<{
          id: number;
          groupId: number;
          title: string;
          description: string | null;
        }> = [];
        try {
          const rows = await db.select({
            id: circleIntentionsTable.id,
            groupId: circleIntentionsTable.groupId,
            title: circleIntentionsTable.title,
            description: circleIntentionsTable.description,
          }).from(circleIntentionsTable)
            .where(and(
              inArray(circleIntentionsTable.groupId, groupIds),
              isNull(circleIntentionsTable.archivedAt),
            ))
            .orderBy(asc(circleIntentionsTable.sortOrder), asc(circleIntentionsTable.createdAt));
          intentionRows = rows;
        } catch (err) {
          console.error("[bell] intentions query failed, falling back to legacy:", err);
        }

        // Enrich subject users in a single query so each focus row can render
        // the avatar + name without an N+1 fan-out.
        const subjectIds = Array.from(new Set(
          focusRows.map(r => r.subjectUserId).filter((x): x is number => x != null),
        ));
        const profiles = subjectIds.length > 0
          ? await db.select({
              id: usersTable.id,
              name: usersTable.name,
              avatarUrl: usersTable.avatarUrl,
            }).from(usersTable).where(inArray(usersTable.id, subjectIds))
          : [];
        const profileById = new Map(profiles.map(p => [p.id, p]));

        return memberRows.map(g => {
          const groupIntentions = intentionRows.filter(i => i.groupId === g.groupId)
            .map(i => ({ id: i.id, title: i.title, description: i.description }));
          // Legacy fallback: if the new table has no rows (e.g. migration
          // hasn't run or all intentions archived) but groups.intention still
          // holds the original single value, surface it so the bell isn't
          // empty for existing circles.
          const intentions = groupIntentions.length > 0
            ? groupIntentions
            : (g.intention && g.intention.trim().length > 0
                ? [{ id: 0, title: g.intention, description: null as string | null }]
                : []);
          return {
            groupId: g.groupId,
            groupName: g.groupName,
            groupSlug: g.groupSlug,
            groupEmoji: g.groupEmoji,
            // Legacy single-string field kept for any older clients still on it.
            intention: g.intention,
            intentions,
            focus: focusRows
              .filter(f => f.groupId === g.groupId)
              .map(f => {
                const subject = f.subjectUserId != null ? profileById.get(f.subjectUserId) ?? null : null;
                return {
                  id: f.id,
                  focusType: f.focusType,
                  subjectName: subject?.name ?? null,
                  subjectAvatarUrl: subject?.avatarUrl ?? null,
                  subjectText: f.subjectText,
                };
              }),
          };
        });
      } catch (err) {
        // Never let a circles query failure break the daily bell — log and
        // fall back to an empty list so the screen still renders practices.
        console.error("[bell] circles surfacing failed:", err);
        return [];
      }
    })();

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
      circles,
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
