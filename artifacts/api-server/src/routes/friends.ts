// One-to-one prayer friendships (Phase 1): requests, accept/decline, list,
// remove, and user search — all beta-gated. A directional `friendships` row
// models both the pending request and the accepted friendship (see the schema
// for the model). Notifications reuse sendPushToUser; blocking reuses
// user_mutes. No prayer-request scoping changes here — that's Phase 2.

import { Router, type IRouter, type RequestHandler } from "express";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { db, friendshipsTable, usersTable, betaUsersTable, userMutesTable } from "@workspace/db";
import { z } from "zod/v4";
import { sendPushToUser } from "../lib/pushSender";

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

// Beta-only — friends is a beta feature for now. Mirrors prayer-feeds' gate.
const requireBeta: RequestHandler = async (req, res, next) => {
  const id = getUserId(req);
  if (!id) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, id));
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [beta] = await db.select({ email: betaUsersTable.email })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (!beta) { res.status(403).json({ error: "Friends is a beta-only feature." }); return; }
    next();
  } catch {
    res.status(403).json({ error: "Friends is a beta-only feature." });
  }
};

async function userName(id: number): Promise<string> {
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, id));
  return u?.name?.trim() || "Someone";
}

// Has either user muted/blocked the other? Keeps a blocked person from
// re-appearing in search or sending requests.
async function isBlockedBetween(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: userMutesTable.id }).from(userMutesTable).where(or(
    and(eq(userMutesTable.muterId, a), eq(userMutesTable.mutedUserId, b)),
    and(eq(userMutesTable.muterId, b), eq(userMutesTable.mutedUserId, a)),
  ));
  return rows.length > 0;
}

