// Walking together — a mutual-opt-in accountability layer on the Fellow bond.
// Two people who BOTH opt in can see each other's TODAY-ONLY rhythm dots and
// send a one-tap word of encouragement. Companionship, not surveillance:
//   • being fellows is required but NOT sufficient — both must consent here
//   • nothing is shared until status='active' (both accepted)
//   • only TODAY's kept-anchor booleans cross between people, in each person's
//     own timezone, via getWalkProgressForToday() — never history/times/streaks
// Beta-gated, mirroring fellows-connect.ts (getUserId / requireBeta / areFellows).
import { Router, type IRouter, type RequestHandler } from "express";
import { eq, and, or, inArray, gte, sql } from "drizzle-orm";
import { db, walkPairingsTable, walkNudgesTable, fellowsTable, usersTable, betaUsersTable, userMutesTable, type WalkPairing } from "@workspace/db";
import { z } from "zod/v4";
import { sendPushToUser } from "../lib/pushSender";
import { perUserRateLimit } from "../lib/rate-limit";
import { getWalkProgressForToday } from "../lib/walkProgress";
import { normalizePair } from "../lib/walkPairing";

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

const requireBeta: RequestHandler = async (req, res, next) => {
  const id = getUserId(req);
  if (!id) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, id));
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [beta] = await db.select({ email: betaUsersTable.email })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (!beta) { res.status(403).json({ error: "Walking together is a beta feature." }); return; }
    next();
  } catch {
    res.status(403).json({ error: "Walking together is a beta feature." });
  }
};

async function areFellows(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: fellowsTable.id }).from(fellowsTable).where(or(
    and(eq(fellowsTable.userId, a), eq(fellowsTable.fellowUserId, b)),
    and(eq(fellowsTable.userId, b), eq(fellowsTable.fellowUserId, a)),
  )).limit(1);
  return rows.length > 0;
}
// Which of `ids` are STILL fellows with me — one query, so a companion whose
// Fellow link vanished (via any path) is never shown their progress.
async function fellowSubset(me: number, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await db.select({ a: fellowsTable.userId, b: fellowsTable.fellowUserId })
    .from(fellowsTable).where(or(
      and(eq(fellowsTable.userId, me), inArray(fellowsTable.fellowUserId, ids)),
      and(eq(fellowsTable.fellowUserId, me), inArray(fellowsTable.userId, ids)),
    ));
  const set = new Set<number>();
  for (const r of rows) { if (r.a !== me) set.add(r.a); if (r.b !== me) set.add(r.b); }
  return set;
}
async function isBlockedBetween(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: userMutesTable.id }).from(userMutesTable).where(or(
    and(eq(userMutesTable.muterId, a), eq(userMutesTable.mutedUserId, b)),
    and(eq(userMutesTable.muterId, b), eq(userMutesTable.mutedUserId, a)),
  )).limit(1);
  return rows.length > 0;
}
async function userName(id: number): Promise<string> {
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, id));
  return u?.name?.trim() || "Someone";
}
type Person = { id: number; name: string; avatarUrl: string | null };
async function peopleByIds(ids: number[]): Promise<Map<number, Person>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(inArray(usersTable.id, ids));
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, avatarUrl: r.avatarUrl }]));
}

const partnerOf = (p: WalkPairing, me: number): number => (p.userLoId === me ? p.userHiId : p.userLoId);
const isMember = (p: WalkPairing, me: number): boolean => p.userLoId === me || p.userHiId === me;

// Load a pairing by id and assert the caller is one of the two members.
async function loadMyPair(pairId: number, me: number): Promise<WalkPairing | null> {
  if (!Number.isInteger(pairId)) return null;
  const [p] = await db.select().from(walkPairingsTable).where(eq(walkPairingsTable.id, pairId));
  if (!p || !isMember(p, me)) return null;
  return p;
}

