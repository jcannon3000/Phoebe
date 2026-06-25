// walkProgress — the server-side mirror of a user's "today's rhythm" dots, for
// showing a walking companion what anchors you've kept TODAY (and nothing else).
//
// The client's own dots come from useRhythmState (mymonastery), which blends
// server rows, per-device localStorage, and live HealthKit. A COMPANION can
// only ever see SERVER-backed truth, computed in the OTHER person's timezone —
// so this re-derives each anchor's "done today" from the same authoritative
// sources the user's own app reads, but parameterized by the partner's tz:
//   • morning / evening  → prayer_sessions  (mirrors GET /me/office-history-week)
//   • reflect            → reflection_reads (fdd|ssje) OR cac_reads
//   • silence            → prayer_sessions 'contemplation' + contemplation_health_minutes
//                          vs the goal (mirrors GET /me/contemplation-stats + useRhythmState)
//   • gratitude / examen → practice_completion (only if on their home layout)
//   • steps              → users.daily_step_reached_date (only if a goal is set + on home)
//
// Deliberately EXCLUDED (can't be known server-side / never shared): custom
// localStorage anchors, exact times, history, streaks across users.
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db,
  usersTable,
  reflectionReadsTable,
  practiceCompletionTable,
  contemplationHealthMinutesTable,
} from "@workspace/db";

export type WalkAnchor = { key: string; label: string; emoji: string; done: boolean };
export type WalkProgress = {
  ymd: string;            // the companion's local calendar day (their tz)
  tz: string;             // the tz used to bucket "today"
  anchors: WalkAnchor[];  // only the anchors that are part of THEIR rhythm
  keptCount: number;
  totalCount: number;
  allKept: boolean;       // true only when they have anchors and kept them all
};

// Same shape/rule as useRhythmState.homeCardActive (HOME_LAYOUT_VERSION = 2):
// an optional practice counts only when the saved home layout is current AND the
// key is present in the order AND not hidden. homeLayout carries a runtime `v`
// the drizzle type omits, so we read it through a loose shape.
const HOME_LAYOUT_VERSION = 2;
function homeCardActive(
  homeLayout: { order?: string[]; hidden?: string[]; v?: number } | null | undefined,
  key: string,
): boolean {
  if (!homeLayout || homeLayout.v !== HOME_LAYOUT_VERSION) return false;
  const order = homeLayout.order ?? [];
  const hidden = new Set(homeLayout.hidden ?? []);
  return order.includes(key) && !hidden.has(key);
}

const TZ_RE = /^[A-Za-z0-9_+\-/]{1,64}$/;
function ymdInTz(tz: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
  catch { return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date()); }
}

