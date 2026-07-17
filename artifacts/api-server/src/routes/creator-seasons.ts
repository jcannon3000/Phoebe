// Creator seasons — a creator turns the practice their content inspired into a
// BOUNDED 2–4 week season people actually live:
//   • one-tap join link (/season/:token) — joining APPLIES the practice
//     (prescribed-routines spec, shared apply machinery) and adds the person
//     to the cohort
//   • a cohort-shared Day-N clock (everyone counts from the same start_ymd —
//     finite is the point)
//   • one daily check-in per member; the group witnesses TODAY's count +
//     first names (presence, not a scoreboard — no history is surfaced)
//   • short async notes from the creator, a few times a week (one-way)
// Creation is super-admin gated for now ("Creator" in Admin tools).
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  creatorSeasonsTable,
  creatorSeasonMembersTable,
  creatorSeasonNotesTable,
  creatorSeasonCheckinsTable,
  usersTable,
  groupsTable,
  groupMembersTable,
  prescribedRoutinesTable,
  prayerFeedsTable,
} from "@workspace/db";
import { sanitizeSpec, applyRoutineSpecToUser } from "../lib/routineSpec";
import { isSuperAdminUser } from "../lib/superAdmin";
import { canManageParish } from "./parish";
import { betaUsersTable } from "@workspace/db";

// Beta user OR super admin — the studio-list gate. (The seasons list carries
// every join token, so it must never be readable by an ordinary session; the
// public no-login app gives ANONYMOUS device users real sessions.)
async function isBetaOrSuperAdmin(userId: number): Promise<boolean> {
  try {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
    if (!u?.email) return false;
    const [beta] = await db.select({ id: betaUsersTable.id }).from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return !!beta;
  } catch { return false; }
}

// Group membership/admin resolution for COMMUNITY seasons (mirrors groups.ts).
function isGroupAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "hidden_admin";
}
async function groupMemberOf(slug: string, userId: number) {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, slug));
  if (!group) return null;
  const [member] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.userId, userId)));
  if (!member || !member.joinedAt) return null;
  return { group, member };
}

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