// ─── GET /api/friends — accepted friends (either direction) ──────────────────
router.get("/friends", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const rows = await db.select({
    id: friendshipsTable.id,
    requesterId: friendshipsTable.requesterId,
    addresseeId: friendshipsTable.addresseeId,
    createdAt: friendshipsTable.createdAt,
  }).from(friendshipsTable).where(and(
    eq(friendshipsTable.status, "accepted"),
    or(eq(friendshipsTable.requesterId, me), eq(friendshipsTable.addresseeId, me)),
  ));
  const otherIds = rows.map((r) => (r.requesterId === me ? r.addresseeId : r.requesterId));
  if (otherIds.length === 0) { res.json({ friends: [] }); return; }
  const users = await db.select({
    id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl,
    streakCount: usersTable.prayerStreakCount, streakLast: usersTable.prayerStreakLastDate,
  }).from(usersTable).where(inArray(usersTable.id, otherIds));
  // A friend's stored streak is "live" only if they prayed today or yesterday
  // (the count doesn't auto-decay). String compare of YYYY-MM-DD with a 1-day
  // window is tz-robust enough for a friendly encouragement number.
  const yesterdayUtc = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const byId = new Map(users.map((u) => [u.id, u]));
  const friends = rows
    .map((r) => {
      const oid = r.requesterId === me ? r.addresseeId : r.requesterId;
      const u = byId.get(oid);
      if (!u) return null;
      const streak = u.streakLast && u.streakLast >= yesterdayUtc ? (u.streakCount ?? 0) : 0;
      return { friendshipId: r.id, userId: oid, name: u.name, avatarUrl: u.avatarUrl, since: r.createdAt, streak };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  res.json({ friends });
});

// ─── GET /api/friends/requests — incoming pending requests ───────────────────
router.get("/friends/requests", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const rows = await db.select({
    id: friendshipsTable.id,
    requesterId: friendshipsTable.requesterId,
    createdAt: friendshipsTable.createdAt,
  }).from(friendshipsTable).where(and(
    eq(friendshipsTable.addresseeId, me),
    eq(friendshipsTable.status, "pending"),
  ));
  if (rows.length === 0) { res.json({ requests: [] }); return; }
  const users = await db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(inArray(usersTable.id, rows.map((r) => r.requesterId)));
  const byId = new Map(users.map((u) => [u.id, u]));
  const requests = rows
    .map((r) => {
      const u = byId.get(r.requesterId);
      if (!u) return null;
      return { id: r.id, userId: u.id, name: u.name, avatarUrl: u.avatarUrl, requestedAt: r.createdAt };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  res.json({ requests });
});

// ─── GET /api/friends/requests/count — incoming count (menu badge) ───────────
router.get("/friends/requests/count", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(friendshipsTable).where(and(
    eq(friendshipsTable.addresseeId, me),
    eq(friendshipsTable.status, "pending"),
  ));
  res.json({ count: row?.n ?? 0 });
});

// ─── POST /api/friends/request { userId } — send (or auto-accept) ────────────
const requestSchema = z.object({ userId: z.number().int().positive() });
router.post("/friends/request", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const targetId = parsed.data.userId;
  if (targetId === me) { res.status(400).json({ error: "You can't add yourself." }); return; }

  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, targetId));
  if (!target) { res.status(404).json({ error: "Not found" }); return; }
  if (await isBlockedBetween(me, targetId)) { res.status(403).json({ error: "Unavailable" }); return; }

  const existing = await db.select().from(friendshipsTable).where(or(
    and(eq(friendshipsTable.requesterId, me), eq(friendshipsTable.addresseeId, targetId)),
    and(eq(friendshipsTable.requesterId, targetId), eq(friendshipsTable.addresseeId, me)),
  ));

  if (existing.some((r) => r.status === "accepted")) { res.json({ ok: true, status: "friends" }); return; }

  // They already asked me → accept theirs instead of opening a 2nd request.
  const incoming = existing.find((r) => r.requesterId === targetId && r.status === "pending");
  if (incoming) {
    await db.update(friendshipsTable).set({ status: "accepted", respondedAt: new Date() })
      .where(eq(friendshipsTable.id, incoming.id));
    const name = await userName(me);
    void sendPushToUser(targetId, {
      title: "New prayer friend", body: `${name} accepted your prayer-friend request`,
      path: "/friends", threadId: "friend-accept",
    }).catch(() => undefined);
    res.json({ ok: true, status: "friends", autoAccepted: true });
    return;
  }

  const outgoing = existing.find((r) => r.requesterId === me && r.addresseeId === targetId);
  const name = await userName(me);
  if (outgoing) {
    if (outgoing.status === "pending") { res.json({ ok: true, status: "requested" }); return; }
    // Previously declined — let them re-ask by reviving the row.
    await db.update(friendshipsTable).set({ status: "pending", respondedAt: null, createdAt: new Date() })
      .where(eq(friendshipsTable.id, outgoing.id));
  } else {
    await db.insert(friendshipsTable).values({ requesterId: me, addresseeId: targetId, status: "pending" });
  }
  void sendPushToUser(targetId, {
    title: "Prayer friend request", body: `${name} wants to be prayer friends`,
    path: "/friends", threadId: "friend-request",
  }).catch(() => undefined);
  res.json({ ok: true, status: "requested" });
});

// ─── POST /api/friends/:id/accept ────────────────────────────────────────────
router.post("/friends/:id/accept", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(friendshipsTable).where(eq(friendshipsTable.id, id));
  if (!row || row.addresseeId !== me) { res.status(404).json({ error: "Not found" }); return; }
  if (row.status !== "pending") { res.json({ ok: true, status: row.status }); return; }
  await db.update(friendshipsTable).set({ status: "accepted", respondedAt: new Date() })
    .where(eq(friendshipsTable.id, id));
  const name = await userName(me);
  void sendPushToUser(row.requesterId, {
    title: "New prayer friend", body: `${name} accepted your prayer-friend request`,
    path: "/friends", threadId: "friend-accept",
  }).catch(() => undefined);
  res.json({ ok: true, status: "accepted" });
});

// ─── POST /api/friends/:id/decline — quiet (no push) ─────────────────────────
router.post("/friends/:id/decline", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(friendshipsTable).where(eq(friendshipsTable.id, id));
  if (!row || row.addresseeId !== me) { res.status(404).json({ error: "Not found" }); return; }
  await db.update(friendshipsTable).set({ status: "declined", respondedAt: new Date() })
    .where(eq(friendshipsTable.id, id));
  res.json({ ok: true, status: "declined" });
});

