import { Router, type IRouter } from "express";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, usersTable, betaUsersTable,
  sharedMomentsTable, momentUserTokensTable,
} from "@workspace/db";
import { deleteCalendarEvent } from "../lib/calendar";

const router: IRouter = Router();

// ─── Auth helper (same pattern as other routes) ─────────────────────────────
function getUser(req: any): { id: number } | null {
  return (req as any).user ?? null;
}

// ─── Check if user is beta ──────────────────────────────────────────────────
async function isUserBeta(userId: number): Promise<boolean> {
  try {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
    if (!u) return false;
    const [beta] = await db.select().from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return !!beta;
  } catch { return false; }
}

// ─── GET /api/bell/preferences — get current bell settings ──────────────────
router.get("/bell/preferences", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [u] = await db
      .select({
        bellEnabled: usersTable.bellEnabled,
        dailyBellTime: usersTable.dailyBellTime,
        timezone: usersTable.timezone,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id));

    if (!u) { res.status(404).json({ error: "User not found" }); return; }

    res.json({
      bellEnabled: u.bellEnabled,
      dailyBellTime: u.dailyBellTime ?? "07:00",
      timezone: u.timezone ?? "America/New_York",
    });
  } catch (err) {
    console.error("GET /api/bell/preferences error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /api/bell/preferences — update bell settings ───────────────────────
router.put("/bell/preferences", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    // Beta-only
    if (!(await isUserBeta(user.id))) {
      res.status(403).json({ error: "Beta access required" });
      return;
    }

    const schema = z.object({
      bellEnabled: z.boolean(),
      dailyBellTime: z.string().regex(/^\d{2}:\d{2}$/),
      timezone: z.string().min(1),
    });

    const parsed = schema.parse(req.body);

    // Get user email for moment lookups
    const [u] = await db.select({ email: usersTable.email, bellEnabled: usersTable.bellEnabled })
      .from(usersTable).where(eq(usersTable.id, user.id));

    await db.update(usersTable).set({
      bellEnabled: parsed.bellEnabled,
      dailyBellTime: parsed.dailyBellTime,
      timezone: parsed.timezone,
    }).where(eq(usersTable.id, user.id));

    // When bell is turned ON, remove all existing practice calendar events
    if (parsed.bellEnabled && u && !u.bellEnabled) {
      try {
        const tokens = await db
          .select({
            id: momentUserTokensTable.id,
            googleCalendarEventId: momentUserTokensTable.googleCalendarEventId,
          })
          .from(momentUserTokensTable)
          .where(
            and(
              eq(momentUserTokensTable.email, u.email.toLowerCase()),
              isNotNull(momentUserTokensTable.googleCalendarEventId),
            ),
          );

        let removed = 0;
        for (const t of tokens) {
          if (!t.googleCalendarEventId) continue;
          try {
            await deleteCalendarEvent(user.id, t.googleCalendarEventId);
            removed++;
          } catch {
            // Non-fatal — event may already be deleted
          }
          await db.update(momentUserTokensTable)
            .set({ googleCalendarEventId: null })
            .where(eq(momentUserTokensTable.id, t.id));
        }
        console.log(`[bell] Removed ${removed} calendar events for user ${user.id}`);
      } catch (err) {
        console.error("[bell] Calendar cleanup error (non-fatal):", err);
      }
    }

    res.json({ ok: true, ...parsed });
  } catch (err) {
    console.error("PUT /api/bell/preferences error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /api/bell/today — practices for the daily bell landing page ────────
router.get("/bell/today", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    // Get user's timezone and email
    const [u] = await db.select({ timezone: usersTable.timezone, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) { res.status(404).json({ error: "User not found" }); return; }
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
      // Lectio: Mon-Sat
      if (r.templateType === "lectio-divina") return todayDow >= 1 && todayDow <= 6;
      // Daily: always
      if (r.frequency === "daily") return true;
      // Weekly: check practice days
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

export default router;
