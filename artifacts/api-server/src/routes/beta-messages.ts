import { Router, type IRouter, type RequestHandler } from "express";
import { eq, and, ne, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  betaUsersTable,
  betaConversationsTable,
  betaConversationMembersTable,
  betaMessagesTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { sendBetaMessagePush } from "../lib/pushSender";

// ─────────────────────────────────────────────────────────────────────────
// Beta Messages (beta-only)
// ─────────────────────────────────────────────────────────────────────────
//
// Unlimited 1:1 messaging between beta users — the Letters UI's warmth
// without its fortnightly cadence. No rate limit: beta users send as
// many messages as they like. Every endpoint is beta-gated; the
// recipient picker only lists other beta users who have a Phoebe
// account (so there's a userId to address).

const router: IRouter = Router();

type SessionUser = { id: number; email: string; name: string };
function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

// Beta gate — same shape as group-reflections.ts: look up the caller's
// email in beta_users, 403 otherwise.
const requireBeta: RequestHandler = async (req, res, next) => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [beta] = await db.select({ email: betaUsersTable.email })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (!beta) {
      res.status(403).json({ error: "Messages is a beta-only feature." });
      return;
    }
    next();
  } catch {
    res.status(403).json({ error: "Messages is a beta-only feature." });
  }
};

// Resolve the set of beta-user account ids (beta users WITH a Phoebe
// account — we can only address a userId). Returns id→{name,email,avatar}.
async function betaUserAccounts(): Promise<Map<number, { name: string; email: string; avatarUrl: string | null }>> {
  const betaRows = await db.select({ email: betaUsersTable.email }).from(betaUsersTable);
  const emails = betaRows.map((r) => r.email.toLowerCase());
  const out = new Map<number, { name: string; email: string; avatarUrl: string | null }>();
  if (emails.length === 0) return out;
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    avatarUrl: usersTable.avatarUrl,
  }).from(usersTable).where(inArray(sql`lower(${usersTable.email})`, emails));
  for (const u of users) out.set(u.id, { name: u.name, email: u.email, avatarUrl: u.avatarUrl });
  return out;
}