// ─── DELETE /api/friends/:userId — remove the friendship with a user ─────────
router.delete("/friends/:userId", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const otherId = parseInt(String(req.params.userId), 10);
  if (isNaN(otherId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(friendshipsTable).where(or(
    and(eq(friendshipsTable.requesterId, me), eq(friendshipsTable.addresseeId, otherId)),
    and(eq(friendshipsTable.requesterId, otherId), eq(friendshipsTable.addresseeId, me)),
  ));
  res.json({ ok: true });
});

// ─── GET /api/friends/search?q= — find people to add, with relationship state ─
router.get("/friends/search", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const q = ((req.query.q as string) || "").trim();
  if (q.length < 2) { res.json({ users: [] }); return; }
  const safeQ = q.replace(/[%_\\]/g, (c) => `\\${c}`);
  const pattern = `%${safeQ}%`;
  const matches = await db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(and(
      sql`${usersTable.id} <> ${me}`,
      or(sql`${usersTable.name} ILIKE ${pattern}`, sql`${usersTable.email} ILIKE ${pattern}`),
    )).limit(8);
  if (matches.length === 0) { res.json({ users: [] }); return; }

  const ids = matches.map((m) => m.id);
  const rels = await db.select().from(friendshipsTable).where(or(
    and(eq(friendshipsTable.requesterId, me), inArray(friendshipsTable.addresseeId, ids)),
    and(eq(friendshipsTable.addresseeId, me), inArray(friendshipsTable.requesterId, ids)),
  ));
  const mutes = await db.select({ muted: userMutesTable.mutedUserId, muter: userMutesTable.muterId })
    .from(userMutesTable).where(or(
      and(eq(userMutesTable.muterId, me), inArray(userMutesTable.mutedUserId, ids)),
      and(eq(userMutesTable.mutedUserId, me), inArray(userMutesTable.muterId, ids)),
    ));
  const blocked = new Set(mutes.flatMap((m) => [m.muted, m.muter]));

  const users = matches
    .filter((m) => !blocked.has(m.id))
    .map((m) => {
      const r = rels.find((x) =>
        (x.requesterId === me && x.addresseeId === m.id) || (x.addresseeId === me && x.requesterId === m.id));
      let status: "none" | "friends" | "requested" | "incoming" = "none";
      if (r) {
        if (r.status === "accepted") status = "friends";
        else if (r.status === "pending") status = r.requesterId === me ? "requested" : "incoming";
      }
      return { id: m.id, name: m.name, avatarUrl: m.avatarUrl, status };
    });
  res.json({ users });
});

// ─── POST /api/friends/status { userIds } — relationship of each id to me ────
// Used by contacts-discovery: feed the matched user ids, get back each one's
// status so the row can show Add / Requested / Accept / Friends.
const statusSchema = z.object({ userIds: z.array(z.number().int().positive()).max(2000) });
router.post("/friends/status", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const ids = Array.from(new Set(parsed.data.userIds)).filter((id) => id !== me);
  if (ids.length === 0) { res.json({ statuses: {} }); return; }
  const rels = await db.select().from(friendshipsTable).where(or(
    and(eq(friendshipsTable.requesterId, me), inArray(friendshipsTable.addresseeId, ids)),
    and(eq(friendshipsTable.addresseeId, me), inArray(friendshipsTable.requesterId, ids)),
  ));
  const statuses: Record<number, "none" | "friends" | "requested" | "incoming"> = {};
  for (const id of ids) {
    const r = rels.find((x) =>
      (x.requesterId === me && x.addresseeId === id) || (x.addresseeId === me && x.requesterId === id));
    let s: "none" | "friends" | "requested" | "incoming" = "none";
    if (r) {
      if (r.status === "accepted") s = "friends";
      else if (r.status === "pending") s = r.requesterId === me ? "requested" : "incoming";
    }
    statuses[id] = s;
  }
  res.json({ statuses });
});

export default router;
