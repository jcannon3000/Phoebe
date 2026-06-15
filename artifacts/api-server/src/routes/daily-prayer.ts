import { Router, type IRouter } from "express";
import { eq, and, or, desc, ne, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  userMutesTable,
  prayerPartnershipsTable,
  dailyPrayersTable,
  prayerAttentionsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { sendPushToUser, sendDailyPrayerPush } from "../lib/pushSender";
import { perUserRateLimit } from "../lib/rate-limit";

// ── Prayer Dialogue: the 1:1 "prayer for the day" ──────────────────────────
//
// Replaces the old broadcast prayer-request + amen feed. Two people are
// partners. Once a day each shares their prayer for the day; the partner
// OPENS it and giving it >=3 seconds of attention IS the prayer (no amen).
// Sharing notifies the partner; viewing never does — but the author sees the
// receipt. After attending the partner's prayer, the client prompts the user
// to send their own back, which is what notifies the partner in turn.

const router: IRouter = Router();
const ATTENTION_THRESHOLD_SECONDS = 3;

function uidOf(req: { user?: unknown }): number | null {
  return req.user ? (req.user as { id: number }).id : null;
}

// YYYY-MM-DD for "now" in an IANA tz (en-CA gives ISO order). Mirrors the
// helper in prayer-streak.ts so "one per day" lines up with the rest of the app.
function todayInTz(tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/New_York" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function stepBack(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1) - 86_400_000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function normPair(a: number, b: number): { lo: number; hi: number } {
  return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
}

async function getUserTz(userId: number): Promise<string | null> {
  const [u] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
  return u?.timezone ?? null;
}

// The single active partnership a user is in, or null. (At most one is
// allowed; enforced on invite/accept.)
async function getActivePartnership(userId: number) {
  const [row] = await db.select().from(prayerPartnershipsTable).where(and(
    eq(prayerPartnershipsTable.status, "active"),
    or(eq(prayerPartnershipsTable.userLoId, userId), eq(prayerPartnershipsTable.userHiId, userId)),
  ));
  return row ?? null;
}

function partnerIdOf(row: { userLoId: number; userHiId: number }, me: number): number {
  return row.userLoId === me ? row.userHiId : row.userLoId;
}

// Bidirectional block check (mirrors fellows-connect's isBlockedBetween). The
// 1:1 substrate elsewhere skips this; we honor it so a muted partner can't
// keep pinging — even though the bond is consented, either side may later mute.
async function areMuted(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: userMutesTable.id }).from(userMutesTable).where(or(
    and(eq(userMutesTable.muterId, a), eq(userMutesTable.mutedUserId, b)),
    and(eq(userMutesTable.muterId, b), eq(userMutesTable.mutedUserId, a)),
  ));
  return rows.length > 0;
}

async function loadUserCard(userId: number) {
  const [u] = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl,
  }).from(usersTable).where(eq(usersTable.id, userId));
  return u ?? null;
}

// Consecutive days (ending today or yesterday in the viewer's tz) on which
// BOTH partners shared a prayer. The mutual "days walking together" streak.
async function computeStreak(partnershipId: number, loId: number, hiId: number, viewerTz: string | null): Promise<number> {
  const rows = await db.select({ authorId: dailyPrayersTable.authorId, ymd: dailyPrayersTable.ymd })
    .from(dailyPrayersTable)
    .where(eq(dailyPrayersTable.partnershipId, partnershipId));
  const byDay = new Map<string, Set<number>>();
  for (const r of rows) {
    const s = byDay.get(r.ymd) ?? new Set<number>();
    s.add(r.authorId);
    byDay.set(r.ymd, s);
  }
  const bothShared = (ymd: string) => {
    const s = byDay.get(ymd);
    return !!s && s.has(loId) && s.has(hiId);
  };
  const today = todayInTz(viewerTz);
  let cursor = bothShared(today) ? today : (bothShared(stepBack(today)) ? stepBack(today) : null);
  let streak = 0;
  while (cursor && bothShared(cursor)) {
    streak += 1;
    cursor = stepBack(cursor);
  }
  return streak;
}

