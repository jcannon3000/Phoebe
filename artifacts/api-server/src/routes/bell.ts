import { Router, type IRouter } from "express";
import { eq, and, inArray, asc, desc, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, sharedMomentsTable, momentUserTokensTable,
  groupsTable, groupMembersTable, circleDailyFocusTable, circleIntentionsTable, usersTable,
} from "@workspace/db";
import { pool } from "@workspace/db";
import { deleteCalendarEvent, getCalendarEventAttendees, findActiveBellEventForUser } from "../lib/calendar";
import { runBellSender } from "../lib/bellSender";

const router: IRouter = Router();

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
    let calendarStatus: "active" | "pending" | "tentative" | "declined" | "ics-pending" | "none" = "none";
    // Bell is enabled but we have no Google event ID — the only
    // creation path left is the ICS email fallback, which doesn't
    // give us an RSVP-pollable event. Report it as "ics-pending" so
    // the UI can render an honest "invite emailed, open it to add to
    // your calendar" state instead of the harsh "didn't send" error.
    if (u.bellEnabled && !u.bellCalendarEventId) {
      calendarStatus = "ics-pending";
    }
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
// Push-only since the calendar-invite path was retired. Granting push
// permission auto-enables the bell at 07:00 (see /api/push/device-token);
// this endpoint stays for users who want to change time / disable.
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

    await updateBellPrefs(user.id, {
      bellEnabled: parsed.bellEnabled,
      dailyBellTime: parsed.dailyBellTime,
      timezone: parsed.timezone,
      bellCalendarEventId: null,
    });

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
    const u = await getBellUser(user.id);
    const tz = u?.timezone ?? "America/New_York";
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
  try {
    await runBellSender({ forceNow: true });
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/bell/fire-now error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
