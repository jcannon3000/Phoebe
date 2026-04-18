import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, sharedMomentsTable, momentUserTokensTable,
} from "@workspace/db";
import { pool } from "@workspace/db";
import { createCalendarEvent, deleteCalendarEvent, getCalendarEventAttendees, findActiveBellEventForUser } from "../lib/calendar";

const router: IRouter = Router();

const APP_URL = process.env["APP_URL"] ?? "https://withphoebe.app";

// ─── Auth helper ────────────────────────────────────────────────────────────
function getUser(req: any): { id: number } | null {
  return (req as any).user ?? null;
}

// ─── Raw SQL helpers for bell columns (avoids Drizzle schema sync issues) ───

async function getBellUser(userId: number) {
  const result = await pool.query(
    `SELECT email, name, bell_enabled, daily_bell_time, timezone, bell_calendar_event_id
     FROM users WHERE id = $1`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    email: r.email as string,
    name: r.name as string | null,
    bellEnabled: r.bell_enabled as boolean,
    dailyBellTime: r.daily_bell_time as string | null,
    timezone: r.timezone as string | null,
    bellCalendarEventId: r.bell_calendar_event_id as string | null,
  };
}

async function updateBellPrefs(userId: number, prefs: {
  bellEnabled: boolean;
  dailyBellTime: string;
  timezone: string;
  bellCalendarEventId?: string | null;
}) {
  await pool.query(
    `UPDATE users SET bell_enabled = $1, daily_bell_time = $2, timezone = $3, bell_calendar_event_id = $4 WHERE id = $5`,
    [prefs.bellEnabled, prefs.dailyBellTime, prefs.timezone, prefs.bellCalendarEventId ?? null, userId],
  );
}