// ─── GET /api/prayer-partner ───────────────────────────────────────────────
// The user's partner state: active partner (+ streak), or a pending invite
// (incoming/outgoing), or none.
router.get("/prayer-partner", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select().from(prayerPartnershipsTable).where(and(
    or(eq(prayerPartnershipsTable.userLoId, uid), eq(prayerPartnershipsTable.userHiId, uid)),
    or(eq(prayerPartnershipsTable.status, "active"), eq(prayerPartnershipsTable.status, "pending")),
  ));
  const active = rows.find(r => r.status === "active") ?? null;
  if (active) {
    const partner = await loadUserCard(partnerIdOf(active, uid));
    const streak = await computeStreak(active.id, active.userLoId, active.userHiId, await getUserTz(uid));
    res.json({ status: "active", partnershipId: active.id, partner, streak });
    return;
  }
  const pending = rows.find(r => r.status === "pending") ?? null;
  if (pending) {
    const partner = await loadUserCard(partnerIdOf(pending, uid));
    res.json({
      status: pending.invitedById === uid ? "pending_out" : "pending_in",
      partnershipId: pending.id,
      partner,
    });
    return;
  }
  res.json({ status: "none", partner: null });
});

// ─── GET /api/prayer-partner/invites ───────────────────────────────────────
// Incoming partner invites (someone asked to be my prayer partner).
router.get("/prayer-partner/invites", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select({
    id: prayerPartnershipsTable.id,
    invitedById: prayerPartnershipsTable.invitedById,
    createdAt: prayerPartnershipsTable.createdAt,
    inviterName: usersTable.name,
    inviterAvatarUrl: usersTable.avatarUrl,
    inviterId: usersTable.id,
  })
    .from(prayerPartnershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, prayerPartnershipsTable.invitedById))
    .where(and(
      eq(prayerPartnershipsTable.status, "pending"),
      ne(prayerPartnershipsTable.invitedById, uid),
      or(eq(prayerPartnershipsTable.userLoId, uid), eq(prayerPartnershipsTable.userHiId, uid)),
    ))
    .orderBy(desc(prayerPartnershipsTable.createdAt));
  res.json(rows);
});