// THE chokepoint. Returns null only if the user no longer exists. All booleans
// are server-derived in the user's own timezone, matching what they'd see.
//
// ⚠️ AUTHORIZATION IS THE CALLER'S JOB. This function does NO consent check — it
// returns ANY user's today-dots. Only ever call it AFTER verifying the requester
// is in an ACTIVE walk pairing with `userId` AND still a fellow (see routes/walk.ts
// GET /walk, which gates on loadMyPair membership + fellowSubset). Never expose it
// on a new endpoint without that gate.
export async function getWalkProgressForToday(userId: number): Promise<WalkProgress | null> {
  const [u] = await db
    .select({
      timezone: usersTable.timezone,
      morning: usersTable.parishOfficeMorningPref,
      evening: usersTable.parishOfficeEveningPref,
      contemplationGoalMinutes: usersTable.contemplationGoalMinutes,
      homeLayout: usersTable.homeLayout,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!u) return null;

  const tz = u.timezone && TZ_RE.test(u.timezone) ? u.timezone : "UTC";
  const ymd = ymdInTz(tz);

  // Which anchors are part of THEIR rhythm (mirror useRhythmState's *Active).
  const morningActive = (u.morning ?? "devotion") !== "none";
  const eveningActive = (u.evening ?? "none") !== "none";
  const goalMin = u.contemplationGoalMinutes ?? 5;
  const silenceActive = goalMin > 0;
  // reflect is on by default (a source is always chosen unless explicitly off,
  // which is a localStorage-only signal we can't see — treat as active).
  const reflectActive = true;
  const gratitudeActive = homeCardActive(u.homeLayout, "gratitude");
  const examenActive = homeCardActive(u.homeLayout, "examen");

  // ── Office (morning / evening) — mirrors /me/office-history-week, today only.
  const officeRows = await db.execute<{ side: string }>(sql`
    SELECT DISTINCT
      CASE
        WHEN surface IN ('morning-prayer', 'morning-devotion', 'national-cathedral', 'morning-office-podcast') THEN 'morning'
        WHEN surface IN ('evening-prayer', 'early-evening-devotion', 'evening-office-podcast') THEN 'evening'
      END AS side
    FROM prayer_sessions
    WHERE user_id = ${userId}
      AND to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') = ${ymd}
      AND (
        (surface IN ('morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion') AND completed = TRUE)
        OR (surface = 'national-cathedral' AND duration_seconds >= 180)
        OR (surface IN ('morning-office-podcast', 'evening-office-podcast') AND completed = TRUE)
      )
  `);
  const officeSides = new Set(officeRows.rows.map((r) => r.side));
  const morningDone = officeSides.has("morning");
  const eveningDone = officeSides.has("evening");

  // ── Reflect — any FDD/SSJE read OR a CAC read today (cac_reads is raw SQL).
  const reflRows = await db
    .select({ source: reflectionReadsTable.source })
    .from(reflectionReadsTable)
    .where(and(eq(reflectionReadsTable.userId, userId), eq(reflectionReadsTable.ymd, ymd)))
    .limit(1);
  let reflectDone = reflRows.length > 0;
  if (!reflectDone) {
    const cac = await db.execute<{ one: number }>(
      sql`SELECT 1 AS one FROM cac_reads WHERE user_id = ${userId} AND ymd = ${ymd} LIMIT 1`,
    );
    reflectDone = cac.rows.length > 0;
  }

  // ── Silence — in-app contemplation seconds today + external Health minutes,
  // vs the goal. Mirrors /me/contemplation-stats (no is_private filter) +
  // useRhythmState's contemplationMin / silenceDone.
  let silenceDone = false;
  if (silenceActive) {
    const [secRow] = (await db.execute<{ seconds: number }>(sql`
      SELECT COALESCE(SUM(duration_seconds), 0)::int AS seconds
      FROM prayer_sessions
      WHERE user_id = ${userId}
        AND surface = 'contemplation'
        AND to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') = ${ymd}
    `)).rows;
    const [healthRow] = await db
      .select({ minutes: contemplationHealthMinutesTable.minutes })
      .from(contemplationHealthMinutesTable)
      .where(and(
        eq(contemplationHealthMinutesTable.userId, userId),
        eq(contemplationHealthMinutesTable.day, ymd),
      ));
    const contemplationMin = Math.floor((secRow?.seconds ?? 0) / 60) + (healthRow?.minutes ?? 0);
    silenceDone = contemplationMin >= goalMin;
  }

  // ── Gratitude / examen — server practice_completion rows for today.
  let gratitudeDone = false;
  let examenDone = false;
  if (gratitudeActive || examenActive) {
    const rows = await db
      .select({ section: practiceCompletionTable.section })
      .from(practiceCompletionTable)
      .where(and(
        eq(practiceCompletionTable.userId, userId),
        eq(practiceCompletionTable.localDate, ymd),
        inArray(practiceCompletionTable.section, ["gratitude", "examen"]),
      ));
    const done = new Set(rows.map((r) => r.section));
    gratitudeDone = gratitudeActive && done.has("gratitude");
    examenDone = examenActive && done.has("examen");
  }

  // Canonical order matches the user's own rhythm (core, then optional).
  const anchors: WalkAnchor[] = [];
  if (morningActive) anchors.push({ key: "morning", label: "Morning prayer", emoji: "🌅", done: morningDone });
  if (reflectActive) anchors.push({ key: "reflect", label: "Reflection", emoji: "📖", done: reflectDone });
  if (silenceActive) anchors.push({ key: "silence", label: "Silence", emoji: "🕊️", done: silenceDone });
  if (eveningActive) anchors.push({ key: "evening", label: "Evening prayer", emoji: "🌙", done: eveningDone });
  if (gratitudeActive) anchors.push({ key: "gratitude", label: "Gratitude", emoji: "🙏", done: gratitudeDone });
  if (examenActive) anchors.push({ key: "examen", label: "Examen", emoji: "🔎", done: examenDone });

  const keptCount = anchors.filter((a) => a.done).length;
  const totalCount = anchors.length;
  return { ymd, tz, anchors, keptCount, totalCount, allKept: totalCount > 0 && keptCount === totalCount };
}

export type FellowLights = { turned: boolean; learned: boolean; prayed: boolean };

// The fellow-visible projection — three coarse, TODAY-ONLY, BINARY lights:
// Turn = a presence act today; Learn = any reflection read; Pray = any office /
// devotion / contemplative completion. It NEVER reveals which / how many / how
// long — the monk who prays the full office and the person who managed one
// devotion light the SAME dot. AUTHORIZATION IS THE CALLER'S JOB (same as
// getWalkProgressForToday): only call for an accepted, mutual fellow.
export async function getFellowLightsForToday(userId: number): Promise<FellowLights> {
  const [u] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return { turned: false, learned: false, prayed: false };
  const tz = u.timezone && TZ_RE.test(u.timezone) ? u.timezone : "UTC";
  const ymd = ymdInTz(tz);

  // Pray — any office/devotion completion OR a contemplation sit today.
  const pray = await db.execute<{ one: number }>(sql`
    SELECT 1 AS one FROM prayer_sessions
    WHERE user_id = ${userId}
      AND to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') = ${ymd}
      AND (
        (surface IN ('morning-prayer','morning-devotion','evening-prayer','early-evening-devotion') AND completed = TRUE)
        OR (surface = 'national-cathedral' AND duration_seconds >= 180)
        OR (surface IN ('morning-office-podcast','evening-office-podcast') AND completed = TRUE)
        OR (surface = 'contemplation' AND duration_seconds >= 30)
      )
    LIMIT 1
  `);
  const prayed = pray.rows.length > 0;

  // Learn — any FDD/SSJE read OR a CAC read today.
  const refl = await db
    .select({ s: reflectionReadsTable.source })
    .from(reflectionReadsTable)
    .where(and(eq(reflectionReadsTable.userId, userId), eq(reflectionReadsTable.ymd, ymd)))
    .limit(1);
  let learned = refl.length > 0;
  if (!learned) {
    const cac = await db.execute<{ one: number }>(sql`SELECT 1 AS one FROM cac_reads WHERE user_id = ${userId} AND ymd = ${ymd} LIMIT 1`);
    learned = cac.rows.length > 0;
  }

  // Turn — a presence act today (passive dwell, recorded by the client).
  const turn = await db.execute<{ one: number }>(sql`SELECT 1 AS one FROM presence_turns WHERE user_id = ${userId} AND ymd = ${ymd} LIMIT 1`);
  const turned = turn.rows.length > 0;

  return { turned, learned, prayed };
}

// Batched version of getFellowLightsForToday for a SET of users — the fellows
// list needs lights for every fellow, and calling the single-user function in a
// loop was ~5 round-trips PER fellow (N×5). This does a fixed ~5 queries total,
// regardless of fellow count, with each user's "today" computed in THEIR own
// timezone in SQL. Same authorization caveat: the caller must have already
// confirmed these are accepted, mutual fellows.
export async function getFellowLightsForUsers(userIds: number[]): Promise<Map<number, FellowLights>> {
  const out = new Map<number, FellowLights>();
  for (const id of userIds) out.set(id, { turned: false, learned: false, prayed: false });
  if (userIds.length === 0) return out;

  const users = await db.select({ id: usersTable.id, timezone: usersTable.timezone })
    .from(usersTable).where(inArray(usersTable.id, userIds));
  const targets = users.map((u) => {
    const tz = u.timezone && TZ_RE.test(u.timezone) ? u.timezone : "UTC";
    return { id: u.id, tz, ymd: ymdInTz(tz) };
  });
  if (targets.length === 0) return out;

  // (id, tz, ymd) rows for the tz-aware prayer-sessions join, and (id, ymd)
  // pairs for the plain ymd-keyed tables.
  const tzValues = sql.join(targets.map((t) => sql`(${t.id}, ${t.tz}, ${t.ymd})`), sql`, `);
  const ymdPairs = sql.join(targets.map((t) => sql`(${t.id}, ${t.ymd})`), sql`, `);

  const [pray, refl, cac, turn] = await Promise.all([
    db.execute<{ user_id: number }>(sql`
      SELECT DISTINCT ps.user_id FROM prayer_sessions ps
      JOIN (VALUES ${tzValues}) AS t(uid, tz, ymd) ON t.uid = ps.user_id
      WHERE to_char((ps.ended_at AT TIME ZONE t.tz)::date, 'YYYY-MM-DD') = t.ymd
        AND (
          (ps.surface IN ('morning-prayer','morning-devotion','evening-prayer','early-evening-devotion') AND ps.completed = TRUE)
          OR (ps.surface = 'national-cathedral' AND ps.duration_seconds >= 180)
          OR (ps.surface IN ('morning-office-podcast','evening-office-podcast') AND ps.completed = TRUE)
          OR (ps.surface = 'contemplation' AND ps.duration_seconds >= 30)
        )
    `),
    db.execute<{ user_id: number }>(sql`SELECT DISTINCT user_id FROM reflection_reads WHERE (user_id, ymd) IN (${ymdPairs})`),
    db.execute<{ user_id: number }>(sql`SELECT DISTINCT user_id FROM cac_reads WHERE (user_id, ymd) IN (${ymdPairs})`),
    db.execute<{ user_id: number }>(sql`SELECT DISTINCT user_id FROM presence_turns WHERE (user_id, ymd) IN (${ymdPairs})`),
  ]);

  for (const r of pray.rows) { const e = out.get(r.user_id); if (e) e.prayed = true; }
  for (const r of refl.rows) { const e = out.get(r.user_id); if (e) e.learned = true; }
  for (const r of cac.rows) { const e = out.get(r.user_id); if (e) e.learned = true; }
  for (const r of turn.rows) { const e = out.get(r.user_id); if (e) e.turned = true; }
  return out;
}

// Record the viewer's "Turn" (presence) for today, in their own timezone.
// Idempotent — one Turn per local day.
export async function recordTurn(userId: number): Promise<void> {
  const [u] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
  const tz = u?.timezone && TZ_RE.test(u.timezone) ? u.timezone : "UTC";
  const ymd = ymdInTz(tz);
  await db.execute(sql`INSERT INTO presence_turns (user_id, ymd) VALUES (${userId}, ${ymd}) ON CONFLICT (user_id, ymd) DO NOTHING`);
}
