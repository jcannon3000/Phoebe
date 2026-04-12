import { Router, type IRouter } from "express";
import { getUserCalendarEvents } from "../lib/calendar";

const router: IRouter = Router();

// GET /gatherings/calendar-events
// Returns the authenticated user's Google Calendar events for the next 60 days.
// Requires that the user has connected their calendar via /api/auth/google/calendar.
router.get("/gatherings/calendar-events", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const userId = (req.user as { id: number }).id;
  const daysAhead = Math.min(Number(req.query.days ?? 60), 180);

  try {
    const events = await getUserCalendarEvents(userId, daysAhead);
    res.json(events);
  } catch (err) {
    console.error("calendar-events error:", err);
    res.status(500).json({ error: "Failed to fetch calendar events" });
  }
});

export default router;