// ─── POST /api/prayer-partner/invite ───────────────────────────────────────
// Invite someone to be your prayer partner. If they already invited you, this
// accepts (mutual). One active partner per person.
router.post("/prayer-partner/invite", perUserRateLimit("prayer_partner_invite", {
  max: 20, windowMs: 60 * 60 * 1000,
  message: "You've sent a lot of invites recently. Please try again later.",
}), async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = z.object({ recipientUserId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const recipientId = parsed.data.recipientUserId;
  if (recipientId === uid) { res.status(400).json({ error: "You can't partner with yourself." }); return; }

  const recipient = await loadUserCard(recipientId);
  if (!recipient) { res.status(404).json({ error: "Person not found" }); return; }
  if (await areMuted(uid, recipientId)) { res.status(403).json({ error: "You can't partner with this person." }); return; }

  if (await getActivePartnership(uid)) { res.status(409).json({ error: "You already have a prayer partner." }); return; }
  if (await getActivePartnership(recipientId)) { res.status(409).json({ error: "They already have a prayer partner." }); return; }

  const { lo, hi } = normPair(uid, recipientId);
  const [existing] = await db.select().from(prayerPartnershipsTable).where(and(
    eq(prayerPartnershipsTable.userLoId, lo), eq(prayerPartnershipsTable.userHiId, hi),
  ));

  const [me] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
  const myName = me?.name || "Someone";

  // Reverse pending invite → accept (mutual).
  if (existing && existing.status === "pending" && existing.invitedById === recipientId) {
    const [activated] = await db.update(prayerPartnershipsTable)
      .set({ status: "active", acceptedAt: new Date() })
      .where(eq(prayerPartnershipsTable.id, existing.id)).returning();
    sendPushToUser(recipientId, {
      title: `${myName.split(/\s+/)[0]} is now your prayer partner`,
      body: "Share your prayer for the day.",
      path: "/prayer-partner",
      threadId: "prayer-dialogue",
    }).catch(() => {});
    res.json({ status: "active", partnershipId: activated.id, partner: recipient });
    return;
  }
  if (existing && existing.status === "active") {
    res.status(409).json({ error: "You're already partners." }); return;
  }
  // Re-invite my own outstanding invite is a no-op; revive an ended bond.
  let partnershipId: number;
  if (existing) {
    const [revived] = await db.update(prayerPartnershipsTable)
      .set({ status: "pending", invitedById: uid, createdAt: new Date(), acceptedAt: null, endedAt: null, endedById: null })
      .where(eq(prayerPartnershipsTable.id, existing.id)).returning();
    partnershipId = revived.id;
  } else {
    const [created] = await db.insert(prayerPartnershipsTable)
      .values({ userLoId: lo, userHiId: hi, invitedById: uid, status: "pending" }).returning();
    partnershipId = created.id;
  }
  sendPushToUser(recipientId, {
    title: `${myName.split(/\s+/)[0]} wants to be your prayer partner`,
    body: "Open Phoebe to accept.",
    path: "/prayer-partner",
    threadId: "prayer-dialogue",
  }).catch(() => {});
  res.status(201).json({ status: "pending_out", partnershipId, partner: recipient });
});

// ─── POST /api/prayer-partner/invites/:id/accept ───────────────────────────
router.post("/prayer-partner/invites/:id/accept", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(prayerPartnershipsTable).where(eq(prayerPartnershipsTable.id, id));
  if (!row || row.status !== "pending") { res.status(404).json({ error: "Invite not found" }); return; }
  const isMember = row.userLoId === uid || row.userHiId === uid;
  if (!isMember || row.invitedById === uid) { res.status(403).json({ error: "Forbidden" }); return; }

  if (await getActivePartnership(uid)) { res.status(409).json({ error: "You already have a prayer partner." }); return; }
  if (await getActivePartnership(row.invitedById)) { res.status(409).json({ error: "They already have a prayer partner." }); return; }

  const [activated] = await db.update(prayerPartnershipsTable)
    .set({ status: "active", acceptedAt: new Date() })
    .where(eq(prayerPartnershipsTable.id, id)).returning();

  const [me] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
  sendPushToUser(row.invitedById, {
    title: `${(me?.name || "Someone").split(/\s+/)[0]} is now your prayer partner`,
    body: "Share your prayer for the day.",
    path: "/prayer-partner",
    threadId: "prayer-dialogue",
  }).catch(() => {});

  const partner = await loadUserCard(partnerIdOf(activated, uid));
  res.json({ status: "active", partnershipId: activated.id, partner });
});

// ─── POST /api/prayer-partner/invites/:id/decline ──────────────────────────
router.post("/prayer-partner/invites/:id/decline", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(prayerPartnershipsTable).where(eq(prayerPartnershipsTable.id, id));
  if (!row || row.status !== "pending") { res.status(404).json({ error: "Invite not found" }); return; }
  if (row.userLoId !== uid && row.userHiId !== uid) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.update(prayerPartnershipsTable)
    .set({ status: "ended", endedAt: new Date(), endedById: uid })
    .where(eq(prayerPartnershipsTable.id, id));
  res.json({ ok: true });
});

// ─── POST /api/prayer-partner/end ──────────────────────────────────────────
// End the active partnership. History (daily_prayers) is preserved.
router.post("/prayer-partner/end", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const active = await getActivePartnership(uid);
  if (!active) { res.status(404).json({ error: "No active partner" }); return; }
  await db.update(prayerPartnershipsTable)
    .set({ status: "ended", endedAt: new Date(), endedById: uid })
    .where(eq(prayerPartnershipsTable.id, active.id));
  res.json({ ok: true });
});

