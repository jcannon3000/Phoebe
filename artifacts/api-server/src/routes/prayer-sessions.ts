import { Router, type IRouter } from "express";
import { db, prayerSessionsTable, prayerSurfaces, appOpensTable, usersTable, contemplationHealthMinutesTable, breathSessionsTable, dailyHealthStepsTable } from "@workspace/db";
import { and, desc, eq, gte, gt, lt, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getGardenUserIds } from "../lib/garden";
import { sendContemplationGoalReachedPush } from "../lib/pushSender";
import { todayDateInTz, isValidTimeZone } from "../lib/tz";

const router: IRouter = Router();

// POST /api/app-open — records that the signed-in user opened/foregrounded
// the app. Stamped into a 15-minute bucket (floor(epoch/900)) with a
// unique (user_id, bucket) index, so rapid re-opens within the window
// collapse to one row. Backs the "people who opened" / "times opened"
// admin metrics. Fire-and-forget from the client; always 200.
router.post("/app-open", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const bucket = Math.floor(Date.now() / 1000 / 900);
    await db
      .insert(appOpensTable)
      .values({ userId: sessionUserId, bucket })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) {
    console.error("[/app-open] failed:", err);
    // Non-fatal — a dropped open ping shouldn't surface an error.
    res.json({ ok: false });
  }
});

// GET /api/me/prayer-days?days=N — the unified "days of prayer" history that
// backs the Today's Rhythm header. A day is "kept" if the user did ANY
// server-recorded prayer that local day: a prayer_session of any surface
// (the morning/evening office, contemplation, a community sit, the prayer
// slideshow) OR a Cobreathe breath. Reflections are localStorage-only on the
// client, so the component ORs today's reflection state in on top — but the
// streak/grace backbone is this server union, so it's consistent across
// devices.
//
// Returns the last N local days (default 14, max 30; today at index N-1),
// plus a grace-aware `streak` and `last7`:
//   • streak — consecutive kept days ending TODAY or YESTERDAY. Today not yet
//     prayed does NOT break the streak (you still have the day to keep it);
//     a gap of two full days does. This is the Benedictine "begin again"
//     rule, not a brittle Duolingo reset.
//   • last7 — count of kept days in the last 7 (the "kept 5 of the last 7"
//     line; survives the occasional missed day).
router.get("/me/prayer-days", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const nRaw = typeof req.query.days === "string" ? parseInt(req.query.days, 10) : NaN;
    const N = Number.isFinite(nRaw) ? Math.min(Math.max(nRaw, 7), 30) : 14;

    // Timezone: prefer the client's IANA zone (passed as ?tz=, matching how
    // Cobreathe writes breath_sessions.day in the device-local day) over the
    // stored profile zone, so "today" agrees with what the client recorded.
    // Both fall back to UTC. todayDateInTz never throws on a bad zone.
    const [meTz] = await db
      .select({ timezone: usersTable.timezone, createdAt: usersTable.createdAt, restDays: usersTable.restDays })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    const tzParam = typeof req.query.tz === "string" && isValidTimeZone(req.query.tz) ? req.query.tz : null;
    const tz = tzParam ?? (meTz?.timezone && isValidTimeZone(meTz.timezone) ? meTz.timezone : "UTC");

    // YMD for "i days before today" in the resolved timezone.
    const todayYmd = todayDateInTz(tz);
    const [ty, tm, td] = todayYmd.split("-").map((n) => parseInt(n, 10));
    const ymdMinus = (i: number): string => {
      const dt = new Date(Date.UTC(ty, tm - 1, td));
      dt.setUTCDate(dt.getUTCDate() - i);
      return dt.toISOString().slice(0, 10);
    };
    const windowStart = ymdMinus(400); // bound for both reads
    // The streak only counts back to when the routine was in place — never
    // before the account itself existed. We bound it to the account-creation
    // day (the earliest a routine could exist), so a streak can't be inflated
    // by seeded / pre-routine history.
    const createdYmd = meTz?.createdAt
      ? new Date(meTz.createdAt).toLocaleDateString("en-CA", { timeZone: tz })
      : "0000-00-00";

    // Distinct local-day strings from prayer sessions in the window. Cast the
    // session's ended_at into the user's tz before taking the date, so an
    // evening sit lands on the right calendar day.
    const sessionDays = await db.execute<{ day: string }>(sql`
      SELECT DISTINCT to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day
      FROM prayer_sessions
      WHERE user_id = ${sessionUserId}
        AND ended_at >= NOW() - INTERVAL '400 days'
    `);
    // Cobreathe already stores the user's local-day string directly — bound to
    // the window so this scan doesn't fetch the user's entire breath history.
    const breathDays = await db
      .select({ day: breathSessionsTable.day })
      .from(breathSessionsTable)
      .where(and(
        eq(breathSessionsTable.userId, sessionUserId),
        gte(breathSessionsTable.day, windowStart),
      ));

    const kept = new Set<string>();
    for (const r of sessionDays.rows) if (r.day) kept.add(r.day);
    for (const r of breathDays) if (r.day) kept.add(r.day);

    // The N-day window (oldest first; today at index N-1) for any display use.
    const days: { ymd: string; kept: boolean }[] = [];
    for (let i = N - 1; i >= 0; i--) {
      const ymd = ymdMinus(i);
      days.push({ ymd, kept: kept.has(ymd) });
    }

    const keptToday = kept.has(ymdMinus(0));
    const last7 = Array.from({ length: 7 }, (_, i) => ymdMinus(i)).filter((d) => kept.has(d)).length;

    // Streak: consecutive kept days ending today — or yesterday, by grace, if
    // today isn't prayed yet. Walk backward over the kept SET, not the N-day
    // display window, so the count is NOT capped at the window size. Bounded at
    // the session lookback (~400 days) so the loop always terminates.
    //
    // GRACE BUFFER: one missed day per rolling week is silently bridged — the
    // streak doesn't break on a single slip (a rhythm isn't a chain). Two
    // misses within seven days end it. The forgiven day itself doesn't add to
    // the count; it just doesn't sever what came before. No "streak freeze"
    // inventory, no UI — it simply doesn't break.
    //
    // REST DAYS: a weekday the user has set as a rest/sabbath day (users.
    // rest_days, 0=Sun..6=Sat — the Walking Together phone-sabbath setting)
    // never breaks the streak and never consumes the weekly grace — rest is
    // part of the rule, not a miss.
    const restDays = new Set(Array.isArray(meTz?.restDays) ? meTz.restDays : []);
    const isRestDay = (ymd: string): boolean =>
      restDays.size > 0 && restDays.has(new Date(`${ymd}T00:00:00Z`).getUTCDay());
    let streak = 0;
    let lastForgivenI: number | null = null;
    for (let i = keptToday ? 0 : 1; i < 400; i++) {
      const ymd = ymdMinus(i);
      if (ymd < createdYmd) break; // don't count days before the account/routine existed
      if (kept.has(ymd)) { streak++; continue; }
      if (isRestDay(ymd)) continue; // rest is kept by definition — bridge for free
      if (lastForgivenI === null || i - lastForgivenI >= 7) { lastForgivenI = i; continue; }
      break;
    }

    res.json({ days, streak, last7, keptToday });
  } catch (err) {
    console.error("[/me/prayer-days] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/me/garden-week — how many OTHERS in the user's garden(s) have
// practiced in the last 7 days. "Practiced" = any prayer_session (offices,
// contemplation, the slideshow, examen) OR a Cobreathe breath — the same
// union that backs the streak, so it reads as "kept their rhythm this week."
// Powers the social-proof line on the Daily-progress streak card. Returns a
// plain count (no identities) and never throws — a 0 just hides the line.
router.get("/me/garden-week", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const gardenIds = (await getGardenUserIds(sessionUserId)).filter((id) => id !== sessionUserId);
    if (gardenIds.length === 0) { res.json({ count: 0 }); return; }

    // Rolling 7-day window. prayer_sessions are timestamped (ended_at);
    // breath_sessions store a local-day string, which sorts correctly as ISO.
    const sinceUtc = new Date(Date.now() - 7 * 86_400_000);
    const sinceDay = sinceUtc.toISOString().slice(0, 10);

    const [sessionRows, breathRows] = await Promise.all([
      db
        .select({ userId: prayerSessionsTable.userId })
        .from(prayerSessionsTable)
        .where(and(inArray(prayerSessionsTable.userId, gardenIds), gte(prayerSessionsTable.endedAt, sinceUtc))),
      db
        .select({ userId: breathSessionsTable.userId })
        .from(breathSessionsTable)
        .where(and(inArray(breathSessionsTable.userId, gardenIds), gte(breathSessionsTable.day, sinceDay))),
    ]);

    const practiced = new Set<number>();
    for (const r of sessionRows) practiced.add(r.userId);
    for (const r of breathRows) practiced.add(r.userId);

    // Faces for the rail — name + avatar of those who prayed this week.
    const ids = Array.from(practiced);
    const people = ids.length
      ? await db
          .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(inArray(usersTable.id, ids))
      : [];
    res.json({ count: practiced.size, people });
  } catch (err) {
    console.error("[/me/garden-week] failed:", err);
    res.json({ count: 0, people: [] });
  }
});

