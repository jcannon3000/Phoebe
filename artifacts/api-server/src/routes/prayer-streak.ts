/**
 * Daily prayer-list streak.
 *
 * Called once when the user finishes their prayer list. We compute the
 * user's local date (from users.timezone or UTC fallback) and:
 *   - If last_date === today → already logged; no increment, firstToday=false.
 *   - If last_date === yesterday → increment count, firstToday=true.
 *   - Otherwise → reset count to 1, firstToday=true.
 *
 * The route is idempotent: calling it twice on the same day returns the
 * same `streak` number the second time with `firstToday: false`.
 *
 * The client uses `firstToday` to decide whether to show the Duolingo-
 * style celebration — fire once per day, never twice.
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

// Returns YYYY-MM-DD for "now" in the given IANA timezone. Intl formats
// in en-CA for ISO-style YYYY-MM-DD out of the box.
function todayInTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Given a YYYY-MM-DD string, return the previous day's YYYY-MM-DD. Uses
// UTC arithmetic so it's timezone-neutral for pure date math.
function prevDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

router.post("/prayer-streak/log", async (req, res): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [row] = await db
      .select({
        timezone: usersTable.timezone,
        prayerStreakCount: usersTable.prayerStreakCount,
        prayerStreakLastDate: usersTable.prayerStreakLastDate,
      })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUser.id));
    if (!row) { res.status(404).json({ error: "User not found" }); return; }

    const tz = row.timezone || "UTC";
    const today = todayInTz(tz);
    const last = row.prayerStreakLastDate;
    const current = row.prayerStreakCount ?? 0;

    // Already logged today → idempotent read.
    if (last === today) {
      res.json({ streak: current, firstToday: false });
      return;
    }

    // Streak continues if last was yesterday (in TZ-local terms).
    const yesterday = prevDay(today);
    const newCount = last === yesterday ? current + 1 : 1;

    await db
      .update(usersTable)
      .set({
        prayerStreakCount: newCount,
        prayerStreakLastDate: today,
      })
      .where(eq(usersTable.id, sessionUser.id));

    res.json({ streak: newCount, firstToday: true });
  } catch (err) {
    console.error("[prayer-streak:log] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Read-only variant for the dashboard or account page. The dashboard
// fires this query on every home-screen render, so the handler is wrapped
// in try/catch — an unexpected DB hiccup shouldn't blank the whole page.
router.get("/prayer-streak", async (req, res): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [row] = await db
      .select({
        timezone: usersTable.timezone,
        prayerStreakCount: usersTable.prayerStreakCount,
        prayerStreakLastDate: usersTable.prayerStreakLastDate,
      })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUser.id));
    if (!row) { res.status(404).json({ error: "User not found" }); return; }

    const tz = row.timezone || "UTC";
    const today = todayInTz(tz);
    const last = row.prayerStreakLastDate;
    const current = row.prayerStreakCount ?? 0;

    // If the user has a streak but missed yesterday, surface streak=0
    // (the next completion resets anyway). This keeps the dashboard
    // honest: no ghost "7-day streak" badge if they skipped last night.
    const stillActive = last === today || last === prevDay(today);
    res.json({
      streak: stillActive ? current : 0,
      loggedToday: last === today,
      // Both names kept so older layout.tsx callers keep working alongside
      // any newer callers that prefer the snake-cased field.
      lastDate: last ?? null,
      lastPrayedDate: last ?? null,
    });
  } catch (err) {
    console.error("[prayer-streak:get] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