const TOKEN_RE = /^[a-f0-9]{32}$/i;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// Day N of the season for a local calendar day: 1 on start_ymd. 0/negative =
// hasn't started; > durationDays = finished. Pure calendar-string math (both
// sides are YYYY-MM-DD) so timezones can't skew it.
function dayNumber(startYmd: string, todayYmd: string): number {
  const start = Date.parse(`${startYmd}T00:00:00Z`);
  const today = Date.parse(`${todayYmd}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(today)) return 0;
  return Math.round((today - start) / 86_400_000) + 1;
}

// The caller's local day, from an optional ?ymd= (validated) falling back to
// server UTC — same viewer-tz convention as the other check-in surfaces.
// CLAMPED to within one day of the server's UTC date: a client-supplied ymd
// exists only to absorb timezone offsets, never to browse other days — an
// unclamped value would let a member read any past day's kept-names (breaking
// "no history is surfaced") or backfill/pre-fill check-ins for the whole season.
function callerYmd(raw: unknown): string {
  const serverToday = new Date().toISOString().slice(0, 10);
  if (typeof raw === "string" && YMD_RE.test(raw)) {
    const t = Date.parse(`${raw}T00:00:00Z`);
    const s = Date.parse(`${serverToday}T00:00:00Z`);
    if (Number.isFinite(t) && Math.abs(t - s) <= 86_400_000) return raw;
  }
  return serverToday;
}

// ── POST /api/creator/seasons — create (super admin) ─────────────────────────
router.post("/creator/seasons", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isSuperAdminUser(me))) { res.status(403).json({ error: "Admin access required" }); return; }
  const body = (req.body ?? {}) as {
    title?: unknown; creatorName?: unknown; description?: unknown;
    spec?: unknown; durationDays?: unknown; startYmd?: unknown;
  };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const creatorName = typeof body.creatorName === "string" ? body.creatorName.trim().slice(0, 80) : "";
  if (!title || !creatorName) { res.status(400).json({ error: "title and creatorName required" }); return; }
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) || null : null;
  const spec = sanitizeSpec(body.spec);
  if (!spec) { res.status(400).json({ error: "Invalid routine spec" }); return; }
  // 2–4 weeks; finite is the point.
  const durationDays = typeof body.durationDays === "number" && Number.isFinite(body.durationDays)
    ? Math.max(7, Math.min(28, Math.round(body.durationDays))) : 21;
  const startYmd = typeof body.startYmd === "string" && YMD_RE.test(body.startYmd)
    ? body.startYmd : new Date().toISOString().slice(0, 10);
  const token = crypto.randomBytes(16).toString("hex");
  try {
    const [row] = await db.insert(creatorSeasonsTable).values({
      token, title, creatorName, description, spec, durationDays, startYmd, createdByUserId: me,
    }).returning({ id: creatorSeasonsTable.id });
    res.json({ id: row?.id, token, url: `https://withphoebe.app/season/${token}` });
  } catch (err) {
    console.error("[creator-seasons] create failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/creator/seasons — list (super admin OR beta; the studio index) ──
router.get("/creator/seasons", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  // The list exposes every season's join token — beta/super-admin only
  // (matches the client studio gate; anonymous sessions must not enumerate).
  if (!(await isBetaOrSuperAdmin(me))) { res.status(403).json({ error: "Admin access required" }); return; }
  try {
    const rows = await db.select({
      id: creatorSeasonsTable.id,
      token: creatorSeasonsTable.token,
      title: creatorSeasonsTable.title,
      creatorName: creatorSeasonsTable.creatorName,
      durationDays: creatorSeasonsTable.durationDays,
      startYmd: creatorSeasonsTable.startYmd,
      createdAt: creatorSeasonsTable.createdAt,
    }).from(creatorSeasonsTable).orderBy(desc(creatorSeasonsTable.createdAt)).limit(50);
    const ids = rows.map((r) => r.id);
    const counts = ids.length > 0
      ? await db.select({
          seasonId: creatorSeasonMembersTable.seasonId,
          n: sql<number>`count(*)::int`,
        }).from(creatorSeasonMembersTable)
          .where(inArray(creatorSeasonMembersTable.seasonId, ids))
          .groupBy(creatorSeasonMembersTable.seasonId)
      : [];
    const byId = new Map(counts.map((c) => [c.seasonId, Number(c.n)]));
    res.json({ seasons: rows.map((r) => ({ ...r, memberCount: byId.get(r.id) ?? 0 })) });
  } catch (err) {
    console.error("[creator-seasons] list failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/creator/seasons/:token — public landing + member day view ───────
// One endpoint for both: the landing fields are public; when the caller is a
// member it also carries the day's check-in state, today's witnesses, and the
// creator's notes.
router.get("/creator/seasons/:token", async (req, res): Promise<void> => {
  const token = req.params.token;
  if (!TOKEN_RE.test(token)) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const [season] = await db.select().from(creatorSeasonsTable)
      .where(eq(creatorSeasonsTable.token, token)).limit(1);
    if (!season) { res.status(404).json({ error: "Not found" }); return; }

    const [{ n: memberCount }] = await db.select({ n: sql<number>`count(*)::int` })
      .from(creatorSeasonMembersTable).where(eq(creatorSeasonMembersTable.seasonId, season.id));

    const me = getUserId(req);
    let membership: { joined: boolean } | null = null;
    let today: { ymd: string; day: number; checkedIn: boolean; keptCount: number; keptNames: string[] } | null = null;
    let notes: Array<{ id: number; body: string; createdAt: Date | null }> | null = null;
    if (me) {
      const [m] = await db.select({ id: creatorSeasonMembersTable.id }).from(creatorSeasonMembersTable)
        .where(and(eq(creatorSeasonMembersTable.seasonId, season.id), eq(creatorSeasonMembersTable.userId, me)));
      membership = { joined: !!m };
      if (m) {
        const ymd = callerYmd(req.query.ymd);
        const day = dayNumber(season.startYmd, ymd);
        const kept = await db.select({
          userId: creatorSeasonCheckinsTable.userId,
          name: usersTable.name,
        }).from(creatorSeasonCheckinsTable)
          .innerJoin(usersTable, eq(usersTable.id, creatorSeasonCheckinsTable.userId))
          .where(and(eq(creatorSeasonCheckinsTable.seasonId, season.id), eq(creatorSeasonCheckinsTable.ymd, ymd)))
          .limit(200);
        // First names only — witnessing, not identifying.
        const keptNames = kept.filter((k) => k.userId !== me)
          .map((k) => (k.name ?? "Someone").split(/\s+/)[0] ?? "Someone").slice(0, 12);
        today = {
          ymd, day,
          checkedIn: kept.some((k) => k.userId === me),
          keptCount: kept.length,
          keptNames,
        };
        const noteRows = await db.select({
          id: creatorSeasonNotesTable.id,
          body: creatorSeasonNotesTable.body,
          createdAt: creatorSeasonNotesTable.createdAt,
        }).from(creatorSeasonNotesTable)
          .where(eq(creatorSeasonNotesTable.seasonId, season.id))
          .orderBy(desc(creatorSeasonNotesTable.createdAt)).limit(30);
        notes = noteRows;
      }
    }

    res.json({
      title: season.title,
      creatorName: season.creatorName,
      description: season.description,
      durationDays: season.durationDays,
      startYmd: season.startYmd,
      memberCount: Number(memberCount ?? 0),
      spec: season.spec,
      joined: membership?.joined ?? false,
      today,
      notes,
    });
  } catch (err) {
    console.error("[creator-seasons] get failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/creator/seasons/:token/join — apply the practice + enter cohort ─
router.post("/creator/seasons/:token/join", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = req.params.token;
  if (!TOKEN_RE.test(token)) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const [season] = await db.select({
      id: creatorSeasonsTable.id, spec: creatorSeasonsTable.spec,
      startYmd: creatorSeasonsTable.startYmd, durationDays: creatorSeasonsTable.durationDays,
      groupId: creatorSeasonsTable.groupId, parishFeedId: creatorSeasonsTable.parishFeedId,
    }).from(creatorSeasonsTable).where(eq(creatorSeasonsTable.token, token)).limit(1);
    if (!season) { res.status(404).json({ error: "Not found" }); return; }
    // Community/parish seasons are NOT open by token: only the group's members /
    // the parish's subscribers may join. Otherwise a leaked link (poster, forward)
    // lets an outsider into the cohort — inflating the count and, once joined,
    // reading the day's check-in first-names of every member. Creator seasons
    // (both null) stay open by design.
    if (season.groupId != null) {
      const [member] = await db.select({ joinedAt: groupMembersTable.joinedAt })
        .from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, season.groupId), eq(groupMembersTable.userId, me)));
      if (!member || !member.joinedAt) { res.status(403).json({ error: "Join the group first" }); return; }
    } else if (season.parishFeedId != null) {
      const [u] = await db.select({ parishFeedId: usersTable.parishFeedId }).from(usersTable).where(eq(usersTable.id, me));
      if (!u || u.parishFeedId !== season.parishFeedId) { res.status(403).json({ error: "Join the parish first" }); return; }
    }
    // Finite is the point — once the season has ended, the link stops joining
    // (and stops overwriting routines).
    if (dayNumber(season.startYmd, new Date().toISOString().slice(0, 10)) > season.durationDays) {
      res.status(409).json({ error: "This season has ended" }); return;
    }
    const spec = sanitizeSpec(season.spec);
    if (!spec) { res.status(422).json({ error: "Season is no longer valid" }); return; }
    await db.insert(creatorSeasonMembersTable)
      .values({ seasonId: season.id, userId: me })
      .onConflictDoNothing();
    // Membership first, THEN apply — a failed insert must not leave the
    // person's whole routine replaced by a season they never entered.
    await applyRoutineSpecToUser(me, spec);
    res.json({ ok: true });
  } catch (err) {
    console.error("[creator-seasons] join failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/creator/seasons/:token/checkin — "I kept it today" ─────────────
router.post("/creator/seasons/:token/checkin", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = req.params.token;
  if (!TOKEN_RE.test(token)) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const [season] = await db.select({
      id: creatorSeasonsTable.id,
      startYmd: creatorSeasonsTable.startYmd,
      durationDays: creatorSeasonsTable.durationDays,
    }).from(creatorSeasonsTable).where(eq(creatorSeasonsTable.token, token)).limit(1);
    if (!season) { res.status(404).json({ error: "Not found" }); return; }
    const [m] = await db.select({ id: creatorSeasonMembersTable.id }).from(creatorSeasonMembersTable)
      .where(and(eq(creatorSeasonMembersTable.seasonId, season.id), eq(creatorSeasonMembersTable.userId, me)));
    if (!m) { res.status(403).json({ error: "Join the season first" }); return; }
    const ymd = callerYmd((req.body ?? {}).ymd);
    const day = dayNumber(season.startYmd, ymd);
    // The season is bounded — check-ins only count inside it.
    if (day < 1 || day > season.durationDays) { res.status(409).json({ error: "Season is not active today" }); return; }
    await db.insert(creatorSeasonCheckinsTable)
      .values({ seasonId: season.id, userId: me, ymd })
      .onConflictDoNothing();
    res.json({ ok: true, day });
  } catch (err) {
    console.error("[creator-seasons] checkin failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/creator/seasons/:token/notes — creator's async note ────────────
router.post("/creator/seasons/:token/notes", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = req.params.token;
  if (!TOKEN_RE.test(token)) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const [season] = await db.select({ id: creatorSeasonsTable.id, createdByUserId: creatorSeasonsTable.createdByUserId, groupId: creatorSeasonsTable.groupId, parishFeedId: creatorSeasonsTable.parishFeedId })
      .from(creatorSeasonsTable).where(eq(creatorSeasonsTable.token, token)).limit(1);
    if (!season) { res.status(404).json({ error: "Not found" }); return; }
    // The season's creator, any super admin — or, for a COMMUNITY season, any
    // leader of the group it belongs to; for a PARISH season, any parish admin
    // (leaders / priests share the shepherding).
    let allowed = season.createdByUserId === me || (await isSuperAdminUser(me));
    if (!allowed && season.groupId != null) {
      const [member] = await db.select({ role: groupMembersTable.role, joinedAt: groupMembersTable.joinedAt })
        .from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, season.groupId), eq(groupMembersTable.userId, me)));
      allowed = !!member && !!member.joinedAt && isGroupAdminRole(member.role);
    }
    if (!allowed && season.parishFeedId != null) {
      allowed = (await canManageParish(me, season.parishFeedId)).allowed;
    }
    if (!allowed) {
      res.status(403).json({ error: "Only the creator can post notes" }); return;
    }
    const body = typeof (req.body ?? {}).body === "string" ? ((req.body as { body: string }).body).trim().slice(0, 2000) : "";
    if (!body) { res.status(400).json({ error: "body required" }); return; }
    await db.insert(creatorSeasonNotesTable).values({ seasonId: season.id, authorUserId: me, body });
    res.json({ ok: true });
  } catch (err) {
    console.error("[creator-seasons] note failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ═══ COMMUNITY seasons (BETA) — a group's leaders run a bounded season ═══════
//
// "Our community keeps its rule together for these three weeks." A community
// season is a creator_seasons row with group_id set: its spec is a SNAPSHOT of
// the group's rule of life at start (joining = taking up the rule for the
// season + entering the cohort), its creatorName is the community's name, and
// its notes may be posted by any group leader. The member experience is the
// existing /season/:token page — Day-N clock, one-tap check-ins witnessed as
// today's count + first names, leader notes.

// POST /api/groups/:slug/season — a leader starts a season (requires the
// group to have a rule of life; one ACTIVE season at a time).
router.post("/groups/:slug/season", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await groupMemberOf(req.params.slug, me);
  if (!result || !isGroupAdminRole(result.member.role)) { res.status(403).json({ error: "Admin access required" }); return; }
  const ruleId = (result.group as { ruleRoutineId?: number | null }).ruleRoutineId ?? null;
  if (!ruleId) { res.status(409).json({ error: "Set your community's rule of life first" }); return; }
  const [rule] = await db.select({ spec: prescribedRoutinesTable.spec, label: prescribedRoutinesTable.label })
    .from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.id, ruleId)).limit(1);
  const spec = rule ? sanitizeSpec(rule.spec) : null;
  if (!rule || !spec) { res.status(409).json({ error: "Set your community's rule of life first" }); return; }

  const body = (req.body ?? {}) as { title?: unknown; durationDays?: unknown; startYmd?: unknown };
  const durationDays = typeof body.durationDays === "number" && Number.isFinite(body.durationDays)
    ? Math.max(7, Math.min(28, Math.round(body.durationDays))) : 21;
  const startYmd = typeof body.startYmd === "string" && YMD_RE.test(body.startYmd)
    ? body.startYmd : new Date().toISOString().slice(0, 10);
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 120)
    : (rule.label?.trim() ? `${rule.label.trim()} — a season together` : "A season together");

  try {
    // One ACTIVE season per group — starting a new one while another runs is a
    // conflict (finite is the point; overlapping clocks would blur it).
    const existing = await db.select({
      id: creatorSeasonsTable.id, startYmd: creatorSeasonsTable.startYmd, durationDays: creatorSeasonsTable.durationDays,
    }).from(creatorSeasonsTable).where(eq(creatorSeasonsTable.groupId, result.group.id));
    const today = new Date().toISOString().slice(0, 10);
    const active = existing.find((s) => dayNumber(s.startYmd, today) <= s.durationDays);
    if (active) { res.status(409).json({ error: "A season is already running" }); return; }

    const token = crypto.randomBytes(16).toString("hex");
    await db.insert(creatorSeasonsTable).values({
      token, title, creatorName: result.group.name, description: null,
      spec, durationDays, startYmd, createdByUserId: me, groupId: result.group.id,
    });
    res.json({ ok: true, token, url: `https://withphoebe.app/season/${token}` });
  } catch (err) {
    console.error("[community-season] create failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/groups/:slug/season — the group's current season, for the
// community-page card. Members only.
router.get("/groups/:slug/season", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await groupMemberOf(req.params.slug, me);
  if (!result) { res.status(403).json({ error: "Members only" }); return; }
  try {
    const rows = await db.select({
      id: creatorSeasonsTable.id,
      token: creatorSeasonsTable.token,
      title: creatorSeasonsTable.title,
      startYmd: creatorSeasonsTable.startYmd,
      durationDays: creatorSeasonsTable.durationDays,
    }).from(creatorSeasonsTable)
      .where(eq(creatorSeasonsTable.groupId, result.group.id))
      .orderBy(desc(creatorSeasonsTable.createdAt)).limit(1);
    const season = rows[0];
    const isAdmin = isGroupAdminRole(result.member.role);
    if (!season) { res.json({ season: null, isAdmin }); return; }
    const today = new Date().toISOString().slice(0, 10);
    const day = dayNumber(season.startYmd, today);
    if (day > season.durationDays) {
      // Finished — the card returns to its invitation state.
      res.json({ season: null, isAdmin }); return;
    }
    const [countRow] = await db.select({ n: sql<number>`count(*)::int` })
      .from(creatorSeasonMembersTable).where(eq(creatorSeasonMembersTable.seasonId, season.id));
    const [mine] = await db.select({ id: creatorSeasonMembersTable.id }).from(creatorSeasonMembersTable)
      .where(and(eq(creatorSeasonMembersTable.seasonId, season.id), eq(creatorSeasonMembersTable.userId, me)));
    res.json({
      season: {
        token: season.token, title: season.title, startYmd: season.startYmd,
        durationDays: season.durationDays, day, memberCount: Number(countRow?.n ?? 0), joined: !!mine,
      },
      isAdmin,
    });
  } catch (err) {
    console.error("[community-season] get failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ═══ PARISH seasons — a priest runs a bounded season for the congregation ════
//
// "Pray with your priest." Unlike a community season (which snapshots the
// group's standing rule of life), a parish has no rule, so the priest DESIGNS
// the season's rhythm with the customizer and posts its spec here. Everything
// else is identical: the /season/:token player, Day-N clock, check-ins, and the
// priest's occasional notes. Gated by canManageParish.

// POST /api/parish/season — a priest starts a season with a designed spec.
router.post("/parish/season", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = (req.body ?? {}) as {
    parishId?: unknown; spec?: unknown; title?: unknown; durationDays?: unknown; startYmd?: unknown;
  };
  const parishId = typeof body.parishId === "number" ? body.parishId : NaN;
  if (!Number.isFinite(parishId)) { res.status(400).json({ error: "parishId required" }); return; }
  const { allowed, parish } = await canManageParish(me, parishId);
  if (!allowed || !parish) { res.status(403).json({ error: "Not a parish admin." }); return; }

  const spec = sanitizeSpec(body.spec);
  if (!spec) { res.status(400).json({ error: "Invalid routine spec" }); return; }
  const durationDays = typeof body.durationDays === "number" && Number.isFinite(body.durationDays)
    ? Math.max(7, Math.min(28, Math.round(body.durationDays))) : 21;
  const startYmd = typeof body.startYmd === "string" && YMD_RE.test(body.startYmd)
    ? body.startYmd : new Date().toISOString().slice(0, 10);
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 120) : "A season together";

  try {
    // One ACTIVE season per parish (finite is the point — no overlapping clocks).
    const existing = await db.select({
      startYmd: creatorSeasonsTable.startYmd, durationDays: creatorSeasonsTable.durationDays,
    }).from(creatorSeasonsTable).where(eq(creatorSeasonsTable.parishFeedId, parishId));
    const today = new Date().toISOString().slice(0, 10);
    if (existing.find((s) => dayNumber(s.startYmd, today) <= s.durationDays)) {
      res.status(409).json({ error: "A season is already running" }); return;
    }
    const token = crypto.randomBytes(16).toString("hex");
    await db.insert(creatorSeasonsTable).values({
      token, title, creatorName: parish.title ?? "Your parish", description: null,
      spec, durationDays, startYmd, createdByUserId: me, parishFeedId: parishId,
    });
    res.json({ ok: true, token, url: `https://withphoebe.app/season/${token}` });
  } catch (err) {
    console.error("[parish-season] create failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/parish/season?parishId= — the parish's current season, for the
// parishioner's dashboard card + the admin manager. Subscriber OR admin.
router.get("/parish/season", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parishId = Number(req.query.parishId);
  if (!Number.isFinite(parishId)) { res.status(400).json({ error: "parishId required" }); return; }
  try {
    const [user] = await db.select({ parishFeedId: usersTable.parishFeedId }).from(usersTable).where(eq(usersTable.id, me));
    const isSubscriber = !!user && user.parishFeedId === parishId;
    const isAdmin = (await canManageParish(me, parishId)).allowed;
    if (!isSubscriber && !isAdmin) { res.status(403).json({ error: "Not subscribed to this parish." }); return; }

    const rows = await db.select({
      id: creatorSeasonsTable.id, token: creatorSeasonsTable.token, title: creatorSeasonsTable.title,
      startYmd: creatorSeasonsTable.startYmd, durationDays: creatorSeasonsTable.durationDays,
    }).from(creatorSeasonsTable)
      .where(eq(creatorSeasonsTable.parishFeedId, parishId))
      .orderBy(desc(creatorSeasonsTable.createdAt)).limit(1);
    const season = rows[0];
    if (!season) { res.json({ season: null, isAdmin }); return; }
    const today = new Date().toISOString().slice(0, 10);
    const day = dayNumber(season.startYmd, today);
    if (day > season.durationDays) { res.json({ season: null, isAdmin }); return; }
    const [countRow] = await db.select({ n: sql<number>`count(*)::int` })
      .from(creatorSeasonMembersTable).where(eq(creatorSeasonMembersTable.seasonId, season.id));
    const [mine] = await db.select({ id: creatorSeasonMembersTable.id }).from(creatorSeasonMembersTable)
      .where(and(eq(creatorSeasonMembersTable.seasonId, season.id), eq(creatorSeasonMembersTable.userId, me)));
    res.json({
      season: {
        token: season.token, title: season.title, startYmd: season.startYmd,
        durationDays: season.durationDays, day, memberCount: Number(countRow?.n ?? 0), joined: !!mine,
      },
      isAdmin,
    });
  } catch (err) {
    console.error("[parish-season] get failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