// Per-user prayer-time ledger. Client posts a finished session; the
// metrics page reads the rolled-up totals via /api/groups/:slug/metrics.
//
// Anti-cheat:
//   • Sessions < 5 seconds are dropped silently — the user passed
//     through the screen and didn't actually pray. Without this floor
//     a debounced re-mount on a fast back-and-forth would clutter the
//     ledger with sub-second entries.
//   • Sessions > 60 minutes are clamped to 60 — a phone left on a
//     slide overnight shouldn't add 8 hours to the user's "Time
//     praying" total. The client tries to commit on unmount + on
//     visibility change, so a clamped session usually means the user
//     foregrounded the app after a long interval; we keep the row but
//     cap the number.

const SURFACE_SET = new Set<string>(prayerSurfaces);
const MIN_SESSION_SECONDS = 5;
const MAX_SESSION_SECONDS = 60 * 60;

const schema = z.object({
  surface: z.string(),
  durationSeconds: z.number().int().min(0).max(24 * 60 * 60),
  startedAt: z.string(), // ISO
  endedAt: z.string(),   // ISO
  // Optional: max slide index the user advanced to during the session.
  // Office viewer passes it through so metrics can distinguish
  // "actually prayed" (≥3 slides) from "tap-and-bail".
  slidesCompleted: z.number().int().min(0).max(10000).optional(),
  // Optional per-session visibility. When true the row is hidden from
  // other users' "who sat with me" lookups. Omitted = public (the
  // default), which is how every existing surface that hits this
  // endpoint behaves today; the contemplation summary toggle is the
  // only caller that sets it.
  isPrivate: z.boolean().optional(),
  // Optional: true only when the office/devotion slideshow was actually
  // finished (closing Amen/Done or the book attestation). The office-history
  // rollups require this for the four office surfaces, so a partial sit that
  // auto-commits on unmount doesn't count the office. Omitted = false.
  completed: z.boolean().optional(),
  // Display tag for where a contemplation sit came from (e.g. "cobreathe"),
  // distinct from `surface` which stays "contemplation" so the rollups still
  // count it. Omitted = a plain silent sit.
  source: z.string().max(40).optional(),
  // Which per-side contemplation card this sit belongs to — the client resolves
  // it at POST time (explicit ?side= wins, else the first undone active side)
  // so /me/contemplation-sides-today can echo done-state across devices.
  contemplationSide: z.enum(["morning", "evening"]).optional(),
});

