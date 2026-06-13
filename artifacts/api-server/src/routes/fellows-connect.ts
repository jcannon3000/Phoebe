// Fellows — manual add + request/accept flow (beta), the "future addition"
// the fellows schema anticipated. Built on the EXISTING fellows model:
//   • pending request  → a fellow_invites row (senderId → recipientId, status)
//   • accepted fellow  → the two symmetric fellows rows (A→B, B→A, source
//                        "manual"), which the garden already folds into prayer-
//                        request visibility + the People page's Fellow badge.
// No new tables. Reads (GET /fellows list, DELETE /fellows/:id) stay in
// people.ts; this adds the request/search/status surface.

import { Router, type IRouter, type RequestHandler } from "express";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { db, fellowsTable, fellowInvitesTable, usersTable, betaUsersTable, userMutesTable } from "@workspace/db";
import { z } from "zod/v4";
import { sendPushToUser } from "../lib/pushSender";

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

// Manual fellow-add is a beta capability for now (existing fellows from the
// shared-prayer signup flow stay visible to everyone via GET /fellows).
const requireBeta: RequestHandler = async (req, res, next) => {
  const id = getUserId(req);
  if (!id) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, id));
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [beta] = await db.select({ email: betaUsersTable.email })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (!beta) { res.status(403).json({ error: "Fellows manual-add is a beta feature." }); return; }
    next();
  } catch {
    res.status(403).json({ error: "Fellows manual-add is a beta feature." });
  }
};

async function userName(id: number): Promise<string> {
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, id));
  return u?.name?.trim() || "Someone";
}
async function isBlockedBetween(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: userMutesTable.id }).from(userMutesTable).where(or(
    and(eq(userMutesTable.muterId, a), eq(userMutesTable.mutedUserId, b)),
    and(eq(userMutesTable.muterId, b), eq(userMutesTable.mutedUserId, a)),
  ));
  return rows.length > 0;
}
// The symmetric two-row fellow link (source "manual"). onConflictDoNothing
// keeps a re-accept idempotent against the unique(userId, fellowUserId).
async function createFellowPair(a: number, b: number): Promise<void> {
  await db.insert(fellowsTable).values([
    { userId: a, fellowUserId: b, source: "manual" },
    { userId: b, fellowUserId: a, source: "manual" },
  ]).onConflictDoNothing();
  // Resolve ANY pending invite in either direction so no stale "wants to be
  // fellows" request lingers once the link exists (e.g. both had sent one).
  await db.update(fellowInvitesTable).set({ status: "accepted" }).where(and(
    eq(fellowInvitesTable.status, "pending"),
    or(
      and(eq(fellowInvitesTable.senderId, a), eq(fellowInvitesTable.recipientId, b)),
      and(eq(fellowInvitesTable.senderId, b), eq(fellowInvitesTable.recipientId, a)),
    ),
  ));
}
async function areFellows(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: fellowsTable.id }).from(fellowsTable).where(or(
    and(eq(fellowsTable.userId, a), eq(fellowsTable.fellowUserId, b)),
    and(eq(fellowsTable.userId, b), eq(fellowsTable.fellowUserId, a)),
  )).limit(1);
  return rows.length > 0;
}

// ─── GET /api/fellows/requests — incoming pending requests ───────────────────
router.get("/fellows/requests", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const rows = await db.select({ id: fellowInvitesTable.id, senderId: fellowInvitesTable.senderId, createdAt: fellowInvitesTable.createdAt })
    .from(fellowInvitesTable)
    .where(and(eq(fellowInvitesTable.recipientId, me), eq(fellowInvitesTable.status, "pending")));
  if (rows.length === 0) { res.json({ requests: [] }); return; }
  const users = await db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(inArray(usersTable.id, rows.map((r) => r.senderId)));
  const byId = new Map(users.map((u) => [u.id, u]));
  const requests = rows
    .map((r) => { const u = byId.get(r.senderId); return u ? { id: r.id, userId: u.id, name: u.name, avatarUrl: u.avatarUrl, requestedAt: r.createdAt } : null; })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  res.json({ requests });
});

// ─── GET /api/fellows/requests/count — badge ─────────────────────────────────
router.get("/fellows/requests/count", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(fellowInvitesTable)
    .where(and(eq(fellowInvitesTable.recipientId, me), eq(fellowInvitesTable.status, "pending")));
  res.json({ count: row?.n ?? 0 });
});

// ─── POST /api/fellows/request { userId } — send (or auto-accept) ────────────
const requestSchema = z.object({ userId: z.number().int().positive() });
router.post("/fellows/request", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const targetId = parsed.data.userId;
  if (targetId === me) { res.status(400).json({ error: "You can't add yourself." }); return; }
  const [target] = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, targetId));
  if (!target) { res.status(404).json({ error: "Not found" }); return; }
  if (await isBlockedBetween(me, targetId)) { res.status(403).json({ error: "Unavailable" }); return; }
  if (await areFellows(me, targetId)) { res.json({ ok: true, status: "fellows" }); return; }

  const invites = await db.select().from(fellowInvitesTable).where(or(
    and(eq(fellowInvitesTable.senderId, me), eq(fellowInvitesTable.recipientId, targetId)),
    and(eq(fellowInvitesTable.senderId, targetId), eq(fellowInvitesTable.recipientId, me)),
  ));
  const incoming = invites.find((i) => i.senderId === targetId && i.status === "pending");
  if (incoming) {
    await createFellowPair(me, targetId);
    await db.update(fellowInvitesTable).set({ status: "accepted" }).where(eq(fellowInvitesTable.id, incoming.id));
    const name = await userName(me);
    void sendPushToUser(targetId, { title: "New fellow", body: `${name} accepted your fellow request`, path: "/people", threadId: "fellow-accept" }).catch(() => undefined);
    res.json({ ok: true, status: "fellows", autoAccepted: true });
    return;
  }
  const outgoing = invites.find((i) => i.senderId === me && i.recipientId === targetId);
  const name = await userName(me);
  if (outgoing) {
    if (outgoing.status === "pending") { res.json({ ok: true, status: "requested" }); return; }
    await db.update(fellowInvitesTable).set({ status: "pending", createdAt: new Date() }).where(eq(fellowInvitesTable.id, outgoing.id));
  } else {
    await db.insert(fellowInvitesTable).values({ senderId: me, recipientId: targetId, recipientEmail: target.email, status: "pending" });
  }
  void sendPushToUser(targetId, { title: "Fellow request", body: `${name} wants to be prayer fellows`, path: "/people", threadId: "fellow-request" }).catch(() => undefined);
  res.json({ ok: true, status: "requested" });
});

