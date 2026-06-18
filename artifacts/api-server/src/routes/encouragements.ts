// Fellow encouragements — a direct, always-available "🙌 keep going" gesture.
// Tap the hands on any of your Fellows and they get "{Name} encouraged you —
// keep growing with Phoebe." No mutual opt-in (that's Walking Together); this
// is the low-friction lift the user asked for: encourage anyone you pray with,
// whether they've kept the whole rhythm today or fallen behind.
//
// Three routes:
//   POST /api/encouragements        { toUserId }  — send (fellow-gated, deduped)
//   GET  /api/encouragements                      — my UNSEEN received ones
//   POST /api/encouragements/seen                 — mark mine seen

import { Router, type IRouter } from "express";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import {
  db,
  fellowEncouragementsTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { getFellowUserIds } from "../lib/garden";
import { sendPushToUser } from "../lib/pushSender";
import { rateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

const byUser = (req: { user?: unknown }): string | null => {
  const u = req.user as { id?: number } | undefined;
  return u?.id ? `u:${u.id}` : null;
};

function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "A fellow";
  return n.split(/\s+/)[0];
}

const sendSchema = z.object({ toUserId: z.number().int().positive() });

// POST /api/encouragements — send a 🙌 to a fellow. Must be an actual Fellow
// connection. Deduped: if you already encouraged this person in the last hour
// we no-op (keeps a double-tap from sending two pushes) but still report ok so
// the client shows its confirmed state.
router.post("/encouragements", rateLimit({
  name: "encouragement_send",
  max: 30,
  windowMs: 60 * 60 * 1000,
  keyFn: byUser,
  message: "You've sent a lot of encouragements. Take a breath and try again soon.",
}), async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = sendSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Invalid request." }); return; }
  const toUserId = parsed.data.toUserId;
  if (toUserId === me) { res.status(400).json({ error: "Can't encourage yourself." }); return; }

  // Fellow-gate: you can only encourage someone you're connected to.
  const fellowIds = await getFellowUserIds(me);
  if (!fellowIds.includes(toUserId)) {
    res.status(403).json({ error: "Not a fellow." }); return;
  }

  // Anti-spam dedupe — one push per recipient per hour from the same sender.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db.select({ id: fellowEncouragementsTable.id })
    .from(fellowEncouragementsTable)
    .where(and(
      eq(fellowEncouragementsTable.fromUserId, me),
      eq(fellowEncouragementsTable.toUserId, toUserId),
      gt(fellowEncouragementsTable.createdAt, hourAgo),
    ))
    .limit(1);
  if (recent) { res.json({ ok: true, deduped: true }); return; }

  await db.insert(fellowEncouragementsTable).values({ fromUserId: me, toUserId });

  // Notify the recipient. The 🙌 lives in the in-app banner (push titles strip
  // emoji); the lock-screen copy is the encouragement itself.
  try {
    const [sender] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, me));
    await sendPushToUser(toUserId, {
      title: `${firstName(sender?.name)} encouraged you`,
      body: "Keep growing with Phoebe.",
      path: "/people",
      threadId: "encouragement",
    });
  } catch (err) {
    console.warn("[encouragements] push failed:", err);
  }

  res.json({ ok: true });
});

// GET /api/encouragements — UNSEEN encouragements I've received, newest first,
// with the sender's name + avatar so the client can show a warm banner.
router.get("/encouragements", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select({
    id: fellowEncouragementsTable.id,
    fromUserId: fellowEncouragementsTable.fromUserId,
    createdAt: fellowEncouragementsTable.createdAt,
  })
    .from(fellowEncouragementsTable)
    .where(and(
      eq(fellowEncouragementsTable.toUserId, me),
      isNull(fellowEncouragementsTable.seenAt),
    ))
    .orderBy(desc(fellowEncouragementsTable.createdAt))
    .limit(20);

  if (rows.length === 0) { res.json({ encouragements: [] }); return; }

  const senderIds = [...new Set(rows.map(r => r.fromUserId))];
  const senders = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    avatarUrl: usersTable.avatarUrl,
  }).from(usersTable).where(inArray(usersTable.id, senderIds));
  const byId = new Map(senders.map(s => [s.id, s]));

  res.json({
    encouragements: rows.map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      name: byId.get(r.fromUserId)?.name ?? "A fellow",
      avatarUrl: byId.get(r.fromUserId)?.avatarUrl ?? null,
    })),
  });
});

// POST /api/encouragements/seen — clear my unseen banner.
router.post("/encouragements/seen", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.update(fellowEncouragementsTable)
    .set({ seenAt: new Date() })
    .where(and(
      eq(fellowEncouragementsTable.toUserId, me),
      isNull(fellowEncouragementsTable.seenAt),
    ));
  res.json({ ok: true });
});

export default router;
