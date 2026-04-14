import { Router, type IRouter } from "express";
import { eq, and, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, usersTable, betaUsersTable,
  sharedMomentsTable, momentUserTokensTable,
} from "@workspace/db";
import { createCalendarEvent, deleteCalendarEvent, getCalendarEventAttendees } from "../lib/calendar";

const router: IRouter = Router();

const APP_URL = process.env["APP_URL"] ?? "https://withphoebe.app";

// ─── Auth helper ────────────────────────────────────────────────────────────
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
        email: usersTable.email,
        bellEnabled: usersTable.bellEnabled,
        dailyBellTime: usersTable.dailyBellTime,
        timezone: usersTable.timezone,
        bellCalendarEventId: usersTable.bellCalendarEventId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id));

    if (!u) { res.status(404).json({ error: "User not found" }); return; }

    // Check if the calendar event is actually active (user accepted it)
    let calendarStatus: "active" | "pending" | "declined" | "none" = "none";
    if (u.bellEnabled && u.bellCalendarEventId) {
      try {
        const attendees = await getCalendarEventAttendees(user.id, u.bellCalendarEventId);
        if (attendees) {
          const me = attendees.find(a => a.email.toLowerCase() === u.email.toLowerCase());
          if (me?.responseStatus === "accepted") calendarStatus = "active";
          else if (me?.responseStatus === "declined") calendarStatus = "declined";
          else if (me?.responseStatus === "tentative" || me?.responseStatus === "needsAction") calendarStatus = "pending";
          else calendarStatus = "pending";
        } else {
          // Event not found — it was deleted from their calendar
          calendarStatus = "none";
          // Clean up the stale reference
          await db.update(usersTable)
            .set({ bellEnabled: false, bellCalendarEventId: null })
            .where(eq(usersTable.id, user.id));
        }
      } catch {
        calendarStatus = "pending";
      }
    }

    res.json({
      bellEnabled: u.bellEnabled,
      dailyBellTime: u.dailyBellTime ?? "07:00",
      timezone: u.timezone ?? "America/New_York",
      calendarStatus,
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

    // Get current user state
    const [u] = await db.select({
      email: usersTable.email,
      name: usersTable.name,
      bellEnabled: usersTable.bellEnabled,
      bellCalendarEventId: usersTable.bellCalendarEventId,
    }).from(usersTable).where(eq(usersTable.id, user.id));

    if (!u) { res.status(404).json({ error: "User not found" }); return; }

    const turningOn = parsed.bellEnabled && !u.bellEnabled;
    const turningOff = !parsed.bellEnabled && u.bellEnabled;
    const changingTime = parsed.bellEnabled && u.bellEnabled && u.bellCalendarEventId;

    // ── Delete old bell calendar event if turning off or changing time ──
    if ((turningOff || changingTime) && u.bellCalendarEventId) {
      try {
        await deleteCalendarEvent(user.id, u.bellCalendarEventId);
      } catch { /* event may already be gone */ }
      await db.update(usersTable)
        .set({ bellCalendarEventId: null })
        .where(eq(usersTable.id, user.id));
    }

    // ── When turning ON: remove all practice-specific calendar events ──
    if (turningOn) {
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
          } catch { /* non-fatal */ }
          await db.update(momentUserTokensTable)
            .set({ googleCalendarEventId: null })
            .where(eq(momentUserTokensTable.id, t.id));
        }
        console.log(`[bell] Removed ${removed} practice calendar events for user ${user.id}`);
      } catch (err) {
        console.error("[bell] Calendar cleanup error (non-fatal):", err);
      }
    }

    // ── Create bell calendar event if turning on or changing time ──
    let bellCalendarEventId: string | null = null;
    if (parsed.bellEnabled) {
      try {
        const [hh, mm] = parsed.dailyBellTime.split(":").map(Number);
        const tz = parsed.timezone;

        // Build a start time for today at the bell time in the user's timezone
        const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
        const startLocalStr = `${todayStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
        // 15-minute event
        const endMm = mm + 15;
        const endHh = hh + Math.floor(endMm / 60);
        const endLocalStr = `${todayStr}T${String(endHh).padStart(2, "0")}:${String(endMm % 60).padStart(2, "0")}:00`;

        bellCalendarEventId = await createCalendarEvent(user.id, {
          summary: `🔔 Daily Bell — Phoebe`,
          description: [
            `Your daily moment to pause and practice.`,
            ``,
            `Open your practices: ${APP_URL}/bell`,
          ].join("\n"),
          startDate: new Date(),
          startLocalStr,
          endLocalStr,
          attendees: [u.email],
          timeZone: tz,
          recurrence: ["RRULE:FREQ=DAILY"],
          colorId: "2",
          reminders: [
            { method: "popup", minutes: 0 },
          ],
        }).catch((err) => {
          console.error("[bell] Calendar event creation failed:", err);
          return null;
        });

        if (bellCalendarEventId) {
          console.log(`[bell] Created daily bell calendar event ${bellCalendarEventId} for user ${user.id}`);
        }
      } catch (err) {
        console.error("[bell] Calendar event creation error:", err);
      }
    }

    // ── Save preferences ──
    await db.update(usersTable).set({
      bellEnabled: parsed.bellEnabled,
      dailyBellTime: parsed.dailyBellTime,
      timezone: parsed.timezone,
      ...(bellCalendarEventId ? { bellCalendarEventId } : {}),
      ...(!parsed.bellEnabled ? { bellCalendarEventId: null } : {}),
    }).where(eq(usersTable.id, user.id));

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
      if (r.templateType === "lectio-divina") return todayDow >= 1 && todayDow <= 6;
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

export default router;
