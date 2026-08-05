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
import { eq, and, inArray, gte, sql } from "drizzle-orm";
import { db, usersTable, momentUserTokensTable, momentPostsTable, prayerRequestAmensTable, prayerRequestsTable, prayerSessionsTable, breathSessionsTable } from "@workspace/db";

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
    // Audit #24: scope the read to the caller's rows via the functional index
    // idx_moment_user_tokens_lower_email (LOWER(email)) instead of pulling every
    // user's token+email and filtering in JS — the old WHERE-less SELECT was a
    // full-table scan on this hot path.
    const tokens = await db
      .select({ userToken: momentUserTokensTable.userToken })
      .from(momentUserTokensTable)
      .where(sql`LOWER(${momentUserTokensTable.email}) = ${emailLower}`);
    const myTokens = tokens.map(t => t.userToken);

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

    // Write a fallback marker on the user row so the GET can detect a
    // completion that happened on a request-only slideshow (no
    // intercession check-ins). The previous "moment_posts.isCheckin=1
    // is the only source of truth" assumption broke when a user
    // walked a slideshow of prayer requests + prayers-for with zero
    // intercessions — handleDone had nothing to log, no rows landed
    // in moment_posts, and the dashboard's loggedToday flag stayed
    // false ("Begin prayer" forever even right after a session).
    // Now /log stamps users.prayer_streak_last_date + count, and the
    // GET (in moments.ts) ORs the user-row signal with the
    // moment_posts signal so either path satisfies loggedToday.
    if (!alreadyToday) {
      try {
        await db
          .update(usersTable)
          .set({
            prayerStreakLastDate: today,
            prayerStreakCount: streak,
          })
          .where(eq(usersTable.id, sessionUser.id));
      } catch (err) {
        console.warn("[prayer-streak:log] user-row marker write failed:", err);
      }
    }

    res.json({ streak, firstToday: !alreadyToday });
  } catch (err) {
    console.error("[prayer-streak:log] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /prayer-streak/community-prayed-week — returns garden members who
// prayed in ANY way in the last 7 days, plus the true total count. The
// "Pray Together" home card surfaces this as "N people prayed with you
// this week" with a rail of their faces.
//
// "Prayed at all" = any prayer_sessions row (offices, devotions, the
// Pray Together slideshow, feed walks, Compline) OR an Amen on a prayer
// request. (An earlier version scoped this to office surfaces only; the
// card is now the communal "Pray Together" anchor, so it counts everyone
// who prayed, not just those who prayed an office.)
router.get("/prayer-streak/community-prayed-week", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { getGardenUserIds } = await import("../lib/garden.js");
    const gardenIds = await getGardenUserIds(sessionUser.id);
    if (gardenIds.length === 0) { res.json({ people: [], total: 0 }); return; }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // `day` is a local YYYY-MM-DD text; ISO dates sort lexically, so a string
    // >= comparison is a date comparison.
    const sevenAgoYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(sevenDaysAgo);

    // The four reads are independent (all keyed on gardenIds) — run them in
    // parallel rather than awaiting one after another on the app-open path.
    const [peopleRows, sessionRows, amenRows, breathRows] = await Promise.all([
      db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(inArray(usersTable.id, gardenIds)),
      db.select({ userId: prayerSessionsTable.userId, ts: prayerSessionsTable.endedAt })
        .from(prayerSessionsTable)
        .where(and(inArray(prayerSessionsTable.userId, gardenIds), gte(prayerSessionsTable.endedAt, sevenDaysAgo))),
      db.select({ userId: prayerRequestAmensTable.userId, ts: prayerRequestAmensTable.prayedAt })
        .from(prayerRequestAmensTable)
        .where(and(inArray(prayerRequestAmensTable.userId, gardenIds), gte(prayerRequestAmensTable.prayedAt, sevenDaysAgo))),
      db.select({ userId: breathSessionsTable.userId, day: breathSessionsTable.day })
        .from(breathSessionsTable)
        .where(and(inArray(breathSessionsTable.userId, gardenIds), gte(breathSessionsTable.day, sevenAgoYmd))),
    ]);

    // Track the LATEST time each person prayed (sessions + amens + breath) so the
    // rail is ordered by recency — most recent first (leftmost).
    const latestMs = new Map<number, number>();
    const note = (userId: number | null, ts: Date | null) => {
      if (typeof userId !== "number" || !ts) return;
      const ms = ts.getTime();
      const prev = latestMs.get(userId);
      if (prev === undefined || ms > prev) latestMs.set(userId, ms);
    };
    for (const r of sessionRows) note(r.userId, r.ts);
    for (const r of amenRows) note(r.userId, r.ts);
    for (const r of breathRows) { if (r.day) note(r.userId, new Date(`${r.day}T12:00:00Z`)); }

    // Who cobreathed THIS WEEK → a 🌍 badge on their face. The rail is a weekly
    // view ("N prayed with you this week"), so the globe matches that window: any
    // breath in the 7-day breathRows above counts, not just today.
    const coBreathedIds = new Set<number>();
    for (const r of breathRows) { if (typeof r.userId === "number") coBreathedIds.add(r.userId); }

    // Everyone who prayed this week → the count line + the full rail (no cap),
    // most-recent first.
    const activePeople = peopleRows.filter((p) => latestMs.has(p.id));
    const total = activePeople.length;
    const people = activePeople
      .slice()
      .sort((a, b) => (latestMs.get(b.id) ?? 0) - (latestMs.get(a.id) ?? 0))
      .map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, coBreathed: coBreathedIds.has(p.id) }));

    res.json({ people, total });
  } catch (err) {
    console.error("[prayer-streak:community-prayed-week] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /prayer-streak/community-prayed-month — same as community-prayed-week
// but over the last ~30 days. Powers the app load screen's "N prayed with
// you" + faces of everyone in your gardens who prayed this month.
router.get("/prayer-streak/community-prayed-month", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { getGardenUserIds } = await import("../lib/garden.js");
    const gardenIds = await getGardenUserIds(sessionUser.id);
    if (gardenIds.length === 0) { res.json({ people: [], total: 0 }); return; }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Co-Breathe counts as being "with you" too (see the week endpoint).
    const thirtyAgoYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(thirtyDaysAgo);

    // Independent reads — run them in parallel (app-open path).
    const [peopleRows, sessionRows, amenRows, breathRows] = await Promise.all([
      db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(inArray(usersTable.id, gardenIds)),
      db.select({ userId: prayerSessionsTable.userId, ts: prayerSessionsTable.endedAt })
        .from(prayerSessionsTable)
        .where(and(inArray(prayerSessionsTable.userId, gardenIds), gte(prayerSessionsTable.endedAt, thirtyDaysAgo))),
      db.select({ userId: prayerRequestAmensTable.userId, ts: prayerRequestAmensTable.prayedAt })
        .from(prayerRequestAmensTable)
        .where(and(inArray(prayerRequestAmensTable.userId, gardenIds), gte(prayerRequestAmensTable.prayedAt, thirtyDaysAgo))),
      db.select({ userId: breathSessionsTable.userId, day: breathSessionsTable.day })
        .from(breathSessionsTable)
        .where(and(inArray(breathSessionsTable.userId, gardenIds), gte(breathSessionsTable.day, thirtyAgoYmd))),
    ]);

    // Track the LATEST time each person prayed (across sessions + amens + breath)
    // so the rail can be ordered by recency — most recent first (leftmost).
    const latestMs = new Map<number, number>();
    const note = (userId: number | null, ts: Date | null) => {
      if (typeof userId !== "number" || !ts) return;
      const ms = ts.getTime();
      const prev = latestMs.get(userId);
      if (prev === undefined || ms > prev) latestMs.set(userId, ms);
    };
    for (const r of sessionRows) note(r.userId, r.ts);
    for (const r of amenRows) note(r.userId, r.ts);
    for (const r of breathRows) { if (r.day) note(r.userId, new Date(`${r.day}T12:00:00Z`)); }

    const activePeople = peopleRows.filter((p) => latestMs.has(p.id));
    const total = activePeople.length;
    // Order by recency — the most recent person to pray with you sits on the left.
    const people = activePeople
      .slice()
      .sort((a, b) => (latestMs.get(b.id) ?? 0) - (latestMs.get(a.id) ?? 0))
      .map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl }));

    res.json({ people, total });
  } catch (err) {
    console.error("[prayer-streak:community-prayed-month] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /prayer-streak/office-companions-today?side=morning|evening|any —
// garden members who completed that office today (the viewer's local
// today), for the "who else prayed with you" avatar row on the office
// closing slide and the splash's daily companion row. "any" (used by the
// splash, which isn't tied to a single side) merges both offices instead
// of asking the caller to pick one. Mirrors the "did I pray today" idiom
// used elsewhere in this app (format both sides to a YYYY-MM-DD string in
// the VIEWER's timezone and compare, e.g. the amen-today checks in
// routes/prayer.ts) rather than a SQL timestamp range — prayer_sessions has
// no dedicated day column like breath_sessions does, so a loose 2-day
// lookback plus an exact JS-side day-string match is simpler than deriving
// precise UTC day boundaries.
router.get("/prayer-streak/office-companions-today", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const side = req.query.side === "evening" ? "evening" : req.query.side === "any" ? "any" : "morning";
  const surfaces = side === "any" ? ["morning-prayer", "evening-prayer"] : [side === "evening" ? "evening-prayer" : "morning-prayer"];

  try {
    const { getGardenUserIds } = await import("../lib/garden.js");
    const gardenIds = await getGardenUserIds(sessionUser.id);
    if (gardenIds.length === 0) { res.json({ companions: [], companionCount: 0 }); return; }

    const [u] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, sessionUser.id));
    const tz = u?.timezone || "UTC";
    const today = todayInTz(tz);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({ userId: prayerSessionsTable.userId, endedAt: prayerSessionsTable.endedAt, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(prayerSessionsTable)
      .innerJoin(usersTable, eq(usersTable.id, prayerSessionsTable.userId))
      .where(and(
        inArray(prayerSessionsTable.userId, gardenIds),
        inArray(prayerSessionsTable.surface, surfaces),
        eq(prayerSessionsTable.completed, true),
        gte(prayerSessionsTable.endedAt, twoDaysAgo),
      ));

    // "Today" is judged in the VIEWER's own tz for every row, not each
    // companion's own tz — matches the app-wide "did I pray today" convention.
    const seen = new Map<number, { userId: number; name: string | null; avatarUrl: string | null }>();
    for (const r of rows) {
      if (r.userId === sessionUser.id) continue;
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(r.endedAt);
      if (ymd !== today) continue;
      if (!seen.has(r.userId)) seen.set(r.userId, { userId: r.userId, name: r.name, avatarUrl: r.avatarUrl });
    }

    res.json({ companions: Array.from(seen.values()).slice(0, 6), companionCount: seen.size });
  } catch (err) {
    console.error("[prayer-streak:office-companions-today] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /prayer-streak/co-prayers-week — returns the distinct people the
// caller has prayed for in the last 7 days, derived from
// prayer_request_amens joined back to prayer_requests for the owner.
// Used by the closing slide of the prayer slideshow to render a
// "you prayed with these friends this week" rail of avatars.
//
// Filters out:
//   - the caller themselves (ownerId = userId)
//   - anonymous requests (isAnonymous = true) — sender chose not to
//     reveal themselves, surfacing their avatar would break trust
//
// Caps at 12 distinct people; the client typically renders 5 with a
// "+N" tail. Sorted by most-recent prayedAt first so the rail leads
// with the freshest connections.
router.get("/prayer-streak/co-prayers-week", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Pull every amen the viewer made this week, joined to the request
    // so we have the ownerId + isAnonymous flag in one round trip.
    const rows = await db
      .select({
        ownerId: prayerRequestsTable.ownerId,
        isAnonymous: prayerRequestsTable.isAnonymous,
        prayedAt: prayerRequestAmensTable.prayedAt,
      })
      .from(prayerRequestAmensTable)
      .innerJoin(
        prayerRequestsTable,
        eq(prayerRequestsTable.id, prayerRequestAmensTable.requestId),
      )
      .where(and(
        eq(prayerRequestAmensTable.userId, sessionUser.id),
        gte(prayerRequestAmensTable.prayedAt, sevenDaysAgo),
      ));

    // Dedupe by ownerId; keep the most-recent prayedAt per owner so we
    // can sort by recency.
    const byOwner = new Map<number, Date>();
    for (const r of rows) {
      if (r.isAnonymous) continue;
      if (r.ownerId === sessionUser.id) continue;
      const prev = byOwner.get(r.ownerId);
      const stamp = r.prayedAt ?? new Date(0);
      if (!prev || stamp > prev) byOwner.set(r.ownerId, stamp);
    }

    const ids = Array.from(byOwner.keys());
    if (ids.length === 0) {
      res.json({ people: [] });
      return;
    }

    const people = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, ids));

    const sorted = people
      .map(p => ({
        ...p,
        lastPrayedAt: byOwner.get(p.id) ?? new Date(0),
      }))
      .sort((a, b) => b.lastPrayedAt.getTime() - a.lastPrayedAt.getTime())
      .slice(0, 12)
      .map(p => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
      }));

    res.json({ people: sorted });
  } catch (err) {
    console.error("[prayer-streak:co-prayers-week] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /prayer-streak/prayed-for-me-month — the people who have prayed for the
// caller in the last ~30 days, with HOW MANY times each prayed (distinct
// request-days they amened one of the caller's requests). Drives the app-open
// splash: avatars + "prayed for you N times". Ordered by who the caller has
// interacted with most — the combined prayers each way (theirs for you + yours
// for them) in the window, recency as the tiebreaker.
router.get("/prayer-streak/prayed-for-me-month", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // The caller's own requests.
    const myReqs = await db
      .select({ id: prayerRequestsTable.id })
      .from(prayerRequestsTable)
      .where(eq(prayerRequestsTable.ownerId, sessionUser.id));
    const myReqIds = myReqs.map((r) => r.id);
    if (myReqIds.length === 0) { res.json({ people: [], total: 0 }); return; }

    // Every amen on those requests in the window — one row per (user, request,
    // day) thanks to the daily cap, so a row count == "times prayed".
    const rows = await db
      .select({ userId: prayerRequestAmensTable.userId, prayedAt: prayerRequestAmensTable.prayedAt })
      .from(prayerRequestAmensTable)
      .where(and(
        inArray(prayerRequestAmensTable.requestId, myReqIds),
        gte(prayerRequestAmensTable.prayedAt, monthAgo),
      ));

    const byUser = new Map<number, { count: number; last: Date }>();
    for (const r of rows) {
      if (r.userId === sessionUser.id) continue; // your own amens don't count
      const prev = byUser.get(r.userId) ?? { count: 0, last: new Date(0) };
      prev.count += 1;
      const stamp = r.prayedAt ?? new Date(0);
      if (stamp > prev.last) prev.last = stamp;
      byUser.set(r.userId, prev);
    }
    const ids = Array.from(byUser.keys());
    if (ids.length === 0) { res.json({ people: [], total: 0 }); return; }

    // Reciprocal leg: how many times the CALLER prayed for each of THESE people
    // in the same window. "Most interacted with" is mutual — someone you've both
    // prayed for and been prayed for by should rank above a one-way pray-er. We
    // surface `count` (their prayers for you) unchanged for the "prayed for you N
    // times" line, but ORDER by the combined back-and-forth.
    const theirReqs = await db
      .select({ id: prayerRequestsTable.id, ownerId: prayerRequestsTable.ownerId })
      .from(prayerRequestsTable)
      .where(inArray(prayerRequestsTable.ownerId, ids));
    const reqOwner = new Map<number, number>();
    for (const r of theirReqs) reqOwner.set(r.id, r.ownerId);
    const reciprocal = new Map<number, number>();
    if (reqOwner.size > 0) {
      const myAmens = await db
        .select({ requestId: prayerRequestAmensTable.requestId })
        .from(prayerRequestAmensTable)
        .where(and(
          eq(prayerRequestAmensTable.userId, sessionUser.id),
          inArray(prayerRequestAmensTable.requestId, Array.from(reqOwner.keys())),
          gte(prayerRequestAmensTable.prayedAt, monthAgo),
        ));
      for (const a of myAmens) {
        const owner = reqOwner.get(a.requestId);
        if (owner == null) continue;
        reciprocal.set(owner, (reciprocal.get(owner) ?? 0) + 1);
      }
    }

    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(inArray(usersTable.id, ids));

    const people = users
      .map((u) => {
        const count = byUser.get(u.id)?.count ?? 0;
        const mine = reciprocal.get(u.id) ?? 0;
        return { id: u.id, name: u.name, avatarUrl: u.avatarUrl, count, _score: count + mine, _last: byUser.get(u.id)?.last ?? new Date(0) };
      })
      // Most-interacted-with first: combined prayers each way, then recency.
      .sort((a, b) => b._score - a._score || b._last.getTime() - a._last.getTime())
      .slice(0, 12)
      .map(({ _last, _score, ...p }) => p);

    res.json({ people, total: people.length });
  } catch (err) {
    console.error("[prayer-streak:prayed-for-me-month] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
