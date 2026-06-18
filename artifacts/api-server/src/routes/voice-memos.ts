// Ephemeral, end-to-end-encrypted voice memos between Fellows.
//
// The server is a blind relay: it stores only opaque ciphertext (encrypted on
// the sender's device against the recipient's published public key), holds it
// briefly, and deletes it the moment the recipient listens — plus a hard TTL
// sweep in the retention cron. We never have a key and never retain playable
// audio. Companion key endpoints (/keys/public) publish/fetch the static ECDH
// public keys that make this possible.

import { Router, type IRouter } from "express";
import { and, eq, isNull, gt, desc } from "drizzle-orm";
import {
  db,
  voiceMemosTable,
  userPublicKeysTable,
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

const MEMO_TTL_HOURS = 48;
// base64 ciphertext cap: ~60s of Opus/AAC is ~250 KB → ~340 KB base64; allow headroom.
const MAX_CIPHERTEXT = 900_000;

// ─── POST /api/keys/public — publish my static ECDH public key ───────────────
router.post("/keys/public", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = z.object({ publicKeyJwk: z.string().min(1).max(4000) }).safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Invalid key" }); return; }
  await db.insert(userPublicKeysTable)
    .values({ userId: me, publicKeyJwk: parsed.data.publicKeyJwk })
    .onConflictDoUpdate({ target: userPublicKeysTable.userId, set: { publicKeyJwk: parsed.data.publicKeyJwk, updatedAt: new Date() } });
  res.json({ ok: true });
});

// ─── GET /api/keys/public/:userId — a fellow's public key (to encrypt to them) ─
router.get("/keys/public/:userId", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) { res.status(400).json({ error: "Bad id" }); return; }
  if (userId !== me) {
    const fellowIds = await getFellowUserIds(me);
    if (!fellowIds.includes(userId)) { res.status(403).json({ error: "Not a fellow." }); return; }
  }
  const [row] = await db.select({ publicKeyJwk: userPublicKeysTable.publicKeyJwk })
    .from(userPublicKeysTable).where(eq(userPublicKeysTable.userId, userId));
  if (!row) { res.status(404).json({ error: "No key" }); return; }
  res.json({ publicKeyJwk: row.publicKeyJwk });
});

// ─── POST /api/voice-memos — send an encrypted memo to a fellow ───────────────
const sendSchema = z.object({
  recipientId: z.number().int().positive(),
  ciphertext: z.string().min(1).max(MAX_CIPHERTEXT),
  iv: z.string().min(1).max(64),
  ephemeralPublicJwk: z.string().min(1).max(4000),
  mimeType: z.string().min(1).max(64),
  durationMs: z.number().int().min(0).max(65_000).optional(),
});
router.post("/voice-memos", rateLimit({
  name: "voice_memo_send",
  max: 40,
  windowMs: 60 * 60 * 1000,
  keyFn: byUser,
  message: "You've sent a lot of voice notes. Take a breath and try again soon.",
}), async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = sendSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Invalid memo." }); return; }
  const d = parsed.data;
  if (d.recipientId === me) { res.status(400).json({ error: "Can't send to yourself." }); return; }
  const fellowIds = await getFellowUserIds(me);
  if (!fellowIds.includes(d.recipientId)) { res.status(403).json({ error: "Not a fellow." }); return; }

  const expiresAt = new Date(Date.now() + MEMO_TTL_HOURS * 60 * 60 * 1000);
  await db.insert(voiceMemosTable).values({
    senderId: me,
    recipientId: d.recipientId,
    ciphertext: d.ciphertext,
    iv: d.iv,
    ephemeralPublicJwk: d.ephemeralPublicJwk,
    mimeType: d.mimeType,
    durationMs: d.durationMs ?? 0,
    expiresAt,
  });

  // Notify the recipient — the audio is opaque to us, the push is just a knock.
  void (async () => {
    try {
      const [sender] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, me));
      const first = (sender?.name ?? "A fellow").trim().split(/\s+/)[0] || "A fellow";
      await sendPushToUser(d.recipientId, {
        title: `${first} sent you a voice prayer`,
        body: "Tap to listen — it fades after you hear it.",
        path: "/messages",
        threadId: "voice-memo",
      });
    } catch { /* best-effort */ }
  })();

  res.json({ ok: true });
});

// ─── GET /api/voice-memos — my unheard received memos (opaque ciphertext) ─────
router.get("/voice-memos", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select({
    id: voiceMemosTable.id,
    senderId: voiceMemosTable.senderId,
    ciphertext: voiceMemosTable.ciphertext,
    iv: voiceMemosTable.iv,
    ephemeralPublicJwk: voiceMemosTable.ephemeralPublicJwk,
    mimeType: voiceMemosTable.mimeType,
    durationMs: voiceMemosTable.durationMs,
    createdAt: voiceMemosTable.createdAt,
    name: usersTable.name,
    avatarUrl: usersTable.avatarUrl,
  }).from(voiceMemosTable)
    .innerJoin(usersTable, eq(usersTable.id, voiceMemosTable.senderId))
    .where(and(
      eq(voiceMemosTable.recipientId, me),
      isNull(voiceMemosTable.listenedAt),
      gt(voiceMemosTable.expiresAt, new Date()),
    ))
    .orderBy(desc(voiceMemosTable.createdAt))
    .limit(30);
  res.json({ memos: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
});

// ─── POST /api/voice-memos/:id/listened — recipient heard it → delete now ─────
router.post("/voice-memos/:id/listened", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad id" }); return; }
  // Only the recipient can clear it; deletion is immediate (we never keep it).
  await db.delete(voiceMemosTable).where(and(eq(voiceMemosTable.id, id), eq(voiceMemosTable.recipientId, me)));
  res.json({ ok: true });
});

export default router;
