import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq, and, or, desc, ne, inArray, sql, isNull, lte } from "drizzle-orm";
import {
  db,
  usersTable,
  userMutesTable,
  prayerPartnershipsTable,
  dailyPrayersTable,
  prayerAttentionsTable,
  fellowsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { sendPushToUser } from "../lib/pushSender";
import { perUserRateLimit } from "../lib/rate-limit";
import { nextDeliveryInstant } from "../lib/dailyPrayerDelivery";

// ── Prayer Dialogue: the 1:1 "prayer for the day" ──────────────────────────
//
// Replaces the old broadcast prayer-request + amen feed. You can have several
// prayer partners; each is its own thread. Once a day you share ONE prayer for
// the day — author-scoped, shared with ALL your partners. A partner OPENS it
// and giving it >=3 seconds of attention IS the prayer (no amen). Sharing
// notifies your partners; viewing never does — but they see the receipt. After
// attending a partner's prayer the client prompts you to send your own back,
// which is what notifies them in turn.

const router: IRouter = Router();
const ATTENTION_THRESHOLD_SECONDS = 3;

function uidOf(req: { user?: unknown }): number | null {
  return req.user ? (req.user as { id: number }).id : null;
}

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

// Becoming prayer partners makes you Fellows. A Fellow link is the full-app
// connection (shared prayer requests, the People page, the prayer feed), so a
// Heart to Heart is also a standing relationship — once it's mutual, you see
// each other's prayer requests like any other Fellow. Symmetric + idempotent
// (the fellows UNIQUE(user_id, fellow_user_id) + onConflictDoNothing).
async function linkPartnerFellows(a: number, b: number): Promise<void> {
  if (a === b) return;
  await db.insert(fellowsTable).values([
    { userId: a, fellowUserId: b, source: "heart-to-heart" },
    { userId: b, fellowUserId: a, source: "heart-to-heart" },
  ]).onConflictDoNothing();
}

async function getUserTz(userId: number): Promise<string | null> {
  const [u] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
  return u?.timezone ?? null;
}

// Ensure two people are active Heart to Heart partners (idempotent). Used by the
// normal start flow AND by Cobreathe: breathing one-to-one with a fellow starts
// (or revives) a Heart to Heart with them. Revives an ended bond rather than
// duplicating (the pair UNIQUE index). Also links them as Fellows.
export async function ensureActivePartnership(initiator: number, other: number): Promise<void> {
  if (initiator === other) return;
  const { lo, hi } = normPair(initiator, other);
  const [existing] = await db.select().from(prayerPartnershipsTable).where(and(
    eq(prayerPartnershipsTable.userLoId, lo), eq(prayerPartnershipsTable.userHiId, hi)));
  if (existing && existing.status === "active") {
    // already partners — nothing to do
  } else if (existing) {
    await db.update(prayerPartnershipsTable)
      .set({ status: "active", invitedById: initiator, acceptedAt: new Date(), endedAt: null, endedById: null })
      .where(eq(prayerPartnershipsTable.id, existing.id));
  } else {
    await db.insert(prayerPartnershipsTable)
      .values({ userLoId: lo, userHiId: hi, invitedById: initiator, status: "active", acceptedAt: new Date() })
      .onConflictDoNothing({ target: [prayerPartnershipsTable.userLoId, prayerPartnershipsTable.userHiId] });
  }
  await linkPartnerFellows(initiator, other);
}

// Every active partnership this user is in (multiple allowed).
async function getActivePartnerships(userId: number) {
  return db.select().from(prayerPartnershipsTable).where(and(
    eq(prayerPartnershipsTable.status, "active"),
    or(eq(prayerPartnershipsTable.userLoId, userId), eq(prayerPartnershipsTable.userHiId, userId)),
  ));
}

function partnerIdOf(row: { userLoId: number; userHiId: number }, me: number): number {
  return row.userLoId === me ? row.userHiId : row.userLoId;
}

async function getActivePartnerIds(userId: number): Promise<number[]> {
  return (await getActivePartnerships(userId)).map((r) => partnerIdOf(r, userId));
}

async function arePartners(a: number, b: number): Promise<boolean> {
  const { lo, hi } = normPair(a, b);
  const [row] = await db.select({ id: prayerPartnershipsTable.id }).from(prayerPartnershipsTable).where(and(
    eq(prayerPartnershipsTable.userLoId, lo), eq(prayerPartnershipsTable.userHiId, hi), eq(prayerPartnershipsTable.status, "active"),
  ));
  return !!row;
}

async function loadUserCard(userId: number) {
  const [u] = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl,
  }).from(usersTable).where(eq(usersTable.id, userId));
  return u ?? null;
}