router.post("/prayer-sessions", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { surface, durationSeconds, startedAt, endedAt, slidesCompleted, isPrivate, completed, source } = parsed.data;

  if (!SURFACE_SET.has(surface)) {
    res.status(400).json({ error: "Unknown surface" });
    return;
  }
  // The 5-second floor is bypassed for "visit-style" surfaces where
  // the act of opening the page is itself the meaningful event:
  //   • prayer-list — opening your prayer list
  //   • the four office / devotion surfaces — opening an office and
  //     starting to pray. The user wants every office open counted
  //     in the community's people-praying / times-prayed rollups,
  //     even if the session is short. Slideshow keeps the floor
  //     since a 0-second slideshow open is almost always a fat-
  //     finger or a navigation transition.
  const FLOOR_BYPASS_SURFACES = new Set<string>([
    "prayer-list",
    "morning-prayer",
    "evening-prayer",
    "morning-devotion",
    "early-evening-devotion",
    // Tapping the National Cathedral Morning Prayer link in the
    // drawer Resources is itself the engagement event — same model
    // as opening an office. We can't observe how long they watch
    // the external stream, so we credit a fixed broadcast-length
    // duration on tap.
    "national-cathedral",
    // The audio-office surfaces only POST once the listener has crossed the
    // 60% mark — that threshold IS the "this was a real office" signal, like
    // the offices above. Bypass the 5s floor so a short clip (or a mis-reported
    // tiny duration at the 60% mark) can't silently drop the cross-device /
    // streak credit while the local office-completed flag still flips.
    "morning-office-podcast",
    "evening-office-podcast",
  ]);
  if (!FLOOR_BYPASS_SURFACES.has(surface) && durationSeconds < MIN_SESSION_SECONDS) {
    // Drop silently — too short to count as a real prayer session.
    res.json({ ok: true, recorded: false, reason: "below-floor" });
    return;
  }

  // Clamp upper bound. If the client submitted something outrageous we
  // store the clamped value; the user still gets credit for ~an hour.
  const capped = Math.min(durationSeconds, MAX_SESSION_SECONDS);

  const startedAtDate = new Date(startedAt);
  const endedAtDate = new Date(endedAt);
  if (Number.isNaN(startedAtDate.getTime()) || Number.isNaN(endedAtDate.getTime())) {
    res.status(400).json({ error: "Invalid timestamps" });
    return;
  }

  const [inserted] = await db.insert(prayerSessionsTable).values({
    userId: sessionUserId,
    surface,
    durationSeconds: capped,
    slidesCompleted: typeof slidesCompleted === "number" ? slidesCompleted : null,
    startedAt: startedAtDate,
    endedAt: endedAtDate,
    isPrivate: isPrivate === true,
    completed: completed === true,
    source: typeof source === "string" && source.trim() ? source.trim() : null,
    contemplationSide: parsed.data.contemplationSide ?? null,
  }).returning({ id: prayerSessionsTable.id });

  // Return the new row id so the client can PATCH it later (e.g. the
  // contemplation summary toggle flipping public ↔ private after the
  // session has been recorded).
  res.json({ ok: true, recorded: true, durationSeconds: capped, id: inserted?.id ?? null });
});

