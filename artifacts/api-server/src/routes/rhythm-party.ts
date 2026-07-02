// Keeping a rhythm together — 2–3 people sharing one 30-day commitment.
//
// The creator commits to a rhythm and shares an invite link that CARRIES THE
// RULE ITSELF (the preset id): accepting applies the same rhythm and aligns
// everyone to one shared Day-N counter. Presence over surveillance — the home
// band shows only whether each companion has kept TODAY, never their history.
//
// Independent of Fellows/beta gating: the link works for anyone signed in. (The
// client may also offer to pick companions from Fellows, but that's optional.)
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, rhythmPartiesTable, rhythmPartyMembersTable, usersTable, breathSessionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { todayDateInTz, isValidTimeZone } from "../lib/tz";

const router: IRouter = Router();
const MAX_MEMBERS = 3; // a triad at most — three is a prayer, five is a leaderboard

function meId(req: { user?: unknown }): number | null {
  return req.user ? (req.user as { id: number }).id : null;
}
function tzOf(u: { timezone: string | null } | undefined): string {
  return u?.timezone && isValidTimeZone(u.timezone) ? u.timezone : "UTC";
}
function daysBetweenYmd(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

// Did this user do ANY server-recorded prayer today (their local day)? Mirrors
// the "kept" union behind /api/me/prayer-days (a prayer_session of any surface,
// or a Co-Breathe breath). Reflections are localStorage-only, so a companion's
// reflection-only day won't show as kept — acceptable for the today-ring.
async function keptToday(userId: number, tz: string): Promise<boolean> {
  const today = todayDateInTz(tz);
  const b = await db
    .select({ id: breathSessionsTable.id })
    .from(breathSessionsTable)
    .where(and(eq(breathSessionsTable.userId, userId), eq(breathSessionsTable.day, today)))
    .limit(1);
  if (b.length > 0) return true;
  const p = await db.execute(sql`
    SELECT 1 FROM prayer_sessions
    WHERE user_id = ${userId}
      AND to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') = ${today}
    LIMIT 1
  `);
  return p.rows.length > 0;
}

// POST /api/rhythm-party — create a party (the creator's commitment + a link).
router.post("/rhythm-party", async (req, res): Promise<void> => {
  const me = meId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = z.object({
    presetId: z.string().min(1).max(64),
    days: z.number().int().min(1).max(365).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const token = crypto.randomBytes(16).toString("hex");
  const [party] = await db.insert(rhythmPartiesTable).values({
    createdById: me, token, presetId: parsed.data.presetId, days: parsed.data.days ?? 30, status: "pending",
  }).returning();
  await db.insert(rhythmPartyMembersTable).values({ partyId: party.id, userId: me }).onConflictDoNothing();
  res.json({ token, party });
});

// GET /api/rhythm-party/:token — preview the invite (the rule it carries), so
// the accept page can show the rhythm before someone joins.
router.get("/rhythm-party/:token", async (req, res): Promise<void> => {
  const me = meId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [party] = await db.select().from(rhythmPartiesTable).where(eq(rhythmPartiesTable.token, req.params.token));
  if (!party) { res.status(404).json({ error: "Not found" }); return; }
  const [creator] = await db
    .select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(eq(usersTable.id, party.createdById));
  const members = await db
    .select({ userId: rhythmPartyMembersTable.userId })
    .from(rhythmPartyMembersTable).where(eq(rhythmPartyMembersTable.partyId, party.id));
  res.json({
    presetId: party.presetId, days: party.days, status: party.status,
    createdByName: creator?.name ?? null, createdByAvatar: creator?.avatarUrl ?? null,
    memberCount: members.length, full: members.length >= MAX_MEMBERS,
    alreadyMember: members.some((m) => m.userId === me),
    isCreator: party.createdById === me,
  });
});

// POST /api/rhythm-party/:token/accept — join, aligning to a shared Day 1. The
// FIRST companion to accept starts the shared clock (their local day).
router.post("/rhythm-party/:token/accept", async (req, res): Promise<void> => {
  const me = meId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [party] = await db.select().from(rhythmPartiesTable).where(eq(rhythmPartiesTable.token, req.params.token));
  if (!party) { res.status(404).json({ error: "Not found" }); return; }
  if (party.status === "ended") { res.status(410).json({ error: "This rhythm has ended." }); return; }
  const members = await db.select().from(rhythmPartyMembersTable).where(eq(rhythmPartyMembersTable.partyId, party.id));
  const already = members.some((m) => m.userId === me);
  if (!already && members.length >= MAX_MEMBERS) { res.status(409).json({ error: "This rhythm is full." }); return; }
  if (!already) {
    await db.insert(rhythmPartyMembersTable).values({ partyId: party.id, userId: me }).onConflictDoNothing();
  }
  if (party.status === "pending" && party.createdById !== me) {
    const [meU] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, me));
    await db.update(rhythmPartiesTable)
      .set({ status: "active", startYmd: party.startYmd ?? todayDateInTz(tzOf(meU)) })
      .where(eq(rhythmPartiesTable.id, party.id));
  }
  res.json({ ok: true, presetId: party.presetId, days: party.days });
});

// GET /api/me/rhythm-party — the viewer's current party (for the home band):
// the shared Day-N + each companion's today-kept ring.
router.get("/me/rhythm-party", async (req, res): Promise<void> => {
  const me = meId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db
    .select({ party: rhythmPartiesTable })
    .from(rhythmPartyMembersTable)
    .innerJoin(rhythmPartiesTable, eq(rhythmPartyMembersTable.partyId, rhythmPartiesTable.id))
    .where(and(eq(rhythmPartyMembersTable.userId, me), sql`${rhythmPartiesTable.status} <> 'ended'`))
    .orderBy(sql`${rhythmPartiesTable.createdAt} DESC`)
    .limit(1);
  const party = rows[0]?.party;
  if (!party) { res.json({ party: null }); return; }
  const memberRows = await db
    .select({ userId: rhythmPartyMembersTable.userId, name: usersTable.name, avatarUrl: usersTable.avatarUrl, timezone: usersTable.timezone })
    .from(rhythmPartyMembersTable)
    .innerJoin(usersTable, eq(rhythmPartyMembersTable.userId, usersTable.id))
    .where(eq(rhythmPartyMembersTable.partyId, party.id));
  const meRow = memberRows.find((m) => m.userId === me);
  const myToday = todayDateInTz(tzOf(meRow));
  const day = party.startYmd ? daysBetweenYmd(party.startYmd, myToday) + 1 : null;
  const members = await Promise.all(memberRows.map(async (m) => ({
    id: m.userId, name: m.name, avatarUrl: m.avatarUrl,
    isMe: m.userId === me,
    keptToday: await keptToday(m.userId, tzOf(m)),
  })));
  res.json({
    party: { id: party.id, presetId: party.presetId, days: party.days, startYmd: party.startYmd, status: party.status, day },
    members,
  });
});

export default router;