// Bidirectional block check (the 1:1 substrate elsewhere skips this).
async function areMuted(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: userMutesTable.id }).from(userMutesTable).where(or(
    and(eq(userMutesTable.muterId, a), eq(userMutesTable.mutedUserId, b)),
    and(eq(userMutesTable.muterId, b), eq(userMutesTable.mutedUserId, a)),
  ));
  return rows.length > 0;
}

// Consecutive days (ending today or yesterday in the viewer's tz) on which BOTH
// people shared a prayer — the mutual "days walking together" streak for a pair.
async function computeStreak(aId: number, bId: number, viewerTz: string | null): Promise<number> {
  const rows = await db.select({ authorId: dailyPrayersTable.authorId, ymd: dailyPrayersTable.ymd })
    .from(dailyPrayersTable)
    .where(inArray(dailyPrayersTable.authorId, [aId, bId]));
  const aDays = new Set<string>();
  const bDays = new Set<string>();
  for (const r of rows) (r.authorId === aId ? aDays : bDays).add(r.ymd);
  const both = (ymd: string) => aDays.has(ymd) && bDays.has(ymd);
  const today = todayInTz(viewerTz);
  let cursor = both(today) ? today : (both(stepBack(today)) ? stepBack(today) : null);
  let streak = 0;
  while (cursor && both(cursor)) { streak += 1; cursor = stepBack(cursor); }
  return streak;
}