// GET /api/me/contemplation-sides-today?tz= — which per-side contemplation
// cards (Morning / Evening) the viewer has kept TODAY, from any device. The
// localStorage flag is the instant local layer; this is the cross-device echo
// (a sit done on the iPhone otherwise read undone on the web). Day boundaries
// in the viewer's tz, like /me/prayer-days.
router.get("/me/contemplation-sides-today", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const tzParam = typeof req.query.tz === "string" && isValidTimeZone(req.query.tz) ? req.query.tz : null;
    const tz = tzParam ?? "UTC";
    const today = todayDateInTz(tz);
    const rows = await db.execute<{ side: string }>(sql`
      SELECT DISTINCT contemplation_side AS side
      FROM prayer_sessions
      WHERE user_id = ${sessionUserId}
        AND surface = 'contemplation'
        AND contemplation_side IS NOT NULL
        AND ended_at >= NOW() - INTERVAL '2 days'
        AND to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') = ${today}
    `);
    const sides = new Set(rows.rows.map((r) => r.side));
    res.json({ morning: sides.has("morning"), evening: sides.has("evening") });
  } catch (err) {
    console.error("[/me/contemplation-sides-today] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/me/contemplation-stats — the viewer's own contemplation
// figures for the Contemplation page, per window (today / this week —
// rolling 7 days / all time): the SUM of seconds, the session COUNT,
// and the number of distinct DAYS sat in that window, so the client can
// show cumulative time on one row and average-per-day (sum/days) on
// another. Cheap — covered by the (user_id, ended_at) index.
//
// "Today" is the user's LOCAL calendar day, which the server can't know
// on its own, so the client passes its local midnight as ?todaySince=
// (ISO). We fall back to UTC midnight if it's missing or unparseable —
// off by a few hours at worst, never wrong by a day for most users.
router.get("/me/contemplation-stats", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todaySinceParam = typeof req.query.todaySince === "string" ? new Date(req.query.todaySince) : null;
    const todaySince = todaySinceParam && !Number.isNaN(todaySinceParam.getTime())
      ? todaySinceParam
      : new Date(new Date().setUTCHours(0, 0, 0, 0));
    // Caller's IANA timezone — used so distinct days-sat are counted in
    // local time (Postgres `AT TIME ZONE`). Validate the shape before it
    // touches SQL; fall back to UTC on anything unexpected. Bad zone
    // strings would otherwise throw at query time.
    const tzRaw = typeof req.query.tz === "string" ? req.query.tz : "";
    let tz = /^[A-Za-z0-9_+\-/]{1,64}$/.test(tzRaw) ? tzRaw : "";
    // When the caller didn't pass a valid ?tz, fall back to the user's STORED
    // timezone — NOT UTC. The Apple Health minutes lookup below keys on
    // "today" in this tz, and the iOS client uploads them under the device's
    // LOCAL day. A UTC fallback rolls "today" to tomorrow in the evening for
    // users west of UTC, so the synced minutes silently read as 0 ("lost").
    if (!tz) {
      const [u] = await db.select({ timezone: usersTable.timezone })
        .from(usersTable).where(eq(usersTable.id, sessionUserId));
      const userTz = u?.timezone ?? "";
      tz = /^[A-Za-z0-9_+\-/]{1,64}$/.test(userTz) ? userTz : "UTC";
    }

    const windowStats = async (since: Date | null): Promise<{ seconds: number; count: number; days: number }> => {
      const conds = [
        eq(prayerSessionsTable.userId, sessionUserId),
        eq(prayerSessionsTable.surface, "contemplation"),
      ];
      if (since) conds.push(gte(prayerSessionsTable.endedAt, since));
      const [row] = await db
        .select({
          seconds: sql<number>`COALESCE(SUM(${prayerSessionsTable.durationSeconds}), 0)::int`,
          count: sql<number>`COUNT(*)::int`,
          // Distinct calendar days sat, in the caller's local timezone —
          // so evening sits don't split across UTC midnight and inflate
          // the day count (which deflated the per-day average).
          days: sql<number>`COUNT(DISTINCT (${prayerSessionsTable.endedAt} AT TIME ZONE ${tz})::date)::int`,
        })
        .from(prayerSessionsTable)
        .where(and(...conds));
      return { seconds: row?.seconds ?? 0, count: row?.count ?? 0, days: row?.days ?? 0 };
    };

    // External Apple Health mindful minutes the iOS client uploaded for the
    // viewer's LOCAL day (Calm / Insight Timer / Apple Mindfulness; Phoebe's
    // own sits already excluded client-side). Returned as a SEPARATE field —
    // not folded into todaySeconds, which also backs the prayer-only Stats
    // tiles + History — so "done today" consumers can add it without making
    // the Today tile disagree with the week / all-time tiles. The card adds
    // its live value instead; this serves the home card + any surface without
    // a live HealthKit read.
    let localDay: string;
    try { localDay = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch { localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date()); }

    // Apple Health mindful minutes (external apps like Insight Timer / Calm /
    // Apple Mindfulness) for the week + all-time, summed from the per-day table
    // — so the Stats tiles can fold them in alongside in-app sits. `day` is the
    // tz-local YYYY-MM-DD string, so a lexical >= bound is a valid date range.
    let sevenAgoYmd = localDay;
    try { sevenAgoYmd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); } catch { /* keep localDay */ }
    const healthSum = sql<number>`COALESCE(SUM(${contemplationHealthMinutesTable.minutes}), 0)::int`;

    const [today, week, all, healthRow, healthWeekRow, healthTotalRow] = await Promise.all([
      windowStats(todaySince),
      windowStats(weekAgo),
      windowStats(null),
      db
        .select({ minutes: contemplationHealthMinutesTable.minutes })
        .from(contemplationHealthMinutesTable)
        .where(and(
          eq(contemplationHealthMinutesTable.userId, sessionUserId),
          eq(contemplationHealthMinutesTable.day, localDay),
        ))
        .then((r) => r[0]),
      db
        .select({ m: healthSum })
        .from(contemplationHealthMinutesTable)
        .where(and(
          eq(contemplationHealthMinutesTable.userId, sessionUserId),
          gte(contemplationHealthMinutesTable.day, sevenAgoYmd),
        ))
        .then((r) => r[0]),
      db
        .select({ m: healthSum })
        .from(contemplationHealthMinutesTable)
        .where(eq(contemplationHealthMinutesTable.userId, sessionUserId))
        .then((r) => r[0]),
    ]);

    res.json({
      todaySeconds: today.seconds,
      todayCount: today.count,
      // External mindful minutes synced from Apple Health for today (0 if none).
      healthMinutesToday: healthRow?.minutes ?? 0,
      // …and for the week + all-time, so the Stats tiles can include them.
      healthMinutesWeek: healthWeekRow?.m ?? 0,
      healthMinutesTotal: healthTotalRow?.m ?? 0,
      // Today is one local day — a sit means 1 day, not the UTC-split
      // count, so the per-day average == today's total.
      todayDays: today.count > 0 ? 1 : 0,
      weekSeconds: week.seconds,
      weekCount: week.count,
      weekDays: week.days,
      totalSeconds: all.seconds,
      sessionCount: all.count,
      totalDays: all.days,
    });
  } catch (err) {
    console.error("[/me/contemplation-stats GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/me/contemplation-sessions — the viewer's recent contemplation
// sits, newest first. Powers the History list on the Contemplation page;
// each card shows the date, the time, and how long the sit was.
//
// Each card also carries `companions`: people in the viewer's garden
// (group peers + correspondents) whose OWN contemplation prayer
// overlapped this one in time — "you were praying at the same moment."
// The client shows their faces beside the duration.
router.get("/me/contemplation-sessions", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const rows = await db
      .select({
        id: prayerSessionsTable.id,
        startedAt: prayerSessionsTable.startedAt,
        endedAt: prayerSessionsTable.endedAt,
        durationSeconds: prayerSessionsTable.durationSeconds,
        source: prayerSessionsTable.source,
      })
      .from(prayerSessionsTable)
      .where(and(
        eq(prayerSessionsTable.userId, sessionUserId),
        eq(prayerSessionsTable.surface, "contemplation"),
      ))
      .orderBy(desc(prayerSessionsTable.endedAt))
      .limit(limit);

    // ── Overlapping garden companions ──────────────────────────────────
    // Find garden members whose contemplation sessions overlap any of the
    // viewer's returned sessions, then match them up per-session in JS.
    // Two windows overlap iff a.start < b.end AND a.end > b.start.
    type Companion = { userId: number; name: string | null; avatarUrl: string | null };
    const companionsBySession = new Map<number, Companion[]>();

    const withTimes = rows.filter((r) => r.startedAt && r.endedAt);
    if (withTimes.length > 0) {
      const minStart = new Date(Math.min(...withTimes.map((r) => r.startedAt!.getTime())));
      const maxEnd = new Date(Math.max(...withTimes.map((r) => r.endedAt!.getTime())));
      const gardenIds = await getGardenUserIds(sessionUserId);
      if (gardenIds.length > 0) {
        const gardenSessions = await db
          .select({
            userId: prayerSessionsTable.userId,
            startedAt: prayerSessionsTable.startedAt,
            endedAt: prayerSessionsTable.endedAt,
          })
          .from(prayerSessionsTable)
          .where(and(
            eq(prayerSessionsTable.surface, "contemplation"),
            // Hide private sessions from anyone else's overlap row.
            eq(prayerSessionsTable.isPrivate, false),
            inArray(prayerSessionsTable.userId, gardenIds),
            // Only sessions that could overlap the viewer's overall span.
            gt(prayerSessionsTable.endedAt, minStart),
            lt(prayerSessionsTable.startedAt, maxEnd),
          ));

        if (gardenSessions.length > 0) {
          const ids = [...new Set(gardenSessions.map((g) => g.userId))];
          const userRows = await db
            .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
            .from(usersTable)
            .where(inArray(usersTable.id, ids));
          const userMap = new Map(userRows.map((u) => [u.id, u]));

          for (const r of withTimes) {
            const sStart = r.startedAt!.getTime();
            const sEnd = r.endedAt!.getTime();
            const seen = new Set<number>();
            const companions: Companion[] = [];
            for (const g of gardenSessions) {
              if (!g.startedAt || !g.endedAt) continue;
              if (g.startedAt.getTime() < sEnd && g.endedAt.getTime() > sStart && !seen.has(g.userId)) {
                seen.add(g.userId);
                const u = userMap.get(g.userId);
                companions.push({ userId: g.userId, name: u?.name ?? null, avatarUrl: u?.avatarUrl ?? null });
                if (companions.length >= 6) break; // cap — the card shows a few + "+N"
              }
            }
            if (companions.length > 0) companionsBySession.set(r.id, companions);
          }
        }
      }
    }

    res.json(rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
      durationSeconds: r.durationSeconds,
      source: r.source ?? null,
      companions: companionsBySession.get(r.id) ?? [],
    })));
  } catch (err) {
    console.error("[/me/contemplation-sessions GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/me/contemplation-health-days — external Apple Health mindful minutes
// the iOS client synced, broken out PER LOCAL DAY (YYYY-MM-DD → minutes). The
// History list's condensed older-day cards sum only Phoebe's own logged sits, so
// a day where most of the silence was kept in Calm / Insight Timer / Apple
// Mindfulness read far too low; the client folds these in so a condensed day
// matches the Stats totals (which already include Health). Bounded to ~14 months.
router.get("/me/contemplation-health-days", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select({ day: contemplationHealthMinutesTable.day, minutes: contemplationHealthMinutesTable.minutes })
      .from(contemplationHealthMinutesTable)
      .where(eq(contemplationHealthMinutesTable.userId, sessionUserId))
      .orderBy(desc(contemplationHealthMinutesTable.day))
      .limit(430);
    const days: Record<string, number> = {};
    for (const r of rows) {
      if (r.day && typeof r.minutes === "number" && r.minutes > 0) days[r.day] = r.minutes;
    }
    res.json({ days });
  } catch (err) {
    console.error("[/me/contemplation-health-days GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/me/contemplation-companions?startedAt=…&endedAt=… —
// "who was sitting with me?" for a SINGLE contemplation window, used by
// the ContemplationTimer summary screen the moment a sit ends. Two
// returned slices:
//   • `companions` — garden members (group peers + correspondents +
//     fellows) whose own contemplation prayer_session overlapped this
//     window. Up to 6 entries (id + name + avatarUrl) — the closing
//     screen renders their faces.
//   • `otherCount` — count of any OTHER Phoebe users (not garden, not
//     the viewer) whose contemplation overlapped. The summary reports
//     this as a plain "N other people were in contemplation" line.
//
// Overlap: a.start < b.end && a.end > b.start, matching the History
// endpoint above. Distinct by userId so a person with two adjacent
// sits in the same window isn't double-counted.
router.get("/me/contemplation-companions", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  // ALL CONTEMPLATION IS PRIVATE — see the presence gate below. Old frozen
  // iOS builds still call this; give them an empty (graceful) answer.
  if (!CONTEMPLATION_PRESENCE_ENABLED) { res.json({ companions: [], otherCount: 0 }); return; }
  const startedAtRaw = typeof req.query.startedAt === "string" ? req.query.startedAt : "";
  const endedAtRaw = typeof req.query.endedAt === "string" ? req.query.endedAt : "";
  const startedAt = new Date(startedAtRaw);
  const endedAt = new Date(endedAtRaw);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt <= startedAt) {
    res.status(400).json({ error: "Invalid window" });
    return;
  }
  // Cap the window at 12 hours to bound the DB scan in case a client
  // sends absurd timestamps (long-locked phone, manual log).
  if (endedAt.getTime() - startedAt.getTime() > 12 * 60 * 60 * 1000) {
    res.status(400).json({ error: "Window too large" });
    return;
  }
  try {
    // All non-viewer contemplation sessions overlapping the window. We
    // pull userId only — names/avatars come in a separate fetch for the
    // garden subset so we don't drag avatar URLs for the "other" tally
    // we never display. Private sessions are filtered out here so they
    // never leak into anyone else's companions view.
    const overlapping = await db
      .select({ userId: prayerSessionsTable.userId })
      .from(prayerSessionsTable)
      .where(and(
        eq(prayerSessionsTable.surface, "contemplation"),
        eq(prayerSessionsTable.isPrivate, false),
        gt(prayerSessionsTable.endedAt, startedAt),
        lt(prayerSessionsTable.startedAt, endedAt),
      ));
    const otherUserIds = new Set<number>();
    for (const row of overlapping) {
      if (row.userId !== sessionUserId) otherUserIds.add(row.userId);
    }
    if (otherUserIds.size === 0) {
      res.json({ companions: [], otherCount: 0 });
      return;
    }

    const gardenIds = new Set(await getGardenUserIds(sessionUserId));
    const gardenCompanionIds: number[] = [];
    let otherCount = 0;
    for (const uid of otherUserIds) {
      if (gardenIds.has(uid)) gardenCompanionIds.push(uid);
      else otherCount += 1;
    }

    // Hydrate the garden subset with name + avatar; cap at 6 since the
    // summary screen only shows a few faces.
    type Companion = { userId: number; name: string | null; avatarUrl: string | null };
    let companions: Companion[] = [];
    if (gardenCompanionIds.length > 0) {
      const userRows = await db
        .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(inArray(usersTable.id, gardenCompanionIds));
      companions = userRows.slice(0, 6).map((u) => ({
        userId: u.id,
        name: u.name ?? null,
        avatarUrl: u.avatarUrl ?? null,
      }));
    }

    res.json({ companions, otherCount });
  } catch (err) {
    console.error("[/me/contemplation-companions GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Contemplation presence ("who's sitting right now") ─────────────────────
// Ephemeral, in-memory heartbeat registry. While a sit is RUNNING the client
// POSTs a heartbeat every ~20s; anyone whose last beat is within PRESENCE_TTL
// counts as "currently sitting." This powers the live faces shown DURING a sit
// and means two people sitting at the same time see each other immediately —
// no longer waiting for a session to be recorded on finish (which is why the
// first finisher previously saw no companion). In-memory on purpose: presence
// is transient, so a restart just clears it (faces reappear on the next beat).
// Assumes a single server instance (true for our deploy); a shared store would
// be needed to scale out.
//
// ALL CONTEMPLATION IS PRIVATE (owner, 2026-07-02): the sit shows no one else's
// presence and broadcasts none. The client kill switch hides these surfaces in
// current builds; this SERVER gate covers the old frozen iOS bundles that still
// call them — heartbeats are dropped and reads return empty (never an error, so
// old clients degrade gracefully to a solitary sit).
const CONTEMPLATION_PRESENCE_ENABLED = false;
const sittingNow = new Map<number, number>();
const PRESENCE_TTL_MS = 60_000;

router.post("/me/contemplation-presence", (req, res): void => {
  const uid = req.user ? (req.user as { id: number }).id : null;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!CONTEMPLATION_PRESENCE_ENABLED) { res.json({ ok: true }); return; }
  sittingNow.set(uid, Date.now());
  res.json({ ok: true });
});

router.get("/me/contemplation-presence", async (req, res): Promise<void> => {
  const uid = req.user ? (req.user as { id: number }).id : null;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!CONTEMPLATION_PRESENCE_ENABLED) { res.json({ companions: [], otherCount: 0 }); return; }
  try {
    const now = Date.now();
    // Prune stale beats while collecting the live set (excluding the viewer).
    const liveIds: number[] = [];
    for (const [id, last] of sittingNow) {
      if (now - last > PRESENCE_TTL_MS) { sittingNow.delete(id); continue; }
      if (id !== uid) liveIds.push(id);
    }
    if (liveIds.length === 0) { res.json({ companions: [], otherCount: 0 }); return; }
    const gardenIds = new Set(await getGardenUserIds(uid));
    const gardenCompanionIds: number[] = [];
    let otherCount = 0;
    for (const id of liveIds) {
      if (gardenIds.has(id)) gardenCompanionIds.push(id);
      else otherCount += 1;
    }
    type Companion = { userId: number; name: string | null; avatarUrl: string | null };
    let companions: Companion[] = [];
    if (gardenCompanionIds.length > 0) {
      const userRows = await db
        .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(inArray(usersTable.id, gardenCompanionIds));
      companions = userRows.slice(0, 6).map((u) => ({ userId: u.id, name: u.name ?? null, avatarUrl: u.avatarUrl ?? null }));
    }
    res.json({ companions, otherCount });
  } catch (err) {
    console.error("[/me/contemplation-presence GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/me/contemplation-sessions — manually log a sit that wasn't
// timed in-app (e.g. you sat away from your phone). Body: how long it was
// and when it happened. Stored as an ordinary contemplation session so it
// rolls into the same cumulative + average-per-day totals. The 12-hour
// cap is generous (retreat sits) but guards against fat-fingered entries.
const manualLogSchema = z.object({
  durationSeconds: z.number().int().min(1).max(12 * 60 * 60),
  // When the sit began (ISO). The client sends the user's chosen local
  // time converted to UTC.
  occurredAt: z.string(),
});
router.post("/me/contemplation-sessions", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = manualLogSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { durationSeconds, occurredAt } = parsed.data;
  const startedAt = new Date(occurredAt);
  if (Number.isNaN(startedAt.getTime())) { res.status(400).json({ error: "Invalid timestamp" }); return; }
  // Reject sits logged in the future (allow a small clock-skew grace).
  if (startedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    res.status(400).json({ error: "Cannot log a sit in the future" });
    return;
  }
  const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
  try {
    const [created] = await db.insert(prayerSessionsTable).values({
      userId: sessionUserId,
      surface: "contemplation",
      durationSeconds,
      slidesCompleted: null,
      startedAt,
      endedAt,
    }).returning({ id: prayerSessionsTable.id });
    res.json({ ok: true, id: created?.id ?? null });
  } catch (err) {
    console.error("[/me/contemplation-sessions POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// PUT /api/me/contemplation-health-minutes — the iOS client best-effort
// uploads today's EXTERNAL mindful minutes it read from Apple Health (Calm,
// Insight Timer, Apple Mindfulness; Phoebe's own sits already excluded
// client-side so they're never double-counted). Stored per (user, local day)
// so the ~7pm goal nudge (lib/bellSender) and /me/contemplation-stats fold
// them into "done today" the same way the Contemplation card does. Upsert —
// GREATEST wins: a daily mindful total only grows within a day, so a stale
// cached read (react-query staleTime) or a second device whose HealthKit
// lags can't clobber a higher total already synced from the user's phone.
const healthMinutesSchema = z.object({
  // Bounded at 24h to reject garbage; external mindful minutes are small.
  minutes: z.number().int().min(0).max(24 * 60),
  // The user's LOCAL calendar day (YYYY-MM-DD) the minutes belong to.
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
router.put("/me/contemplation-health-minutes", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = healthMinutesSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { minutes, day } = parsed.data;
  // Accept only a day within ±1 of the server's UTC today. The value is
  // "today's" mindful minutes from the device, whose local day is always
  // within a day of UTC — so this bounds stray / backfilled writes without
  // needing the caller's tz. (The row is user-scoped; this is a sanity
  // bound, not an authorization check.)
  const dayMs = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(dayMs)) { res.status(400).json({ error: "Invalid day" }); return; }
  const now = new Date();
  const utcTodayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (Math.abs(dayMs - utcTodayMs) > 86400000) { res.status(400).json({ error: "Day out of range" }); return; }
  // Read the previous stored value before the upsert so we can detect
  // when this upload crosses the daily goal for the first time today.
  // Declared before the try so it's accessible in the post-response check.
  const [prevRow] = await db
    .select({ minutes: contemplationHealthMinutesTable.minutes })
    .from(contemplationHealthMinutesTable)
    .where(and(
      eq(contemplationHealthMinutesTable.userId, sessionUserId),
      eq(contemplationHealthMinutesTable.day, day),
    ));
  const prevHealthMin = prevRow?.minutes ?? 0;

  try {

    await db.insert(contemplationHealthMinutesTable)
      .values({ userId: sessionUserId, day, minutes })
      .onConflictDoUpdate({
        target: [contemplationHealthMinutesTable.userId, contemplationHealthMinutesTable.day],
        // Monotonic within the day — see route comment. Tradeoff: a genuine
        // decrease (user deletes a Health session) won't propagate until the
        // day rolls over; we prefer that over under-counting the goal.
        set: {
          minutes: sql`GREATEST(${contemplationHealthMinutesTable.minutes}, EXCLUDED.minutes)`,
          updatedAt: new Date(),
        },
      });

    res.json({ ok: true });
  } catch (err) {
    console.error("[/me/contemplation-health-minutes PUT] failed:", err);
    res.status(500).json({ error: "internal_error" });
    return;
  }

  // After responding: check if this upload just crossed the daily goal.
  // GREATEST means the stored value only grows, so we only fire once per day.
  // Runs outside the main try/catch so a push failure can't retrigger 500.
  const newHealthMin = Math.max(prevHealthMin, minutes);
  if (newHealthMin > prevHealthMin) {
    try {
      const todayStart = new Date(day + "T00:00:00");
      const [userRow, prayerRow] = await Promise.all([
        db.select({ goalMinutes: usersTable.contemplationGoalMinutes })
          .from(usersTable)
          .where(eq(usersTable.id, sessionUserId))
          .then((r) => r[0]),
        db.select({ seconds: sql<number>`COALESCE(SUM(${prayerSessionsTable.durationSeconds}), 0)::int` })
          .from(prayerSessionsTable)
          .where(and(
            eq(prayerSessionsTable.userId, sessionUserId),
            eq(prayerSessionsTable.surface, "contemplation"),
            gte(prayerSessionsTable.endedAt, todayStart),
          ))
          .then((r) => r[0]),
      ]);
      const goalMin = userRow?.goalMinutes ?? 0;
      if (goalMin > 0) {
        const prayerMin = Math.floor((prayerRow?.seconds ?? 0) / 60);
        const oldTotal = prayerMin + prevHealthMin;
        const newTotal = prayerMin + newHealthMin;
        if (oldTotal < goalMin && newTotal >= goalMin) {
          void sendContemplationGoalReachedPush(sessionUserId, { goalMinutes: goalMin, doneMinutes: newTotal }).catch(() => {});
        }
      }
    } catch { /* best-effort — don't surface push errors to the client */ }
  }
});

// PUT /api/me/daily-steps — the iOS client best-effort uploads today's Apple
// Health step count per local day. Stored so the server can fire a "you hit
// your step goal" push (the home card reads steps straight from HealthKit).
// Mirrors /me/contemplation-health-minutes: GREATEST upsert (monotonic within
// the day), ±1-day sanity bound, one push per local day via daily_step_reached_date.
const dailyStepsSchema = z.object({
  // Bounded to reject garbage; a very active day is well under 200k.
  steps: z.number().int().min(0).max(200000),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
router.put("/me/daily-steps", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = dailyStepsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { steps, day } = parsed.data;
  const dayMs = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(dayMs)) { res.status(400).json({ error: "Invalid day" }); return; }
  const now = new Date();
  const utcTodayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (Math.abs(dayMs - utcTodayMs) > 86400000) { res.status(400).json({ error: "Day out of range" }); return; }

  try {
    await db.insert(dailyHealthStepsTable)
      .values({ userId: sessionUserId, day, steps })
      .onConflictDoUpdate({
        target: [dailyHealthStepsTable.userId, dailyHealthStepsTable.day],
        set: {
          steps: sql`GREATEST(${dailyHealthStepsTable.steps}, EXCLUDED.steps)`,
          updatedAt: new Date(),
        },
      });
    res.json({ ok: true });
  } catch (err) {
    console.error("[/me/daily-steps PUT] failed:", err);
    res.status(500).json({ error: "internal_error" });
    return;
  }

  // Daily-steps feature is TURNED OFF for everyone — never fire the "step goal
  // reached" push. (The home card, route, builder toggle, and client step upload
  // are all gone; this is the server-side belt so no step notification can fire
  // for any legacy user who still has a goal stored.)
});

// GET /api/me/daily-steps?day=YYYY-MM-DD — today's step count the iOS app synced
// via the PUT above. The web build has no HealthKit, so it reads the count from
// here instead of showing 0, keeping web and app in agreement. `day` is the
// caller's local day; falls back to the server's UTC day if absent/invalid.
router.get("/me/daily-steps", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const q = typeof req.query.day === "string" ? req.query.day : "";
  const now = new Date();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q)
    ? q
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  try {
    const [row] = await db
      .select({ steps: dailyHealthStepsTable.steps })
      .from(dailyHealthStepsTable)
      .where(and(
        eq(dailyHealthStepsTable.userId, sessionUserId),
        eq(dailyHealthStepsTable.day, day),
      ))
      .limit(1);
    res.json({ steps: row?.steps ?? 0, day });
  } catch (err) {
    console.error("[/me/daily-steps GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// PATCH /api/me/contemplation-sessions/:id/visibility — flip a sit's
// is_private flag. Used by the contemplation summary's public/private
// toggle, which records the sit with an initial value and then PATCHes
// when the user changes their mind. Scoped to the owner + contemplation
// surface for the same reason DELETE below is — so it can never touch
// another user's row or a non-contemplation session.
router.patch("/me/contemplation-sessions/:id/visibility", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = z.object({ isPrivate: z.boolean() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  try {
    await db.update(prayerSessionsTable)
      .set({ isPrivate: parsed.data.isPrivate })
      .where(and(
        eq(prayerSessionsTable.id, id),
        eq(prayerSessionsTable.userId, sessionUserId),
        eq(prayerSessionsTable.surface, "contemplation"),
      ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[/me/contemplation-sessions/:id/visibility PATCH] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// DELETE /api/me/contemplation-sessions/:id — remove one of the viewer's
// own contemplation sessions (e.g. a mis-entered manual log). Scoped to
// the owner AND the contemplation surface so it can never touch another
// user's rows or a non-contemplation session.
router.delete("/me/contemplation-sessions/:id", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(prayerSessionsTable).where(and(
      eq(prayerSessionsTable.id, id),
      eq(prayerSessionsTable.userId, sessionUserId),
      eq(prayerSessionsTable.surface, "contemplation"),
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[/me/contemplation-sessions DELETE] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
