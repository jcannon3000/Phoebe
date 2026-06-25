import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupMessagesTable,
  groupMessageReadsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, desc, lt, gt, ne, count, inArray, isNotNull, sql } from "drizzle-orm";
import { perUserRateLimit } from "../lib/rate-limit";
import { sendPushToUsers } from "../lib/pushSender";
import { logger } from "../lib/logger";

// ── Group chat ───────────────────────────────────────────────────────────────
// A live message stream scoped to a community. The group IS the room: any
// JOINED member can read + post; there's no separate conversation object.
//
//   GET  /api/groups/:slug/chat[?before=<id>]  — recent messages (marks read)
//   POST /api/groups/:slug/chat { body }        — send (fans out push)
//   GET  /api/groups/:slug/chat/unread          — unread count (does NOT mark read)
//
// Plaintext (server-readable), like the 1:1 beta-messages surface.

const router: IRouter = Router();

const PAGE = 50;
const MAX_BODY = 4000;

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

// Resolve the group by slug and confirm the caller is a JOINED member. Returns
// the group + the caller's member row, or null (→ 404, never leaking existence).
async function requireJoinedMember(slug: string, userId: number) {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, slug));
  if (!group) return null;
  const [member] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.userId, userId)));
  if (!member || !member.joinedAt) return null;
  return { group, member };
}

// Advance the member's read cursor to `upToId` — but never backward (a poll of
// an older page must not un-read newer messages), via GREATEST on conflict.
async function markRead(groupId: number, userId: number, upToId: number): Promise<void> {
  if (!Number.isFinite(upToId) || upToId <= 0) return;
  await db.insert(groupMessageReadsTable)
    .values({ groupId, userId, lastReadMessageId: upToId })
    .onConflictDoUpdate({
      target: [groupMessageReadsTable.groupId, groupMessageReadsTable.userId],
      set: { lastReadMessageId: sql`GREATEST(${groupMessageReadsTable.lastReadMessageId}, ${upToId})` },
    });
}

// GET /api/groups/:slug/chat — newest page of messages (optionally older than
// ?before=<id> for back-scroll). Opening/polling the chat marks it read.
router.get("/groups/:slug/chat", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ctx = await requireJoinedMember(String(req.params.slug), userId);
  if (!ctx) { res.status(404).json({ error: "Not found" }); return; }

  const beforeRaw = Number(req.query.before);
  const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : null;
  const isNewestPage = before === null;
  const where = before !== null
    ? and(eq(groupMessagesTable.groupId, ctx.group.id), lt(groupMessagesTable.id, before))
    : eq(groupMessagesTable.groupId, ctx.group.id);

  try {
    // Pull newest-first for the limit, then hand back oldest-first for render.
    const rows = await db.select().from(groupMessagesTable)
      .where(where)
      .orderBy(desc(groupMessagesTable.id))
      .limit(PAGE + 1);
    const hasMore = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    // Newest id ACTUALLY returned — the read cursor only ever advances to what
    // the client received, so a message inserted mid-request stays unread.
    const newestReturnedId = page.length > 0 ? page[0]!.id : 0;

    const senderIds = [...new Set(page.map((m) => m.senderUserId))];
    const senders = senderIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
          .from(usersTable).where(inArray(usersTable.id, senderIds))
      : [];
    const byId = new Map(senders.map((s) => [s.id, s]));

    const messages = page.reverse().map((m) => {
      const s = byId.get(m.senderUserId);
      return {
        id: m.id,
        body: m.body,
        createdAt: m.createdAt ? m.createdAt.toISOString() : null,
        senderUserId: m.senderUserId,
        senderName: s?.name ?? "Someone",
        senderAvatarUrl: s?.avatarUrl ?? null,
        mine: m.senderUserId === userId,
      };
    });

    // A poll/open of the newest page = caught up THROUGH what we returned.
    if (isNewestPage) await markRead(ctx.group.id, userId, newestReturnedId);

    res.json({ groupName: ctx.group.name, groupEmoji: ctx.group.emoji ?? null, messages, hasMore });
  } catch (err) {
    logger.warn({ err, slug: req.params.slug }, "[group-chat] list failed");
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/groups/:slug/chat — send a message, fan out a push to the rest.
router.post(
  "/groups/:slug/chat",
  perUserRateLimit("group_chat_send", { max: 60, windowMs: 60 * 1000, message: "You're sending messages very quickly. Please slow down a moment." }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = uid(req);
    if (userId === null) { res.status(401).json({ error: "Unauthorized" }); return; }
    const ctx = await requireJoinedMember(String(req.params.slug), userId);
    if (!ctx) { res.status(404).json({ error: "Not found" }); return; }

    const raw = (req.body as { body?: unknown })?.body;
    const body = typeof raw === "string" ? raw.trim().slice(0, MAX_BODY) : "";
    if (!body) { res.status(400).json({ error: "Message can't be empty" }); return; }

    try {
      const [row] = await db.insert(groupMessagesTable)
        .values({ groupId: ctx.group.id, senderUserId: userId, body })
        .returning();
      // Sender has now seen their own message.
      await markRead(ctx.group.id, userId, row!.id);

      const [me] = await db.select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
        .from(usersTable).where(eq(usersTable.id, userId));

      // Fan out a push to every OTHER joined member.
      const members = await db.select({ userId: groupMembersTable.userId })
        .from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, ctx.group.id), isNotNull(groupMembersTable.joinedAt)));
      const others = members
        .map((m) => m.userId)
        .filter((id): id is number => typeof id === "number" && id !== userId);
      if (others.length > 0) {
        const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;
        void sendPushToUsers(others, {
          title: ctx.group.name,
          body: `${me?.name ?? "Someone"}: ${snippet}`,
          path: `/communities/${ctx.group.slug}/chat`,
          threadId: `group-chat-${ctx.group.id}`,
        }).catch(() => { /* best effort */ });
      }

      res.json({
        message: {
          id: row!.id,
          body: row!.body,
          createdAt: row!.createdAt ? row!.createdAt.toISOString() : null,
          senderUserId: userId,
          senderName: me?.name ?? "You",
          senderAvatarUrl: me?.avatarUrl ?? null,
          mine: true,
        },
      });
    } catch (err) {
      logger.warn({ err, slug: req.params.slug }, "[group-chat] send failed");
      res.status(500).json({ error: "server_error" });
    }
  },
);

// GET /api/groups/:slug/chat/unread — count of messages this member hasn't seen
// (not sent by them, newer than their read cursor). Does NOT mark read.
router.get("/groups/:slug/chat/unread", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ctx = await requireJoinedMember(String(req.params.slug), userId);
  if (!ctx) { res.status(404).json({ error: "Not found" }); return; }

  try {
    const [readRow] = await db.select({ cursor: groupMessageReadsTable.lastReadMessageId })
      .from(groupMessageReadsTable)
      .where(and(eq(groupMessageReadsTable.groupId, ctx.group.id), eq(groupMessageReadsTable.userId, userId)));
    const cursor = readRow?.cursor ?? 0;
    // Count in SQL: messages newer than the cursor not sent by me. No LIMIT, no
    // JS filter — so own messages never consume a cap and the total is exact.
    const [c] = await db.select({ value: count() })
      .from(groupMessagesTable)
      .where(and(
        eq(groupMessagesTable.groupId, ctx.group.id),
        gt(groupMessagesTable.id, cursor),
        ne(groupMessagesTable.senderUserId, userId),
      ));
    const n = Number(c?.value ?? 0);
    res.json({ count: n, capped: n > 99 });
  } catch (err) {
    logger.warn({ err, slug: req.params.slug }, "[group-chat] unread failed");
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