// ── GET /api/beta-messages/users ──────────────────────────────────────────
// The recipient picker: every other beta user with an account.
router.get("/beta-messages/users", requireBeta, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const accounts = await betaUserAccounts();
  const users = [...accounts.entries()]
    .filter(([id]) => id !== me.id)
    .map(([id, u]) => ({ id, name: u.name, email: u.email, avatarUrl: u.avatarUrl }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  res.json({ users });
});

// ── GET /api/beta-messages/conversations ──────────────────────────────────
// The inbox: my (non-archived) conversations with the other participant,
// last-message preview, time, and unread count. Sorted most-recent-first.
router.get("/beta-messages/conversations", requireBeta, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const myMembers = await db.select().from(betaConversationMembersTable)
    .where(and(
      eq(betaConversationMembersTable.userId, me.id),
      isNull(betaConversationMembersTable.archivedAt),
    ));
  const convIds = myMembers.map((m) => m.conversationId);
  if (convIds.length === 0) { res.json({ conversations: [] }); return; }

  const convs = await db.select().from(betaConversationsTable)
    .where(inArray(betaConversationsTable.id, convIds));

  // The other participant per conversation (+ their profile).
  const others = await db.select({
    conversationId: betaConversationMembersTable.conversationId,
    userId: betaConversationMembersTable.userId,
    name: usersTable.name,
    email: usersTable.email,
    avatarUrl: usersTable.avatarUrl,
  })
    .from(betaConversationMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, betaConversationMembersTable.userId))
    .where(and(
      inArray(betaConversationMembersTable.conversationId, convIds),
      ne(betaConversationMembersTable.userId, me.id),
    ));
  const otherByConv = new Map(others.map((o) => [o.conversationId, o]));

  // Latest message per conversation (preview).
  const previewRows = await db.execute<{ conversation_id: number; body: string; created_at: string }>(sql`
    SELECT DISTINCT ON (conversation_id) conversation_id, body, created_at
    FROM beta_messages
    WHERE conversation_id IN (${sql.join(convIds, sql`, `)})
    ORDER BY conversation_id, created_at DESC
  `);
  const previewByConv = new Map(previewRows.rows.map((r) => [r.conversation_id, r]));

  // Unread per conversation: messages after my read cursor not sent by me.
  const unreadRows = await db.execute<{ conversation_id: number; n: number }>(sql`
    SELECT m.conversation_id, COUNT(*)::int AS n
    FROM beta_messages m
    JOIN beta_conversation_members mem
      ON mem.conversation_id = m.conversation_id AND mem.user_id = ${me.id}
    WHERE m.conversation_id IN (${sql.join(convIds, sql`, `)})
      AND m.sender_user_id <> ${me.id}
      AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)
    GROUP BY m.conversation_id
  `);
  const unreadByConv = new Map(unreadRows.rows.map((r) => [r.conversation_id, r.n]));

  const convById = new Map(convs.map((c) => [c.id, c]));
  const conversations = convIds
    .map((id) => {
      const conv = convById.get(id);
      const other = otherByConv.get(id);
      const preview = previewByConv.get(id);
      if (!conv || !other) return null;
      return {
        id,
        lastMessageAt: conv.lastMessageAt,
        otherUser: { id: other.userId, name: other.name, email: other.email, avatarUrl: other.avatarUrl },
        lastMessagePreview: preview?.body ?? null,
        unreadCount: unreadByConv.get(id) ?? 0,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  res.json({ conversations });
});

// ── POST /api/beta-messages/conversations ─────────────────────────────────
// Start (or reuse) a 1:1 conversation with another beta user.
// Body: { userId }. Returns { conversationId }.
router.post("/beta-messages/conversations", requireBeta, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const schema = z.object({ userId: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const targetId = parsed.data.userId;
  if (targetId === me.id) { res.status(400).json({ error: "Can't message yourself." }); return; }

  // Target must be a beta user with an account.
  const accounts = await betaUserAccounts();
  if (!accounts.has(targetId)) {
    res.status(403).json({ error: "That person isn't in the beta." });
    return;
  }

  // Reuse an existing 1:1 conversation if the pair already has one.
  const shared = await db.execute<{ conversation_id: number }>(sql`
    SELECT conversation_id
    FROM beta_conversation_members
    WHERE user_id IN (${me.id}, ${targetId})
    GROUP BY conversation_id
    HAVING COUNT(DISTINCT user_id) = 2
    LIMIT 1
  `);
  const existingId = shared.rows[0]?.conversation_id;
  if (existingId) {
    // Un-archive my side so it resurfaces in my inbox.
    await db.update(betaConversationMembersTable)
      .set({ archivedAt: null })
      .where(and(
        eq(betaConversationMembersTable.conversationId, existingId),
        eq(betaConversationMembersTable.userId, me.id),
      ));
    res.json({ conversationId: existingId });
    return;
  }

  const [conv] = await db.insert(betaConversationsTable).values({}).returning();
  await db.insert(betaConversationMembersTable).values([
    { conversationId: conv.id, userId: me.id },
    { conversationId: conv.id, userId: targetId },
  ]);
  res.status(201).json({ conversationId: conv.id });
});

// Confirm the caller is a member of the conversation; returns the row.
async function requireMembership(conversationId: number, userId: number) {
  const [member] = await db.select().from(betaConversationMembersTable)
    .where(and(
      eq(betaConversationMembersTable.conversationId, conversationId),
      eq(betaConversationMembersTable.userId, userId),
    ));
  return member ?? null;
}

// ── GET /api/beta-messages/conversations/:id ──────────────────────────────
// Thread view: the other participant + all messages, oldest→newest.
// Marks my read cursor to now as a side effect.
router.get("/beta-messages/conversations/:id", requireBeta, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const member = await requireMembership(id, me.id);
  if (!member) { res.status(403).json({ error: "Not in this conversation" }); return; }

  const [other] = await db.select({
    userId: betaConversationMembersTable.userId,
    name: usersTable.name,
    email: usersTable.email,
    avatarUrl: usersTable.avatarUrl,
  })
    .from(betaConversationMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, betaConversationMembersTable.userId))
    .where(and(
      eq(betaConversationMembersTable.conversationId, id),
      ne(betaConversationMembersTable.userId, me.id),
    ));

  const messages = await db.select({
    id: betaMessagesTable.id,
    senderUserId: betaMessagesTable.senderUserId,
    body: betaMessagesTable.body,
    createdAt: betaMessagesTable.createdAt,
  })
    .from(betaMessagesTable)
    .where(eq(betaMessagesTable.conversationId, id))
    .orderBy(betaMessagesTable.createdAt);

  // Advance my read cursor.
  await db.update(betaConversationMembersTable)
    .set({ lastReadAt: new Date() })
    .where(and(
      eq(betaConversationMembersTable.conversationId, id),
      eq(betaConversationMembersTable.userId, me.id),
    ));

  res.json({
    conversation: {
      id,
      otherUser: other
        ? { id: other.userId, name: other.name, email: other.email, avatarUrl: other.avatarUrl }
        : null,
    },
    messages: messages.map((m) => ({
      id: m.id,
      senderUserId: m.senderUserId,
      isMine: m.senderUserId === me.id,
      body: m.body,
      createdAt: m.createdAt,
    })),
  });
});

// ── POST /api/beta-messages/conversations/:id/messages ─────────────────────
// Send a message — NO rate limit. Bumps the conversation + pushes the
// other participant.
router.post("/beta-messages/conversations/:id/messages", requireBeta, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const member = await requireMembership(id, me.id);
  if (!member) { res.status(403).json({ error: "Not in this conversation" }); return; }

  const schema = z.object({ body: z.string().trim().min(1, "Message can't be empty").max(8000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid message" }); return; }

  const [row] = await db.insert(betaMessagesTable).values({
    conversationId: id,
    senderUserId: me.id,
    body: parsed.data.body.trim(),
  }).returning();

  // Bump conversation ordering + advance my own read cursor (I've
  // obviously "read" up through my own message).
  const now = new Date();
  await db.update(betaConversationsTable).set({ lastMessageAt: now }).where(eq(betaConversationsTable.id, id));
  await db.update(betaConversationMembersTable)
    .set({ lastReadAt: now })
    .where(and(
      eq(betaConversationMembersTable.conversationId, id),
      eq(betaConversationMembersTable.userId, me.id),
    ));

  // Push the other participant (fire-and-forget).
  void (async () => {
    try {
      const [other] = await db.select({ userId: betaConversationMembersTable.userId })
        .from(betaConversationMembersTable)
        .where(and(
          eq(betaConversationMembersTable.conversationId, id),
          ne(betaConversationMembersTable.userId, me.id),
        ));
      if (other) {
        // Generic knock only — the message text is never sent to Apple's
        // push servers (or logged). The deep link opens the thread to read it.
        await sendBetaMessagePush(other.userId, {
          senderName: me.name || "Someone",
          conversationId: id,
        });
      }
    } catch { /* non-fatal */ }
  })();

  res.status(201).json({
    message: { id: row.id, senderUserId: me.id, isMine: true, body: row.body, createdAt: row.createdAt },
  });
});

// ── POST /api/beta-messages/conversations/:id/archive ──────────────────────
// Soft-remove the conversation from my inbox (the other side keeps it;
// sending/receiving again resurfaces it).
router.post("/beta-messages/conversations/:id/archive", requireBeta, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const member = await requireMembership(id, me.id);
  if (!member) { res.status(403).json({ error: "Not in this conversation" }); return; }
  await db.update(betaConversationMembersTable)
    .set({ archivedAt: new Date() })
    .where(and(
      eq(betaConversationMembersTable.conversationId, id),
      eq(betaConversationMembersTable.userId, me.id),
    ));
  res.json({ ok: true });
});

export default router;