// ─── GET /api/walk — companions + requests + invitable fellows ───────────────
router.get("/walk", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const rows = await db.select().from(walkPairingsTable).where(or(
    eq(walkPairingsTable.userLoId, me),
    eq(walkPairingsTable.userHiId, me),
  ));

  // Belt-and-suspenders: only surface ACTIVE companions who are STILL fellows.
  // Removing a fellow already ends the walk (people.ts cascade); this also covers
  // any other path that severs the bond, so progress never leaks post-un-fellow.
  const activeAll = rows.filter((r) => r.status === "active");
  const stillFellows = await fellowSubset(me, activeAll.map((r) => partnerOf(r, me)));
  const active = activeAll.filter((r) => stillFellows.has(partnerOf(r, me)));
  const paused = rows.filter((r) => r.status === "paused");
  const incoming = rows.filter((r) => r.status === "pending" && r.invitedById !== me);
  const outgoing = rows.filter((r) => r.status === "pending" && r.invitedById === me);

  // Everyone we need a name/avatar for.
  const otherIds = Array.from(new Set([...active, ...paused, ...incoming, ...outgoing].map((r) => partnerOf(r, me))));
  const people = await peopleByIds(otherIds);

  // Active companions carry today's progress (the whole point) + last word.
  const companions = (await Promise.all(active.map(async (r) => {
    const pid = partnerOf(r, me);
    const person = people.get(pid);
    if (!person) return null;
    const progress = await getWalkProgressForToday(pid);
    const [lastFromThem] = await db.select({ kind: walkNudgesTable.kind, createdAt: walkNudgesTable.createdAt })
      .from(walkNudgesTable)
      .where(and(eq(walkNudgesTable.fromUserId, pid), eq(walkNudgesTable.toUserId, me)))
      .orderBy(sql`${walkNudgesTable.createdAt} DESC`).limit(1);
    return {
      pairId: r.id, userId: pid, name: person.name, avatarUrl: person.avatarUrl,
      intention: r.intention ?? null, since: r.acceptedAt,
      progress, lastNudge: lastFromThem ? { kind: lastFromThem.kind, at: lastFromThem.createdAt } : null,
    };
  }))).filter((x): x is NonNullable<typeof x> => x !== null);

  const mapLite = (r: WalkPairing) => {
    const pid = partnerOf(r, me);
    const person = people.get(pid);
    return person ? { pairId: r.id, userId: pid, name: person.name, avatarUrl: person.avatarUrl, intention: r.intention ?? null, at: r.createdAt } : null;
  };
  const incomingOut = incoming.map(mapLite).filter((x): x is NonNullable<typeof x> => x !== null);
  const outgoingOut = outgoing.map(mapLite).filter((x): x is NonNullable<typeof x> => x !== null);
  const pausedOut = paused.map((r) => {
    const lite = mapLite(r);
    return lite ? { ...lite, pausedByMe: r.pausedById === me } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // Invitable = my fellows with no live pairing (none, or previously ended).
  const fellowRows = await db.select({ fid: fellowsTable.fellowUserId }).from(fellowsTable).where(eq(fellowsTable.userId, me));
  const fellowIds = Array.from(new Set(fellowRows.map((r) => r.fid))).filter((id) => id !== me);
  const liveWith = new Set(rows.filter((r) => r.status !== "ended").map((r) => partnerOf(r, me)));
  const eligibleIds = fellowIds.filter((id) => !liveWith.has(id));
  const eligiblePeople = await peopleByIds(eligibleIds);
  const eligibleFellows = eligibleIds
    .map((id) => eligiblePeople.get(id))
    .filter((p): p is Person => !!p)
    .map((p) => ({ userId: p.id, name: p.name, avatarUrl: p.avatarUrl }));

  res.json({ companions, incoming: incomingOut, outgoing: outgoingOut, paused: pausedOut, eligibleFellows });
});

// ─── POST /api/walk/request { userId, intention? } ───────────────────────────
const requestSchema = z.object({
  userId: z.number().int().positive(),
  intention: z.string().trim().max(140).optional(),
});
router.post("/walk/request", perUserRateLimit("walk_request", { max: 30, windowMs: 60 * 60 * 1000 }), requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const targetId = parsed.data.userId;
  const intention = parsed.data.intention || null;
  if (targetId === me) { res.status(400).json({ error: "You can't walk with yourself." }); return; }
  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, targetId));
  if (!target) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await areFellows(me, targetId))) { res.status(403).json({ error: "You can only walk with a fellow." }); return; }
  if (await isBlockedBetween(me, targetId)) { res.status(403).json({ error: "Unavailable" }); return; }

  const { lo, hi } = normalizePair(me, targetId);
  const [existing] = await db.select().from(walkPairingsTable)
    .where(and(eq(walkPairingsTable.userLoId, lo), eq(walkPairingsTable.userHiId, hi)));

  // Reciprocal pending (they already invited me) → both consented → activate.
  if (existing && existing.status === "pending" && existing.invitedById === targetId) {
    await db.update(walkPairingsTable)
      .set({ status: "active", acceptedAt: new Date(), intention: existing.intention ?? intention })
      .where(eq(walkPairingsTable.id, existing.id));
    const name = await userName(me);
    void sendPushToUser(targetId, { title: "Walking together", body: `${name} is walking with you now`, path: "/people", threadId: "walk-accept" }).catch(() => undefined);
    res.json({ ok: true, status: "active", pairId: existing.id });
    return;
  }
  if (existing && existing.status === "active") { res.json({ ok: true, status: "active", pairId: existing.id }); return; }
  if (existing && existing.status === "paused") { res.json({ ok: true, status: "paused", pairId: existing.id }); return; }
  if (existing && existing.status === "pending" && existing.invitedById === me) { res.json({ ok: true, status: "pending", pairId: existing.id }); return; }

  let pairId: number;
  if (existing) {
    // Revive an ended pairing as a fresh invite (don't duplicate the row).
    await db.update(walkPairingsTable)
      .set({ status: "pending", invitedById: me, intention, createdAt: new Date(), acceptedAt: null, endedAt: null, endedById: null, pausedById: null })
      .where(eq(walkPairingsTable.id, existing.id));
    pairId = existing.id;
  } else {
    const [ins] = await db.insert(walkPairingsTable)
      .values({ userLoId: lo, userHiId: hi, invitedById: me, status: "pending", intention })
      .returning({ id: walkPairingsTable.id });
    pairId = ins.id;
  }
  const name = await userName(me);
  void sendPushToUser(targetId, { title: "Walk together?", body: `${name} wants to keep the daily rhythm with you`, path: "/people", threadId: "walk-request" }).catch(() => undefined);
  res.json({ ok: true, status: "pending", pairId });
});

