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
import { db, walkPairingsTable, walkNudgesTable, fellowsTable, fellowPrefsTable, usersTable, betaUsersTable, userMutesTable, dailyPrayersTable, prayerAttentionsTable, type WalkPairing } from "@workspace/db";
import { z } from "zod/v4";
import { sendPushToUser } from "../lib/pushSender";
import { perUserRateLimit } from "../lib/rate-limit";
import { getWalkProgressForToday } from "../lib/walkProgress";
import { normalizePair } from "../lib/walkPairing";
import { FELLOWS_ENABLED } from "../lib/fellowsFlag";

const router: IRouter = Router();

// Fellows (and Walking Together with it) is turned off. Enforce it at the SERVER
// so a peer's today-only rhythm dots can't be fetched by hand while the feature
// is off — not just hidden in the UI. Every /walk route short-circuits here.
router.use((_req, res, next) => {
  if (!FELLOWS_ENABLED) { res.status(403).json({ error: "Walking together is turned off." }); return; }
  next();
});

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
// How long a freshly-accepted walk keeps showing progress unconditionally — a
// grace week to let the relationship take root before the heart-to-heart gate
// kicks in. After this, progress is only visible if the two have actually prayed
// 1:1 recently (see recentHeartToHeartSet).
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const HEART_TO_HEART_DAYS = 7;