// ─── GET /api/daily-prayer/today ───────────────────────────────────────────
// The home payload: my prayer for today (+ who's prayed it), and every partner
// thread (their latest prayer, whether I've prayed it, our streak).
router.get("/daily-prayer/today", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const partnerships = await getActivePartnerships(uid);
  if (partnerships.length === 0) { res.json({ status: "none", partners: [], mine: null, canShareToday: true, shareReceipts: [], shouldPromptSendBack: false }); return; }

  const tz = await getUserTz(uid);
  const ymd = todayInTz(tz);
  const [mine] = await db.select().from(dailyPrayersTable).where(and(
    eq(dailyPrayersTable.authorId, uid), eq(dailyPrayersTable.ymd, ymd)));

  // Receipts on my own prayer for today — which partners have prayed it.
  const shareReceipts: Array<{ partner: unknown; counted: boolean; viewedAt: Date | null }> = [];
  const partners: Array<Record<string, unknown>> = [];
  let attendedAny = false;

  // Process every partnership CONCURRENTLY (was a sequential await-loop → ~4
  // round-trips per partner, serialized). The per-partner query chain is
  // unchanged; Promise.all just overlaps them (pool-bounded), so wall-clock is
  // the slowest single chain rather than the sum across partners.
  const partnerResults = await Promise.all(partnerships.map(async (p) => {
    const partnerId = partnerIdOf(p, uid);
    const partner = await loadUserCard(partnerId);
    // Only their DELIVERED prayers (next-morning gate): a prayer they wrote
    // today stays sealed until tomorrow morning, so their "latest" I see is the
    // most recent one whose delivery moment has passed. Legacy rows (NULL) show.
    const [theirLatest] = await db.select().from(dailyPrayersTable)
      .where(and(
        eq(dailyPrayersTable.authorId, partnerId),
        or(isNull(dailyPrayersTable.deliverAfter), lte(dailyPrayersTable.deliverAfter, new Date())),
      ))
      .orderBy(desc(dailyPrayersTable.createdAt)).limit(1);
    const myAtt = theirLatest ? (await db.select().from(prayerAttentionsTable).where(and(
      eq(prayerAttentionsTable.dailyPrayerId, theirLatest.id), eq(prayerAttentionsTable.viewerId, uid))))[0] : undefined;
    const counted = !!myAtt?.countedAt;
    const streak = await computeStreak(uid, partnerId, tz);
    let receipt: { partner: unknown; counted: boolean; viewedAt: Date | null } | null = null;
    if (mine) {
      const partnerAtt = (await db.select().from(prayerAttentionsTable).where(and(
        eq(prayerAttentionsTable.dailyPrayerId, mine.id), eq(prayerAttentionsTable.viewerId, partnerId))))[0];
      receipt = { partner, counted: !!partnerAtt?.countedAt, viewedAt: partnerAtt?.firstViewedAt ?? null };
    }
    return {
      counted,
      entry: {
        partner,
        streak,
        theirLatest: theirLatest ?? null,
        myAttention: { counted, seconds: myAtt?.attentionSeconds ?? 0 },
        // Their newest prayer that I haven't prayed yet → surfaces a "new" dot.
        isNew: !!theirLatest && !counted,
      },
      receipt,
    };
  }));
  for (const r of partnerResults) {
    partners.push(r.entry);
    if (r.counted) attendedAny = true;
    if (r.receipt) shareReceipts.push(r.receipt);
  }
  // Newest / unprayed partners first.
  partners.sort((a, b) => Number(b.isNew) - Number(a.isNew));

  res.json({
    status: "active",
    mine: mine ?? null,
    canShareToday: !mine,
    shareReceipts,
    partners,
    // Once I've prayed at least one partner's prayer and haven't shared today,
    // nudge me to send my prayer for the day back.
    shouldPromptSendBack: attendedAny && !mine,
  });
});

// ─── GET /api/prayer-partners ──────────────────────────────────────────────
// Lightweight list of active partners (for pickers / settings).
router.get("/prayer-partners", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const partnerships = await getActivePartnerships(uid);
  // Load each partner's card concurrently (was a sequential per-partner await).
  const out = await Promise.all(partnerships.map(async (p) => ({
    partnershipId: p.id,
    partner: await loadUserCard(partnerIdOf(p, uid)),
  })));
  res.json(out);
});

// ─── GET /api/prayer-partner/invites ───────────────────────────────────────
router.get("/prayer-partner/invites", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select({
    id: prayerPartnershipsTable.id,
    createdAt: prayerPartnershipsTable.createdAt,
    inviterId: usersTable.id,
    inviterName: usersTable.name,
    inviterAvatarUrl: usersTable.avatarUrl,
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
// Invite someone to be a prayer partner. Multiple partners allowed. If they
// already invited you, this accepts (mutual).
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

  const { lo, hi } = normPair(uid, recipientId);
  const [existing] = await db.select().from(prayerPartnershipsTable).where(and(
    eq(prayerPartnershipsTable.userLoId, lo), eq(prayerPartnershipsTable.userHiId, hi),
  ));

  const [me] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
  const firstName = (me?.name || "Someone").split(/\s+/)[0];

  if (existing && existing.status === "active") { res.status(409).json({ error: "You're already partners." }); return; }
  // Reverse pending invite → mutual accept.
  if (existing && existing.status === "pending" && existing.invitedById === recipientId) {
    const [activated] = await db.update(prayerPartnershipsTable)
      .set({ status: "active", acceptedAt: new Date() })
      .where(eq(prayerPartnershipsTable.id, existing.id)).returning();
    await linkPartnerFellows(uid, recipientId);
    sendPushToUser(recipientId, {
      title: `${firstName} is now your prayer partner`, body: "Share your prayer for the day.",
      path: "/prayer-partner", threadId: "prayer-dialogue",
    }).catch(() => {});
    res.json({ status: "active", partnershipId: activated.id, partner: recipient });
    return;
  }
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
    title: `${firstName} wants to be your prayer partner`, body: "Open Phoebe to accept.",
    path: "/prayer-partner", threadId: "prayer-dialogue",
  }).catch(() => {});
  res.status(201).json({ status: "pending_out", partnershipId, partner: recipient });
});