// ─── POST /api/walk/requests/:id/accept ──────────────────────────────────────
router.post("/walk/requests/:id/accept", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const p = await loadMyPair(parseInt(String(req.params.id), 10), me);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (p.status === "active") { res.json({ ok: true, status: "active" }); return; }
  if (p.status !== "pending" || p.invitedById === me) { res.status(400).json({ error: "Nothing to accept" }); return; }
  const other = partnerOf(p, me);
  if (!(await areFellows(me, other))) { res.status(403).json({ error: "You can only walk with a fellow." }); return; }
  await db.update(walkPairingsTable).set({ status: "active", acceptedAt: new Date() }).where(eq(walkPairingsTable.id, p.id));
  const name = await userName(me);
  void sendPushToUser(other, { title: "Walking together", body: `${name} is walking with you now`, path: "/people", threadId: "walk-accept" }).catch(() => undefined);
  res.json({ ok: true, status: "active" });
});

// ─── POST /api/walk/requests/:id/decline — quiet ─────────────────────────────
router.post("/walk/requests/:id/decline", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const p = await loadMyPair(parseInt(String(req.params.id), 10), me);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (p.status === "pending") {
    await db.update(walkPairingsTable).set({ status: "ended", endedAt: new Date(), endedById: me }).where(eq(walkPairingsTable.id, p.id));
    res.json({ ok: true, status: "ended" });
    return;
  }
  // Nothing to decline on a non-pending pair — report the real status, don't lie.
  res.json({ ok: true, status: p.status });
});

