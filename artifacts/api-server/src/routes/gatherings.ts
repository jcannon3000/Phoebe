import { Router, type IRouter } from "express";
import { db, calendarSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { parseIcal, normalizeCalendarUrl, type ICalEvent } from "../lib/ical";

const router: IRouter = Router();

// ─── List subscriptions for the current user ──────────────────────────────────
router.get("/gatherings/calendars", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const subs = await db
    .select()
    .from(calendarSubscriptionsTable)
    .where(eq(calendarSubscriptionsTable.userId, userId));
  res.json(subs);
});

// ─── Add a public calendar subscription ──────────────────────────────────────
// Body: { url: string, name?: string, colorHex?: string }
// Accepts any public iCal URL or a Google Calendar public URL (auto-converted).
router.post("/gatherings/calendars", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const rawUrl = (req.body.url as string | undefined)?.trim() ?? "";
  if (!rawUrl) { res.status(400).json({ error: "url is required" }); return; }

  const url = normalizeCalendarUrl(rawUrl);

  // Quick validation: try to fetch a few events to confirm it works
  let calendarName = (req.body.name as string | undefined)?.trim() ?? "";
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) {
      res.status(400).json({ error: "Could not fetch that calendar. Make sure it's public." });
      return;
    }
    const text = await resp.text();
    if (!text.includes("BEGIN:VCALENDAR")) {
      res.status(400).json({ error: "That URL doesn't look like a calendar feed. Try copying the iCal link." });
      return;
    }
    // Auto-detect calendar name from X-WR-CALNAME if not provided
    if (!calendarName) {
      const match = text.match(/X-WR-CALNAME:(.+)/);
      calendarName = match ? match[1].trim() : "Calendar";
    }
  } catch {
    res.status(400).json({ error: "Could not reach that calendar URL. Make sure it's public and accessible." });
    return;
  }

  const [sub] = await db
    .insert(calendarSubscriptionsTable)
    .values({
      userId,
      url,
      name: calendarName,
      colorHex: (req.body.colorHex as string | undefined) ?? null,
    })
    .returning();

  res.status(201).json(sub);
});

// ─── Remove a subscription ────────────────────────────────────────────────────
router.delete("/gatherings/calendars/:id", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const id = Number(req.params.id);
  await db
    .delete(calendarSubscriptionsTable)
    .where(and(
      eq(calendarSubscriptionsTable.id, id),
      eq(calendarSubscriptionsTable.userId, userId),
    ));
  res.json({ ok: true });
});

// ─── Fetch events from all subscribed calendars ───────────────────────────────
// Returns upcoming events across all the user's subscribed public calendars.
router.get("/gatherings/calendar-events", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;

  const subs = await db
    .select()
    .from(calendarSubscriptionsTable)
    .where(eq(calendarSubscriptionsTable.userId, userId));

  if (subs.length === 0) { res.json([]); return; }

  const now = new Date();
  const future = new Date(now.getTime() + 90 * 86400000); // 90 days ahead

  const allEvents: Array<ICalEvent & {
    subscriptionId: number;
    calendarName: string;
    colorHex: string | null;
  }> = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      const resp = await fetch(sub.url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return;
      const text = await resp.text();
      const events = parseIcal(text);

      for (const ev of events) {
        // Skip events outside our window
        const startDate = new Date(ev.start);
        if (isNaN(startDate.getTime())) continue;
        if (startDate > future) continue;

        const endDate = ev.end ? new Date(ev.end) : startDate;
        // Include events that haven't ended yet
        if (!isNaN(endDate.getTime()) && endDate < now && !ev.allDay) continue;
        // For all-day events, include if start >= today
        if (ev.allDay && startDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) continue;

        allEvents.push({
          ...ev,
          subscriptionId: sub.id,
          calendarName: sub.name,
          colorHex: sub.colorHex,
        });
      }
    } catch { /* skip unreachable calendars silently */ }
  }));

  allEvents.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  res.json(allEvents);
});

export default router;