// Of `ids`, which have exchanged a 1:1 "Heart to Heart" prayer with me in the
// last week — i.e. one of us actually PRAYED (counted attention) the other's
// daily prayer. One query. Drives the post-grace progress gate.
async function recentHeartToHeartSet(me: number, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await db.execute<{ other: number }>(sql`
    SELECT CASE WHEN pa.viewer_id = ${me} THEN dp.author_id ELSE pa.viewer_id END AS other
    FROM prayer_attentions pa
    JOIN daily_prayers dp ON dp.id = pa.daily_prayer_id
    WHERE pa.counted_at IS NOT NULL
      AND pa.counted_at > NOW() - INTERVAL '7 days'
      AND (
        (pa.viewer_id = ${me} AND dp.author_id IN (${sql.join(ids, sql`, `)}))
        OR (dp.author_id = ${me} AND pa.viewer_id IN (${sql.join(ids, sql`, `)}))
      )
  `);
  return new Set(rows.rows.map((r) => Number(r.other)));
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

// ─── GET /api/walk — every fellow is inherently a walking companion ──────────
// No invite/accept: being fellows IS walking together. We lazily keep an active
// pairing row per fellow (the backing record for nudges + a stable id) and gate
// each one's progress on the relationship: visible in the first week of the
// FELLOWSHIP, then only after a 1:1 Heart to Heart in the last week.
router.get("/walk", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;

  // My fellows + when each bond formed (drives the grace window).
  const fellowRows = await db.select({ fid: fellowsTable.fellowUserId, since: fellowsTable.createdAt })
    .from(fellowsTable).where(eq(fellowsTable.userId, me));
  const fellowSince = new Map<number, Date | null>();
  for (const r of fellowRows) if (r.fid !== me) fellowSince.set(r.fid, r.since ?? null);
  const fellowIds = Array.from(fellowSince.keys());
  if (fellowIds.length === 0) { res.json({ companions: [], incoming: [], outgoing: [], paused: [], eligibleFellows: [] }); return; }

  // Ensure an ACTIVE pairing per fellow (create missing, re-activate any old
  // paused/ended/pending ones — walking together is inherent, not opt-in).
  const existing = await db.select().from(walkPairingsTable).where(or(
    eq(walkPairingsTable.userLoId, me), eq(walkPairingsTable.userHiId, me),
  ));
  const existingPartners = new Set(existing.map((p) => partnerOf(p, me)));
  const toCreate = fellowIds.filter((id) => !existingPartners.has(id));
  if (toCreate.length > 0) {
    await db.insert(walkPairingsTable).values(
      toCreate.map((id) => { const { lo, hi } = normalizePair(me, id); return { userLoId: lo, userHiId: hi, invitedById: me, status: "active", acceptedAt: new Date() }; }),
    ).onConflictDoNothing();
  }
  for (const p of existing) {
    if (fellowSince.has(partnerOf(p, me)) && p.status !== "active") {
      await db.update(walkPairingsTable)
        .set({ status: "active", acceptedAt: p.acceptedAt ?? new Date(), pausedById: null, endedAt: null, endedById: null })
        .where(eq(walkPairingsTable.id, p.id));
    }
  }
  // Reload so every fellow has a pairing id.
  const allPairs = await db.select({ id: walkPairingsTable.id, lo: walkPairingsTable.userLoId, hi: walkPairingsTable.userHiId })
    .from(walkPairingsTable).where(or(eq(walkPairingsTable.userLoId, me), eq(walkPairingsTable.userHiId, me)));
  const pairIdByPartner = new Map<number, number>();
  for (const p of allPairs) pairIdByPartner.set(p.lo === me ? p.hi : p.lo, p.id);

  const people = await peopleByIds(fellowIds);

  // Phone-sabbath: which fellows are resting today (a weekday they chose), in
  // THEIR timezone — so a quiet rest day shows as "on a sabbath", not "behind".
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const restRows = await db.select({ id: usersTable.id, tz: usersTable.timezone, restDays: usersTable.restDays })
    .from(usersTable).where(inArray(usersTable.id, fellowIds));
  const sabbathToday = new Set<number>();
  for (const r of restRows) {
    const days = Array.isArray(r.restDays) ? r.restDays : [];
    if (days.length === 0) continue;
    const wd = WEEKDAYS.indexOf(new Date().toLocaleDateString("en-US", { timeZone: r.tz || "UTC", weekday: "short" }));
    if (days.includes(wd)) sabbathToday.add(r.id);
  }

  // Grace (first week of the FELLOWSHIP) → progress always shown; after that,
  // only with a recent Heart to Heart.
  const nowMs = Date.now();
  const needHeart = fellowIds.filter((id) => { const s = fellowSince.get(id); return !(s && nowMs - new Date(s).getTime() < GRACE_MS); });
  const heartSet = await recentHeartToHeartSet(me, needHeart);

  // Per-fellow "share daily progress" choice (FellowSettingsSheet): a fellow who
  // turned it OFF toward me hides their own dots from me, even mid-grace or after
  // a Heart to Heart. Default (no row) = shared, so this only ever subtracts.
  const progressOffRows = await db.select({ ownerId: fellowPrefsTable.ownerId })
    .from(fellowPrefsTable)
    .where(and(
      inArray(fellowPrefsTable.ownerId, fellowIds),
      eq(fellowPrefsTable.fellowUserId, me),
      eq(fellowPrefsTable.shareProgress, false),
    ));
  const progressHiddenFromMe = new Set(progressOffRows.map((r) => r.ownerId));

  const companions = (await Promise.all(fellowIds.map(async (pid) => {
    const person = people.get(pid);
    const pairId = pairIdByPartner.get(pid);
    if (!person || !pairId) return null;
    const s = fellowSince.get(pid);
    const inGrace = !!s && nowMs - new Date(s).getTime() < GRACE_MS;
    const canSeeProgress = (inGrace || heartSet.has(pid)) && !progressHiddenFromMe.has(pid);
    const progress = canSeeProgress ? await getWalkProgressForToday(pid) : null;
    const [lastFromThem] = await db.select({ kind: walkNudgesTable.kind, createdAt: walkNudgesTable.createdAt })
      .from(walkNudgesTable)
      .where(and(eq(walkNudgesTable.fromUserId, pid), eq(walkNudgesTable.toUserId, me)))
      .orderBy(sql`${walkNudgesTable.createdAt} DESC`).limit(1);
    return {
      pairId, userId: pid, name: person.name, avatarUrl: person.avatarUrl,
      intention: null as string | null, since: s,
      // progress is null when locked — still your companion, but you need a recent
      // 1:1 prayer to see today's dots again.
      progress, progressLocked: !canSeeProgress,
      // True when today is one of their chosen phone-sabbath days — the UI shows
      // a calm "on a sabbath" state instead of "behind".
      sabbath: sabbathToday.has(pid),
      lastNudge: lastFromThem ? { kind: lastFromThem.kind, at: lastFromThem.createdAt } : null,
    };
  }))).filter((x): x is NonNullable<typeof x> => x !== null);

  // No invite/accept flow — every fellow is already walking with you.
  res.json({ companions, incoming: [], outgoing: [], paused: [], eligibleFellows: [] });
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

// ─── POST /api/walk/reached-three ────────────────────────────────────────────
// When you've kept at least THREE of today's practices, give your fellows a
// gentle ping — so they can send a 🙌 (the encourage button unlocks at three)
// and take it as a nudge toward their own rhythm. Once per person per day; the
// client fires it as you cross the third dot. Deduped in-memory per process
// (the client also guards once/day/device, so duplicates are rare).
const reachedThreePinged = new Map<number, string>(); // userId → ymd already pinged
router.post("/walk/reached-three", perUserRateLimit("walk_reached_three", { max: 10, windowMs: 60 * 60 * 1000 }), requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const [u] = await db.select({ tz: usersTable.timezone, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, me));
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: u?.tz || "UTC" }).format(new Date());
  if (reachedThreePinged.get(me) === ymd) { res.json({ ok: true, alreadySent: true }); return; }
  reachedThreePinged.set(me, ymd);
  const first = (u?.name || "Someone").split(/\s+/)[0];
  // The viewer's fellows — each an active walking companion.
  const fellowRows = await db.select({ fid: fellowsTable.fellowUserId }).from(fellowsTable).where(eq(fellowsTable.userId, me));
  const fellowIds = [...new Set(fellowRows.map((r) => r.fid).filter((id) => id !== me))];
  void Promise.all(fellowIds.map((fid) =>
    sendPushToUser(fid, {
      title: `${first} has kept 3 today 🌿`,
      body: `Send ${first} a 🙌 — and a few minutes for your own rhythm.`,
      path: "/people", threadId: "walk-reached-three", data: { type: "walk-reached-three" },
    }).catch(() => undefined),
  ));
  res.json({ ok: true });
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
