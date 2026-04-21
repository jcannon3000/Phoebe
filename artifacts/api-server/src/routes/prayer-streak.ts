/**
 * Daily prayer-list streak — write endpoint.
 *
 * The GET lives in moments.ts (registered first, so it wins), and it counts
 * distinct windowDate rows in moment_posts where isCheckin=1 — that's the
 * authoritative source of truth because handleDone in prayer-mode.tsx writes
 * one isCheckin row per intercession the moment the user taps "Done".
 *
 * This POST fires slightly earlier — when the user lands on the closing
 * slide, before handleDone. It exists for the celebration flow only:
 *   - If today is already in the check-in set, firstToday=false; the client
 *     doesn't pop the celebration.
 *   - If today is NOT yet in the set, firstToday=true and streak = existing
 *     streak + 1 (because handleDone is about to write today's rows, which
 *     will land in /api/moments + /api/prayer-streak on the next query).
 *
 * We intentionally do NOT write to users.prayer_streak_count /
 * users.prayer_streak_last_date here. Those columns are vestigial — the
 * overshadowed GET below read them and returned them as `loggedToday`, but
 * since Express registers moments.ts first the GET is unreachable. Leaving
 * those columns alone also means a failed POST doesn't corrupt anything: on
 * the next render the moments-based GET computes the truth from posts.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, usersTable, momentUserTokensTable, momentPostsTable } from "@workspace/db";

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

function stepBack(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1) - 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

router.post("/prayer-streak/log", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [u] = await db
      .select({ email: usersTable.email, timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUser.id));
    if (!u) { res.status(404).json({ error: "User not found" }); return; }

    const tz = u.timezone || "UTC";
    const today = todayInTz(tz);
    const emailLower = u.email.toLowerCase();

    // Collect every userToken that belongs to this user across all moments.
    const tokens = await db
      .select({ userToken: momentUserTokensTable.userToken, email: momentUserTokensTable.email })
      .from(momentUserTokensTable);
    const myTokens = tokens
      .filter(t => (t.email || "").toLowerCase() === emailLower)
      .map(t => t.userToken);

    // No tokens = first moment ever = streak 1 after handleDone fires.
    if (myTokens.length === 0) {
      res.json({ streak: 1, firstToday: true });
      return;
    }

    const rows = await db
      .select({ windowDate: momentPostsTable.windowDate })
      .from(momentPostsTable)
      .where(and(
        inArray(momentPostsTable.userToken, myTokens),
        eq(momentPostsTable.isCheckin, 1),
      ));
    const dates = new Set(
      rows
        .map(r => r.windowDate)
        .filter((d): d is string => typeof d === "string" && d !== "seed" && /^\d{4}-\d{2}-\d{2}$/.test(d)),
    );

    const alreadyToday = dates.has(today);
    // Count consecutive days ending at today (if already logged) or
    // yesterday (if today not yet logged — we're about to log it via
    // handleDone). Either way the returned `streak` reflects the number
    // including today.
    let cursor = alreadyToday ? today : stepBack(today);
    let existingStreak = 0;
    while (dates.has(cursor)) {
      existingStreak++;
      cursor = stepBack(cursor);
    }

    const streak = alreadyToday ? existingStreak : existingStreak + 1;
    res.json({ streak, firstToday: !alreadyToday });
  } catch (err) {
    console.error("[prayer-streak:log] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