// ─── Shareable invite LINK (like a group's) ────────────────────────────────
// A personal, reusable link the user can send (iMessage, etc.). Whoever opens
// /prayer-dialogue/join/:token and accepts becomes a prayer partner. The token
// lives on the inviter's user row, minted lazily on first share.

// GET (or lazily create) the caller's invite token. Returns the token + the
// full share URL so the client can drop it straight into the share sheet.
router.post("/prayer-partner/invite-link", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [me] = await db.select({ token: usersTable.prayerPartnerInviteToken })
    .from(usersTable).where(eq(usersTable.id, uid));
  let token = me?.token ?? null;
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
    await db.update(usersTable).set({ prayerPartnerInviteToken: token }).where(eq(usersTable.id, uid));
  }
  const base = process.env.PUBLIC_APP_ORIGIN || "https://withphoebe.app";
  res.json({ token, url: `${base}/prayer-dialogue/join/${token}` });
});

// PUBLIC lookup — the landing page reads this (pre-auth) to show who invited
// you before you accept. Never reveals anything beyond the inviter's card.
router.get("/prayer-partner/invite-link/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{32}$/i.test(token)) { res.status(404).json({ error: "Invalid link" }); return; }
  const [owner] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.prayerPartnerInviteToken, token));
  if (!owner) { res.status(404).json({ error: "Link not found" }); return; }
  const card = await loadUserCard(owner.id);
  // This is a PRE-AUTH endpoint — anyone holding the link hits it without a
  // session. Never expose the inviter's email here; the landing page only needs
  // their name + avatar to show who invited you. (loadUserCard includes email
  // for the authenticated partner-card paths, so strip it just for this one.)
  const inviter = card ? { id: card.id, name: card.name, avatarUrl: card.avatarUrl } : null;
  // viewerIsOwner lets the client show "this is your own link" instead of an
  // accept button when you open your own link.
  const viewerIsOwner = uidOf(req) === owner.id;
  res.json({ inviter, viewerIsOwner });
});