// ─── POST /api/daily-prayer ────────────────────────────────────────────────
// Share your prayer for the day (one per local day). Notifies the partner.
router.post("/daily-prayer", perUserRateLimit("daily_prayer_share", {
  max: 30, windowMs: 60 * 60 * 1000,
  message: "Too many attempts. Please try again later.",
}), async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = z.object({ body: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const active = await getActivePartnership(uid);
  if (!active) { res.status(409).json({ error: "no_partner", message: "You need a prayer partner first." }); return; }
  const partnerId = partnerIdOf(active, uid);
  const ymd = todayInTz(await getUserTz(uid));

  const [existing] = await db.select().from(dailyPrayersTable).where(and(
    eq(dailyPrayersTable.authorId, uid), eq(dailyPrayersTable.ymd, ymd),
  ));
  if (existing) { res.status(409).json({ error: "already_shared_today", prayer: existing }); return; }

  let created;
  try {
    [created] = await db.insert(dailyPrayersTable)
      .values({ authorId: uid, partnerId, partnershipId: active.id, ymd, body: parsed.data.body })
      .returning();
  } catch {
    // Unique (author_id, ymd) race — someone double-tapped share.
    const [row] = await db.select().from(dailyPrayersTable).where(and(
      eq(dailyPrayersTable.authorId, uid), eq(dailyPrayersTable.ymd, ymd)));
    res.status(409).json({ error: "already_shared_today", prayer: row }); return;
  }

  // Record the prayer regardless, but don't push a partner who has muted (or
  // been muted by) the author.
  if (!(await areMuted(uid, partnerId))) {
    const [me] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
    sendDailyPrayerPush(partnerId, me?.name || "Your partner", created.id).catch((err) => {
      console.warn("[daily-prayer] push dispatch failed:", err);
    });
  }

  res.status(201).json(created);
});

// ─── GET /api/daily-prayer/today ───────────────────────────────────────────
// The home of the feature: my prayer today, my partner's latest (+ whether
// I've given it attention), the receipt on mine, the streak, and the prompts.
router.get("/daily-prayer/today", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const active = await getActivePartnership(uid);
  if (!active) { res.json({ status: "none", partner: null }); return; }

  const partnerId = partnerIdOf(active, uid);
  const partner = await loadUserCard(partnerId);
  const tz = await getUserTz(uid);
  const ymd = todayInTz(tz);

  const [mine] = await db.select().from(dailyPrayersTable).where(and(
    eq(dailyPrayersTable.authorId, uid), eq(dailyPrayersTable.ymd, ymd)));

  // My partner's most recent prayer (the one I'd open + attend).
  const [theirs] = await db.select().from(dailyPrayersTable)
    .where(and(eq(dailyPrayersTable.partnershipId, active.id), eq(dailyPrayersTable.authorId, partnerId)))
    .orderBy(desc(dailyPrayersTable.createdAt)).limit(1);

  // My most recent prayer (for the receipt: did my partner attend it?).
  const [myLatest] = mine ? [mine] : await db.select().from(dailyPrayersTable)
    .where(and(eq(dailyPrayersTable.partnershipId, active.id), eq(dailyPrayersTable.authorId, uid)))
    .orderBy(desc(dailyPrayersTable.createdAt)).limit(1);

  const myAttention = theirs ? (await db.select().from(prayerAttentionsTable).where(and(
    eq(prayerAttentionsTable.dailyPrayerId, theirs.id), eq(prayerAttentionsTable.viewerId, uid))))[0] : undefined;
  const partnerAttention = myLatest ? (await db.select().from(prayerAttentionsTable).where(and(
    eq(prayerAttentionsTable.dailyPrayerId, myLatest.id), eq(prayerAttentionsTable.viewerId, partnerId))))[0] : undefined;

  const streak = await computeStreak(active.id, active.userLoId, active.userHiId, tz);
  const iAttendedTheirs = !!myAttention?.countedAt;

  res.json({
    status: "active",
    partner,
    streak,
    canShareToday: !mine,
    mine: mine ?? null,
    theirs: theirs ? {
      ...theirs,
      myAttention: { counted: iAttendedTheirs, seconds: myAttention?.attentionSeconds ?? 0 },
    } : null,
    myLatest: myLatest ? {
      ...myLatest,
      partnerAttention: {
        counted: !!partnerAttention?.countedAt,
        viewedAt: partnerAttention?.firstViewedAt ?? null,
      },
    } : null,
    // After I've prayed (attended) my partner's prayer and haven't shared mine
    // today, the client nudges me to send my prayer for the day back.
    shouldPromptSendBack: iAttendedTheirs && !mine,
  });
});