// ─── POST /api/walk/:id/pause | resume | stop ────────────────────────────────
router.post("/walk/:id/pause", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const p = await loadMyPair(parseInt(String(req.params.id), 10), me);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (p.status !== "active") { res.status(400).json({ error: "Not active" }); return; }
  await db.update(walkPairingsTable).set({ status: "paused", pausedById: me }).where(eq(walkPairingsTable.id, p.id));
  res.json({ ok: true, status: "paused" });
});
router.post("/walk/:id/resume", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const p = await loadMyPair(parseInt(String(req.params.id), 10), me);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (p.status !== "paused") { res.status(400).json({ error: "Not paused" }); return; }
  await db.update(walkPairingsTable).set({ status: "active", pausedById: null }).where(eq(walkPairingsTable.id, p.id));
  res.json({ ok: true, status: "active" });
});
router.post("/walk/:id/stop", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const p = await loadMyPair(parseInt(String(req.params.id), 10), me);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  await db.update(walkPairingsTable).set({ status: "ended", endedAt: new Date(), endedById: me, pausedById: null }).where(eq(walkPairingsTable.id, p.id));
  res.json({ ok: true, status: "ended" });
});

// ─── POST /api/walk/:id/nudge { kind } — one-tap encouragement ───────────────
const NUDGE_COPY: Record<string, string> = {
  praying: "is praying for you",
  cheer: "is glad you're walking together",
  thinking: "is thinking of you",
};
const nudgeSchema = z.object({ kind: z.enum(["praying", "cheer", "thinking"]) });
router.post("/walk/:id/nudge", perUserRateLimit("walk_nudge", { max: 30, windowMs: 60 * 60 * 1000 }), requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const parsed = nudgeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const p = await loadMyPair(parseInt(String(req.params.id), 10), me);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (p.status !== "active") { res.status(400).json({ error: "Not walking together" }); return; }
  const other = partnerOf(p, me);
  // Re-check the underlying bond — no words to someone who's no longer a fellow.
  if (!(await areFellows(me, other))) { res.status(403).json({ error: "You can only walk with a fellow." }); return; }
  // Gentle rate limit: at most one word to this companion per 6 hours, so a
  // morning + evening note is fine but it can't become a stream of pings.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const [recent] = await db.select({ id: walkNudgesTable.id }).from(walkNudgesTable).where(and(
    eq(walkNudgesTable.fromUserId, me),
    eq(walkNudgesTable.toUserId, other),
    gte(walkNudgesTable.createdAt, sixHoursAgo),
  )).limit(1);
  if (recent) { res.status(429).json({ error: "You've already sent a word recently." }); return; }
  await db.insert(walkNudgesTable).values({ pairId: p.id, fromUserId: me, toUserId: other, kind: parsed.data.kind });
  const name = await userName(me);
  void sendPushToUser(other, { title: "A word from your companion", body: `${name} ${NUDGE_COPY[parsed.data.kind]}`, path: "/people", threadId: "walk-nudge", data: { type: "walk-nudge" } }).catch(() => undefined);
  res.json({ ok: true });
});

// ─── GET /api/walk/nudges — unseen words to me (for a banner) ─────────────────
router.get("/walk/nudges", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const rows = await db.select({ id: walkNudgesTable.id, fromUserId: walkNudgesTable.fromUserId, kind: walkNudgesTable.kind, createdAt: walkNudgesTable.createdAt })
    .from(walkNudgesTable)
    .where(and(eq(walkNudgesTable.toUserId, me), sql`${walkNudgesTable.seenAt} IS NULL`))
    .orderBy(sql`${walkNudgesTable.createdAt} DESC`).limit(20);
  if (rows.length === 0) { res.json({ nudges: [] }); return; }
  const people = await peopleByIds(Array.from(new Set(rows.map((r) => r.fromUserId))));
  const nudges = rows.map((r) => {
    const person = people.get(r.fromUserId);
    return person ? { id: r.id, userId: r.fromUserId, name: person.name, avatarUrl: person.avatarUrl, kind: r.kind, at: r.createdAt } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  res.json({ nudges });
});

// ─── POST /api/walk/nudges/seen — mark all my incoming words seen ─────────────
router.post("/walk/nudges/seen", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  await db.update(walkNudgesTable).set({ seenAt: new Date() })
    .where(and(eq(walkNudgesTable.toUserId, me), sql`${walkNudgesTable.seenAt} IS NULL`));
  res.json({ ok: true });
});

export default router;