// ─── POST /api/fellows/requests/:id/accept ───────────────────────────────────
router.post("/fellows/requests/:id/accept", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [inv] = await db.select().from(fellowInvitesTable).where(eq(fellowInvitesTable.id, id));
  if (!inv || inv.recipientId !== me) { res.status(404).json({ error: "Not found" }); return; }
  if (inv.status !== "pending") { res.json({ ok: true, status: inv.status }); return; }
  await createFellowPair(me, inv.senderId);
  await db.update(fellowInvitesTable).set({ status: "accepted" }).where(eq(fellowInvitesTable.id, id));
  const name = await userName(me);
  void sendPushToUser(inv.senderId, { title: "New fellow", body: `${name} accepted your fellow request`, path: "/people", threadId: "fellow-accept" }).catch(() => undefined);
  res.json({ ok: true, status: "accepted" });
});

// ─── POST /api/fellows/requests/:id/decline — quiet ──────────────────────────
router.post("/fellows/requests/:id/decline", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [inv] = await db.select().from(fellowInvitesTable).where(eq(fellowInvitesTable.id, id));
  if (!inv || inv.recipientId !== me) { res.status(404).json({ error: "Not found" }); return; }
  await db.update(fellowInvitesTable).set({ status: "declined" }).where(eq(fellowInvitesTable.id, id));
  res.json({ ok: true, status: "declined" });
});

// ─── GET /api/fellows/search?q= — find people to add, with status ────────────
router.get("/fellows/search", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const q = ((req.query.q as string) || "").trim();
  if (q.length < 2) { res.json({ users: [] }); return; }
  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const matches = await db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(and(
      sql`${usersTable.id} <> ${me}`,
      or(sql`${usersTable.name} ILIKE ${pattern}`, sql`${usersTable.email} ILIKE ${pattern}`),
    )).limit(8);
  if (matches.length === 0) { res.json({ users: [] }); return; }
  const ids = matches.map((m) => m.id);
  const statuses = await statusFor(me, ids);
  const mutes = await db.select({ a: userMutesTable.mutedUserId, b: userMutesTable.muterId }).from(userMutesTable).where(or(
    and(eq(userMutesTable.muterId, me), inArray(userMutesTable.mutedUserId, ids)),
    and(eq(userMutesTable.mutedUserId, me), inArray(userMutesTable.muterId, ids)),
  ));
  const blocked = new Set(mutes.flatMap((m) => [m.a, m.b]));
  res.json({ users: matches.filter((m) => !blocked.has(m.id)).map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl, status: statuses[m.id] ?? "none" })) });
});

// ─── POST /api/fellows/status { userIds } — relationship of each id to me ─────
const statusSchema = z.object({ userIds: z.array(z.number().int().positive()).max(2000) });
router.post("/fellows/status", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const ids = Array.from(new Set(parsed.data.userIds)).filter((id) => id !== me);
  if (ids.length === 0) { res.json({ statuses: {} }); return; }
  res.json({ statuses: await statusFor(me, ids) });
});

// Per-id relationship: fellows | requested (I sent) | incoming (they sent) | none.
async function statusFor(me: number, ids: number[]): Promise<Record<number, "none" | "fellows" | "requested" | "incoming">> {
  const fellows = await db.select({ a: fellowsTable.userId, b: fellowsTable.fellowUserId }).from(fellowsTable).where(or(
    and(eq(fellowsTable.userId, me), inArray(fellowsTable.fellowUserId, ids)),
    and(eq(fellowsTable.fellowUserId, me), inArray(fellowsTable.userId, ids)),
  ));
  const fellowSet = new Set(fellows.flatMap((f) => [f.a, f.b]));
  const invites = await db.select({ senderId: fellowInvitesTable.senderId, recipientId: fellowInvitesTable.recipientId }).from(fellowInvitesTable).where(and(
    eq(fellowInvitesTable.status, "pending"),
    or(
      and(eq(fellowInvitesTable.senderId, me), inArray(fellowInvitesTable.recipientId, ids)),
      and(eq(fellowInvitesTable.recipientId, me), inArray(fellowInvitesTable.senderId, ids)),
    ),
  ));
  const out: Record<number, "none" | "fellows" | "requested" | "incoming"> = {};
  for (const id of ids) {
    if (fellowSet.has(id)) { out[id] = "fellows"; continue; }
    const sentToMe = invites.find((i) => i.senderId === id && i.recipientId === me);
    const sentByMe = invites.find((i) => i.senderId === me && i.recipientId === id);
    out[id] = sentToMe ? "incoming" : sentByMe ? "requested" : "none";
  }
  return out;
}

export default router;