// ACCEPT via link — auth required. Opening the link IS mutual consent, so the
// partnership goes straight to active (no separate pending step). Rate-limited
// like the direct invite.
router.post("/prayer-partner/invite-link/:token/accept", perUserRateLimit("prayer_partner_link_accept", {
  max: 20, windowMs: 60 * 60 * 1000,
  message: "You've joined a lot of dialogues recently. Please try again later.",
}), async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{32}$/i.test(token)) { res.status(404).json({ error: "Invalid link" }); return; }
  const [owner] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.prayerPartnerInviteToken, token));
  if (!owner) { res.status(404).json({ error: "Link not found" }); return; }
  const ownerId = owner.id;
  if (ownerId === uid) { res.status(400).json({ error: "This is your own invite link." }); return; }
  if (await areMuted(uid, ownerId)) { res.status(403).json({ error: "You can't partner with this person." }); return; }

  const { lo, hi } = normPair(uid, ownerId);
  const [existing] = await db.select().from(prayerPartnershipsTable).where(and(
    eq(prayerPartnershipsTable.userLoId, lo), eq(prayerPartnershipsTable.userHiId, hi),
  ));
  let partnershipId: number;
  if (existing && existing.status === "active") {
    partnershipId = existing.id; // already partners → idempotent
  } else if (existing) {
    const [revived] = await db.update(prayerPartnershipsTable)
      .set({ status: "active", invitedById: ownerId, acceptedAt: new Date(), endedAt: null, endedById: null })
      .where(eq(prayerPartnershipsTable.id, existing.id)).returning();
    partnershipId = revived.id;
  } else {
    const [created] = await db.insert(prayerPartnershipsTable)
      .values({ userLoId: lo, userHiId: hi, invitedById: ownerId, status: "active", acceptedAt: new Date() }).returning();
    partnershipId = created.id;
  }
  await linkPartnerFellows(uid, ownerId);
  const [me] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
  sendPushToUser(ownerId, {
    title: `${(me?.name || "Someone").split(/\s+/)[0]} accepted your prayer invite`,
    body: "Share your prayer for the day.", path: "/prayer-partner", threadId: "prayer-dialogue",
  }).catch(() => {});
  res.json({ status: "active", partnershipId, partner: await loadUserCard(ownerId) });
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

  const [activated] = await db.update(prayerPartnershipsTable)
    .set({ status: "active", acceptedAt: new Date() })
    .where(eq(prayerPartnershipsTable.id, id)).returning();
  await linkPartnerFellows(uid, partnerIdOf(activated, uid));

  const [me] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
  sendPushToUser(row.invitedById, {
    title: `${(me?.name || "Someone").split(/\s+/)[0]} is now your prayer partner`,
    body: "Share your prayer for the day.", path: "/prayer-partner", threadId: "prayer-dialogue",
  }).catch(() => {});

  res.json({ status: "active", partnershipId: activated.id, partner: await loadUserCard(partnerIdOf(activated, uid)) });
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
// End the partnership with a specific partner. History is preserved.
router.post("/prayer-partner/end", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = z.object({ partnerUserId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { lo, hi } = normPair(uid, parsed.data.partnerUserId);
  const [row] = await db.select().from(prayerPartnershipsTable).where(and(
    eq(prayerPartnershipsTable.userLoId, lo), eq(prayerPartnershipsTable.userHiId, hi), eq(prayerPartnershipsTable.status, "active"),
  ));
  if (!row) { res.status(404).json({ error: "No active partnership" }); return; }
  await db.update(prayerPartnershipsTable)
    .set({ status: "ended", endedAt: new Date(), endedById: uid })
    .where(eq(prayerPartnershipsTable.id, row.id));
  res.json({ ok: true });
});

// ─── POST /api/prayer-partner/start ────────────────────────────────────────
// Start a Heart to Heart with one specific person and send them a prayer in a
// single tap. Tapping a Fellow is consent enough, so the partnership goes
// straight to active (like opening an invite link). The FIRST prayer of a brand
// new dialogue delivers INSTANTLY (and pushes them now), so the connection feels
// alive immediately; after that the normal next-morning volley cadence applies.
router.post("/prayer-partner/start", perUserRateLimit("prayer_partner_start", {
  max: 30, windowMs: 60 * 60 * 1000, message: "Too many attempts. Please try again later.",
}), async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = z.object({
    partnerUserId: z.number().int().positive(),
    body: z.string().min(1).max(2000),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const partnerId = parsed.data.partnerUserId;
  if (partnerId === uid) { res.status(400).json({ error: "You can't pray with yourself." }); return; }

  const partner = await loadUserCard(partnerId);
  if (!partner) { res.status(404).json({ error: "Person not found" }); return; }
  if (await areMuted(uid, partnerId)) { res.status(403).json({ error: "You can't pray with this person." }); return; }

  // Ensure the partnership is active. New/revived → this is first contact, so
  // the prayer delivers instantly. Already active → ongoing daily cadence.
  const { lo, hi } = normPair(uid, partnerId);
  const [existing] = await db.select().from(prayerPartnershipsTable).where(and(
    eq(prayerPartnershipsTable.userLoId, lo), eq(prayerPartnershipsTable.userHiId, hi)));
  let wasNewlyActive: boolean;
  if (existing && existing.status === "active") {
    wasNewlyActive = false;
  } else if (existing) {
    await db.update(prayerPartnershipsTable)
      .set({ status: "active", invitedById: uid, acceptedAt: new Date(), endedAt: null, endedById: null })
      .where(eq(prayerPartnershipsTable.id, existing.id));
    wasNewlyActive = true;
  } else {
    await db.insert(prayerPartnershipsTable)
      .values({ userLoId: lo, userHiId: hi, invitedById: uid, status: "active", acceptedAt: new Date() });
    wasNewlyActive = true;
  }
  await linkPartnerFellows(uid, partnerId);

  const tz = await getUserTz(uid);
  const ymd = todayInTz(tz);

  // Instant first-contact delivery is only safe when this partner is the user's
  // ONLY active partner. daily_prayers is author-scoped — one row per author per
  // day, with a single deliverAfter shared by every partner — so an instant
  // (null deliverAfter) row would also unseal today's prayer EARLY to any other
  // partners (and the morning sweep would then skip their push). When other
  // partners exist we fall back to the next-morning cadence and tell the client
  // (delivered:false) so the UI can say "they'll receive it tomorrow."
  const activeIds = await getActivePartnerIds(uid);
  const hasOtherPartners = activeIds.some((pid) => pid !== partnerId);

  const [already] = await db.select().from(dailyPrayersTable).where(and(
    eq(dailyPrayersTable.authorId, uid), eq(dailyPrayersTable.ymd, ymd)));
  if (already) {
    // Already shared a prayer today — the partnership is now active, so they'll
    // see it on its normal delivery. Don't create a second one.
    res.status(200).json({ prayer: already, partner, delivered: !already.deliverAfter || already.deliverAfter.getTime() <= Date.now() });
    return;
  }

  // First contact with your only partner delivers now; otherwise next morning.
  const deliverNow = wasNewlyActive && !hasOtherPartners;
  const deliverAfter = deliverNow ? null : nextDeliveryInstant(new Date(), tz);
  let created;
  try {
    [created] = await db.insert(dailyPrayersTable)
      .values({ authorId: uid, ymd, body: parsed.data.body, deliverAfter }).returning();
  } catch {
    const [row] = await db.select().from(dailyPrayersTable).where(and(
      eq(dailyPrayersTable.authorId, uid), eq(dailyPrayersTable.ymd, ymd)));
    res.status(200).json({ prayer: row, partner, delivered: false }); return;
  }

  if (deliverNow) {
    const [me] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
    const firstName = (me?.name || "Someone").split(/\s+/)[0];
    sendPushToUser(partnerId, {
      title: `${firstName} shared a Heart to Heart`, body: "Tap to open and pray it.",
      path: "/prayer-partner", threadId: "prayer-dialogue",
    }).catch(() => {});
  }

  res.status(201).json({ prayer: created, partner, delivered: deliverNow });
});

// ─── POST /api/daily-prayer ────────────────────────────────────────────────
// Share your prayer for the day (one per local day). Notifies every partner.
router.post("/daily-prayer", perUserRateLimit("daily_prayer_share", {
  max: 30, windowMs: 60 * 60 * 1000, message: "Too many attempts. Please try again later.",
}), async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = z.object({ body: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const partnerIds = await getActivePartnerIds(uid);
  if (partnerIds.length === 0) { res.status(409).json({ error: "no_partner", message: "You need a prayer partner first." }); return; }
  const tz = await getUserTz(uid);
  const ymd = todayInTz(tz);

  const [existing] = await db.select().from(dailyPrayersTable).where(and(
    eq(dailyPrayersTable.authorId, uid), eq(dailyPrayersTable.ymd, ymd)));
  if (existing) { res.status(409).json({ error: "already_shared_today", prayer: existing }); return; }

  // Next-morning delivery: the prayer is sealed from partners until the next
  // morning in the author's tz, so they wake up to it. We DON'T push now — the
  // morning sweep (dailyPrayerDelivery) notifies each partner when deliver_after
  // arrives. The author still sees their own prayer immediately.
  const deliverAfter = nextDeliveryInstant(new Date(), tz);

  let created;
  try {
    [created] = await db.insert(dailyPrayersTable)
      .values({ authorId: uid, ymd, body: parsed.data.body, deliverAfter }).returning();
  } catch {
    const [row] = await db.select().from(dailyPrayersTable).where(and(
      eq(dailyPrayersTable.authorId, uid), eq(dailyPrayersTable.ymd, ymd)));
    res.status(409).json({ error: "already_shared_today", prayer: row }); return;
  }

  res.status(201).json(created);
});

// ─── POST /api/daily-prayer/:id/attention ──────────────────────────────────
// Record attention on a partner's prayer. >=3s = it counts (the "prayed"
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
  if (prayer.authorId === uid) { res.status(400).json({ error: "That's your own prayer." }); return; }
  // Only an active partner of the author may attend (and record a receipt).
  if (!(await arePartners(uid, prayer.authorId))) { res.status(403).json({ error: "Forbidden" }); return; }
  // Sealed until its delivery morning — can't pray it before it's delivered.
  if (prayer.deliverAfter && prayer.deliverAfter.getTime() > Date.now()) {
    res.status(409).json({ error: "not_yet_delivered" }); return;
  }

  const [existing] = await db.select().from(prayerAttentionsTable).where(and(
    eq(prayerAttentionsTable.dailyPrayerId, id), eq(prayerAttentionsTable.viewerId, uid)));
  const newSeconds = Math.max(existing?.attentionSeconds ?? 0, seconds);
  const nowCounted = !!existing?.countedAt || newSeconds >= ATTENTION_THRESHOLD_SECONDS;

  const now = new Date();
  await db.insert(prayerAttentionsTable)
    .values({ dailyPrayerId: id, viewerId: uid, firstViewedAt: now, attentionSeconds: newSeconds, countedAt: nowCounted ? now : null, updatedAt: now })
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

// ─── GET /api/prayer-thread/:partnerId ─────────────────────────────────────
// The back-and-forth timeline with one partner — both people's daily prayers,
// each tagged with the other's attention receipt.
router.get("/prayer-thread/:partnerId", async (req, res): Promise<void> => {
  const uid = uidOf(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  const partnerId = parseInt(req.params.partnerId, 10);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await arePartners(uid, partnerId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const partner = await loadUserCard(partnerId);
  const streak = await computeStreak(uid, partnerId, await getUserTz(uid));
  // My prayers always show; the partner's only once delivered (next-morning
  // gate) — so their not-yet-delivered prayer for today stays sealed in the
  // thread until tomorrow morning, just like the home card.
  const prayers = await db.select().from(dailyPrayersTable)
    .where(and(
      inArray(dailyPrayersTable.authorId, [uid, partnerId]),
      or(
        eq(dailyPrayersTable.authorId, uid),
        isNull(dailyPrayersTable.deliverAfter),
        lte(dailyPrayersTable.deliverAfter, new Date()),
      ),
    ))
    .orderBy(desc(dailyPrayersTable.createdAt));
  if (prayers.length === 0) { res.json({ partner, streak, items: [] }); return; }

  const atts = await db.select().from(prayerAttentionsTable)
    .where(and(
      inArray(prayerAttentionsTable.dailyPrayerId, prayers.map((p) => p.id)),
      inArray(prayerAttentionsTable.viewerId, [uid, partnerId]),
    ));
  // Key by (prayerId, viewerId) so we can pick the OTHER person's receipt.
  const attBy = new Map<string, typeof prayerAttentionsTable.$inferSelect>();
  for (const a of atts) attBy.set(`${a.dailyPrayerId}:${a.viewerId}`, a);

  const items = prayers.map((p) => {
    const isMine = p.authorId === uid;
    // For my prayers show the partner's attention; for theirs show mine.
    const att = attBy.get(`${p.id}:${isMine ? partnerId : uid}`);
    return {
      id: p.id, authorId: p.authorId, isMine, body: p.body, ymd: p.ymd, createdAt: p.createdAt,
      attention: att ? { counted: !!att.countedAt, countedAt: att.countedAt, seconds: att.attentionSeconds } : null,
    };
  });
  res.json({ partner, streak, items });
});

export default router;