// ─── GET /api/bell/preferences — get current bell settings ──────────────────
router.get("/bell/preferences", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const u = await getBellUser(user.id);
    if (!u) { res.status(404).json({ error: "User not found" }); return; }

    // Check if the calendar event is actually active (user accepted it).
    //
    // We ONLY reset the user's saved preferences when we have positive
    // evidence the user no longer wants the bell — i.e. their RSVP is
    // explicitly "declined". A null/throw from the Google API (which can
    // happen for any transient reason: 5xx, rate limit, OAuth refresh
    // glitch, scheduler-side 404 if the event was deleted out of band)
    // must NOT silently nuke the user's preferences. This was the bug
    // that erased people's bell settings while leaving the calendar
    // event intact. When in doubt we report "pending" and keep the
    // saved prefs as-is.
    let calendarStatus: "active" | "pending" | "tentative" | "declined" | "none" = "none";
    if (u.bellEnabled && u.bellCalendarEventId) {
      try {
        const attendees = await getCalendarEventAttendees(user.id, u.bellCalendarEventId);
        if (attendees) {
          const me = attendees.find(a => a.email.toLowerCase() === u.email.toLowerCase());
          if (me?.responseStatus === "accepted") calendarStatus = "active";
          else if (me?.responseStatus === "tentative") calendarStatus = "tentative";
          else if (me?.responseStatus === "declined") {
            // Positive evidence: user removed the bell from their calendar.
            calendarStatus = "none";
            try { await deleteCalendarEvent(user.id, u.bellCalendarEventId!); } catch { /* may already be gone */ }
            await updateBellPrefs(user.id, {
              bellEnabled: false, dailyBellTime: u.dailyBellTime ?? "07:00",
              timezone: u.timezone ?? "America/New_York", bellCalendarEventId: null,
            });
            console.log(`[bell] User ${user.id} declined bell event — prefs reset.`);
          }
          else calendarStatus = "pending";
        } else {
          // No response from Google — treat as pending and leave prefs alone.
          // The user clearly opted in (bellEnabled is true in our DB), so we
          // trust that until we hear an explicit "declined".
          calendarStatus = "pending";
          console.warn(
            `[bell] getCalendarEventAttendees returned null for user ${user.id} ` +
            `(event ${u.bellCalendarEventId}) — assuming transient and keeping prefs intact.`,
          );
        }
      } catch (err) {
        calendarStatus = "pending";
        console.warn(`[bell] attendee lookup threw for user ${user.id}:`, err);
      }
    }

    let bellEnabled = u.bellEnabled;
    let resolvedTime = u.dailyBellTime ?? "07:00";
    let resolvedTz = u.timezone ?? "America/New_York";

    // ── Auto-recovery: scan the scheduler calendar for an accepted, active,
    // recurring "Daily Bell" invite for this user. The calendar is the
    // source of truth — if our DB cache lost the event ID (the old reset
    // bug, a manual cleanup, anything), the bell heals itself the next
    // time the user opens any page that hits this endpoint.
    //
    // Two recovery cases:
    //   1. DB says enabled, but the event we have stored is unreachable
    //      (calendarStatus came back "pending" from the block above).
    //   2. DB says disabled — the user might have been silently reset by
    //      the old bug and the calendar event still exists.
    const needsRecovery = !bellEnabled || calendarStatus === "pending";
    if (needsRecovery) {
      try {
        const found = await findActiveBellEventForUser(u.email);
        if (found) {
          // Avoid re-linking to the same event that just failed (case 1 with
          // a transient API issue): if the stored ID matches what we found,
          // the lookup is just flapping — keep prefs as-is, don't overwrite.
          const isSameEvent = found.eventId === u.bellCalendarEventId;
          if (!isSameEvent || !bellEnabled) {
            await updateBellPrefs(user.id, {
              bellEnabled: true,
              dailyBellTime: found.localTime,
              timezone: found.timeZone,
              bellCalendarEventId: found.eventId,
            });
            bellEnabled = true;
            resolvedTime = found.localTime;
            resolvedTz = found.timeZone;
            calendarStatus = "active";
            console.log(
              `[bell] Auto-recovered bell for user ${user.id} — relinked to event ${found.eventId} ` +
              `(${found.localTime} ${found.timeZone}).`,
            );
          } else if (isSameEvent) {
            // Same event found via search but the per-event get failed —
            // promote status to active, the search succeeded.
            calendarStatus = "active";
          }
        }
      } catch (err) {
        console.warn(`[bell] auto-recovery scan failed for user ${user.id}:`, err);
      }
    }

    res.json({
      bellEnabled,
      dailyBellTime: resolvedTime,
      timezone: resolvedTz,
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


    const schema = z.object({
      bellEnabled: z.boolean(),
      dailyBellTime: z.string().regex(/^\d{2}:\d{2}$/),
      timezone: z.string().min(1),
    });

    const parsed = schema.parse(req.body);
    console.log(`[bell] PUT preferences for user ${user.id}:`, parsed);

    // Get current user state via raw SQL
    const u = await getBellUser(user.id);
    if (!u) { res.status(404).json({ error: "User not found" }); return; }

    const turningOn = parsed.bellEnabled && !u.bellEnabled;
    const turningOff = !parsed.bellEnabled && u.bellEnabled;
    const changingTime = parsed.bellEnabled && u.bellEnabled && u.bellCalendarEventId;

    // ── Delete old bell calendar event if turning off or changing time ──
    if ((turningOff || changingTime) && u.bellCalendarEventId) {
      try {
        await deleteCalendarEvent(user.id, u.bellCalendarEventId);
        console.log(`[bell] Deleted old bell event ${u.bellCalendarEventId}`);
      } catch { /* event may already be gone */ }
      await pool.query(`UPDATE users SET bell_calendar_event_id = NULL WHERE id = $1`, [user.id]);
    }

    // ── When turning ON: remove ALL calendar events (practices, letters, gatherings) ──
    if (turningOn) {
      let removed = 0;

      // 1. Practice-level calendar events (moment_user_tokens)
      try {
        const tokensResult = await pool.query(
          `SELECT id, google_calendar_event_id FROM moment_user_tokens
           WHERE LOWER(email) = LOWER($1) AND google_calendar_event_id IS NOT NULL`,
          [u.email],
        );
        for (const t of tokensResult.rows) {
          if (!t.google_calendar_event_id) continue;
          try { await deleteCalendarEvent(user.id, t.google_calendar_event_id); removed++; } catch { /* non-fatal */ }
          await pool.query(`UPDATE moment_user_tokens SET google_calendar_event_id = NULL WHERE id = $1`, [t.id]);
        }
      } catch (err) {
        console.error("[bell] moment_user_tokens cleanup error (non-fatal):", err);
      }

      // 2. Per-window/letter calendar events (moment_calendar_events)
      try {
        // Find moment_member IDs for this user's email
        const memberResult = await pool.query(
          `SELECT mut.id AS token_id, mce.id AS mce_id, mce.google_calendar_event_id
           FROM moment_user_tokens mut
           JOIN moment_calendar_events mce ON mce.moment_member_id = mut.id
           WHERE LOWER(mut.email) = LOWER($1) AND mce.google_calendar_event_id IS NOT NULL`,
          [u.email],
        );
        for (const r of memberResult.rows) {
          if (!r.google_calendar_event_id) continue;
          try { await deleteCalendarEvent(user.id, r.google_calendar_event_id); removed++; } catch { /* non-fatal */ }
          await pool.query(`UPDATE moment_calendar_events SET google_calendar_event_id = NULL WHERE id = $1`, [r.mce_id]);
        }
      } catch (err) {
        console.error("[bell] moment_calendar_events cleanup error (non-fatal):", err);
      }

      // 3. Gathering/meetup calendar events (meetups) — for rituals the user created
      try {
        const meetupsResult = await pool.query(
          `SELECT m.id, m.google_calendar_event_id
           FROM meetups m
           JOIN rituals r ON r.id = m.ritual_id
           WHERE r.created_by = $1 AND m.google_calendar_event_id IS NOT NULL`,
          [user.id],
        );
        for (const r of meetupsResult.rows) {
          if (!r.google_calendar_event_id) continue;
          try { await deleteCalendarEvent(user.id, r.google_calendar_event_id); removed++; } catch { /* non-fatal */ }
          await pool.query(`UPDATE meetups SET google_calendar_event_id = NULL WHERE id = $1`, [r.id]);
        }
      } catch (err) {
        console.error("[bell] meetups cleanup error (non-fatal):", err);
      }

      console.log(`[bell] Removed ${removed} total calendar events for user ${user.id}`);
    }

    // ── Create bell calendar event if turning on or changing time ──
    let bellCalendarEventId: string | null = null;
    if (parsed.bellEnabled) {
      try {
        const [hh, mm] = parsed.dailyBellTime.split(":").map(Number);
        const tz = parsed.timezone;

        const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
        const startLocalStr = `${todayStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
        const endMm = mm + 5;
        const endHh = hh + Math.floor(endMm / 60);
        const endLocalStr = `${todayStr}T${String(endHh).padStart(2, "0")}:${String(endMm % 60).padStart(2, "0")}:00`;

        console.log(`[bell] Creating calendar event: ${startLocalStr} - ${endLocalStr} in ${tz}`);

        bellCalendarEventId = await createCalendarEvent(user.id, {
          summary: `🔔 Daily Bell — Phoebe`,
          description: [
            `A daily time to pause and pray with your community.`,
            ``,
            `Open Phoebe: ${APP_URL}`,
          ].join("\n"),
          startDate: new Date(),
          startLocalStr,
          endLocalStr,
          attendees: [u.email],
          timeZone: tz,
          recurrence: ["RRULE:FREQ=DAILY"],
          colorId: "2",
          transparency: "transparent",
          reminders: [
            { method: "popup", minutes: 0 },
          ],
        }).catch((err) => {
          console.error("[bell] Calendar event creation failed:", err);
          return null;
        });

        console.log(`[bell] Calendar event result: ${bellCalendarEventId ?? "null (no event created)"}`);
      } catch (err) {
        console.error("[bell] Calendar event creation error:", err);
      }
    }

    // ── Save preferences via raw SQL ──
    await updateBellPrefs(user.id, {
      bellEnabled: parsed.bellEnabled,
      dailyBellTime: parsed.dailyBellTime,
      timezone: parsed.timezone,
      bellCalendarEventId: parsed.bellEnabled ? bellCalendarEventId : null,
    });

    console.log(`[bell] Saved preferences for user ${user.id}, bellEnabled=${parsed.bellEnabled}`);
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