// ─── POST /api/daily-prayer/:id/attention ──────────────────────────────────
// Record attention on the partner's prayer. >=3s = it counts (the "prayed"
// moment). Monotonic. NEVER notifies the author — only the in-app receipt.
router.post("/daily-prayer/:id/attention", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = z.object({ seconds: z.number().min(0).max(3600) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const seconds = Math.round(parsed.data.seconds);

  const [prayer] = await db.select().from(dailyPrayersTable).where(eq(dailyPrayersTable.id, id));
  if (!prayer) { res.status(404).json({ error: "Not found" }); return; }
  // Only the addressed partner attends — not the author of their own prayer.
  if (prayer.partnerId !== uid) { res.status(403).json({ error: "Forbidden" }); return; }

  const [existing] = await db.select().from(prayerAttentionsTable).where(and(
    eq(prayerAttentionsTable.dailyPrayerId, id), eq(prayerAttentionsTable.viewerId, uid)));
  const prevSeconds = existing?.attentionSeconds ?? 0;
  const newSeconds = Math.max(prevSeconds, seconds);
  const alreadyCounted = !!existing?.countedAt;
  const nowCounted = alreadyCounted || newSeconds >= ATTENTION_THRESHOLD_SECONDS;

  const now = new Date();
  await db.insert(prayerAttentionsTable)
    .values({
      dailyPrayerId: id, viewerId: uid, firstViewedAt: now,
      attentionSeconds: newSeconds, countedAt: nowCounted ? now : null, updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [prayerAttentionsTable.dailyPrayerId, prayerAttentionsTable.viewerId],
      set: {
        attentionSeconds: sql`GREATEST(${prayerAttentionsTable.attentionSeconds}, ${newSeconds})`,
        countedAt: sql`COALESCE(${prayerAttentionsTable.countedAt}, ${nowCounted ? now : null})`,
        updatedAt: now,
      },
    });

  res.json({ counted: nowCounted, seconds: newSeconds });
});

// ─── GET /api/daily-prayer/history ─────────────────────────────────────────
// The full back-and-forth timeline for the active partnership, each prayer
// tagged with its attention receipt.
router.get("/daily-prayer/history", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const active = await getActivePartnership(uid);
  if (!active) { res.json({ status: "none", partner: null, items: [] }); return; }
  const partnerId = partnerIdOf(active, uid);
  const partner = await loadUserCard(partnerId);

  const prayers = await db.select().from(dailyPrayersTable)
    .where(eq(dailyPrayersTable.partnershipId, active.id))
    .orderBy(desc(dailyPrayersTable.createdAt));
  if (prayers.length === 0) { res.json({ status: "active", partner, items: [] }); return; }

  const attentions = await db.select().from(prayerAttentionsTable)
    .where(inArray(prayerAttentionsTable.dailyPrayerId, prayers.map(p => p.id)));
  const attByPrayer = new Map<number, typeof prayerAttentionsTable.$inferSelect>();
  for (const a of attentions) attByPrayer.set(a.dailyPrayerId, a);

  const items = prayers.map(p => {
    const att = attByPrayer.get(p.id);
    return {
      id: p.id, authorId: p.authorId, isMine: p.authorId === uid,
      body: p.body, ymd: p.ymd, createdAt: p.createdAt,
      attention: att ? { counted: !!att.countedAt, countedAt: att.countedAt, seconds: att.attentionSeconds } : null,
    };
  });

  res.json({ status: "active", partner, items });
});

export default router;
