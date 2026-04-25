import { Router, type IRouter } from "express";
import { eq, desc, inArray, notInArray, and, isNull, or, gt } from "drizzle-orm";
import { db, prayerRequestsTable, prayerWordsTable, prayerRequestAmensTable, usersTable, userMutesTable, groupMembersTable } from "@workspace/db";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { getCorrespondentUserIds } from "../lib/correspondents";
import { getGardenUserIds } from "../lib/garden";
import { sendPrayerWordPush, sendFirstAmenPush, sendThirdAmenTodayPush, sendGardenPrayerRequestPush } from "../lib/pushSender";

const router: IRouter = Router();

// Garden = the set of people whose prayer requests the viewer can see
// in their feed. Union of:
//   1. Members of every group the viewer is also a member of.
//   2. Active letter correspondents (mutual exchange — both sides
//      have sent at least one letter).
//
// This intentionally does NOT include people who only share a
// practice or an intercession with the viewer. User flagged: "if
// two groups share a practice, we don't want members of the
// opposite group to see the other's prayer requests." Practice-
// based visibility created exactly that leak, so we dropped it.
// getGardenUserIds lives in ../lib/garden.ts now so bellSender + other
// subsystems can reuse the same visibility rules. See that file for
// the garden membership logic (group peers + correspondents, minus
// hidden-admin vetoes).

// GET /api/prayer-requests/:id — single request + words.
// Powers two notification landing pages:
//   1. "X left you a word of comfort" — viewer is the owner.
//   2. "Y is asking for your prayers" — viewer is in Y's garden.
// We allow either case here. Words are only included for the owner —
// other viewers see the request body but not who has commented on it.
router.get("/prayer-requests/by-id/:id", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [r] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }

  const viewerIsOwner = r.ownerId === sessionUserId;
  if (!viewerIsOwner) {
    const garden = await getGardenUserIds(sessionUserId);
    if (!garden.includes(r.ownerId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const [owner] = await db
    .select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(eq(usersTable.id, r.ownerId));

  const wordRows = viewerIsOwner
    ? await db
        .select({
          id: prayerWordsTable.id,
          authorName: prayerWordsTable.authorName,
          authorUserId: prayerWordsTable.authorUserId,
          content: prayerWordsTable.content,
          createdAt: prayerWordsTable.createdAt,
          authorAvatarUrl: usersTable.avatarUrl,
        })
        .from(prayerWordsTable)
        .leftJoin(usersTable, eq(usersTable.id, prayerWordsTable.authorUserId))
        .where(eq(prayerWordsTable.requestId, id))
    : [];

  res.json({
    id: r.id,
    body: r.body,
    ownerId: r.ownerId,
    ownerName: owner?.name ?? null,
    ownerAvatarUrl: owner?.avatarUrl ?? null,
    viewerIsOwner,
    words: wordRows
      .map(w => ({
        id: w.id,
        authorName: w.authorName,
        authorAvatarUrl: w.authorAvatarUrl ?? null,
        content: w.content,
        createdAt: w.createdAt ? w.createdAt.toISOString() : null,
      }))
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
  });
});

// GET /api/prayer-requests — list active prayer requests visible to me (mine + garden)
router.get("/prayer-requests", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const gardenIds = await getGardenUserIds(sessionUserId);
  const visibleOwnerIds = [sessionUserId, ...gardenIds];

  // Fetch muted user IDs so we can exclude their requests
  const mutedRows = await db
    .select({ mutedUserId: userMutesTable.mutedUserId })
    .from(userMutesTable)
    .where(eq(userMutesTable.muterId, sessionUserId));
  const mutedIds = mutedRows.map(r => r.mutedUserId);

  // Fetch current letter correspondent user IDs so we can flag and
  // prioritize their requests. Replaces the previous fellows-pin signal —
  // if you're actively writing letters to someone, their prayer requests
  // surface first in the feed.
  const correspondentIds = new Set(await getCorrespondentUserIds(sessionUserId));

  const now = new Date();

  // The previous global hidden_admin filter is gone — it was
  // over-filtering users who were hidden_admin in ONE community
  // but regular admins/members in OTHERS. Per-group scoping now
  // lives inside getGardenUserIds (above): the garden only
  // includes peers from groups where they're NOT hidden_admin.
  // If the only community we share is one where they're hidden,
  // they don't enter the garden and their prayers don't surface.
  // If we share any community where they're visible, they do.
  console.log(
    `[GET /prayer-requests] viewer=${sessionUserId} gardenIds=[${gardenIds.join(",")}]`,
  );

  // Prayer requests stay visible until the owner explicitly releases,
  // answers, or deletes them. For other viewers, once `expiresAt` has
  // passed and the owner hasn't renewed, the request drops off. The
  // owner themself continues to see it so they can tap "Renew".
  const freshOrMine = or(
    eq(prayerRequestsTable.ownerId, sessionUserId),
    isNull(prayerRequestsTable.expiresAt),
    gt(prayerRequestsTable.expiresAt, new Date()),
  );
  const baseFilters = [
    inArray(prayerRequestsTable.ownerId, visibleOwnerIds),
    isNull(prayerRequestsTable.closedAt),
    freshOrMine,
  ];
  if (mutedIds.length > 0) baseFilters.push(notInArray(prayerRequestsTable.ownerId, mutedIds));
  const requests = await db.select().from(prayerRequestsTable)
    .where(and(...baseFilters))
    .orderBy(desc(prayerRequestsTable.createdAt));
  console.log(
    `[GET /prayer-requests] returning ${requests.length} requests ` +
    `owners=[${requests.map(r => r.ownerId).join(",")}]`,
  );

  // Viewer's timezone — used to scope "today" for their own amen counts so
  // the number in the UI matches the user's local day, not UTC.
  const [viewer] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, sessionUserId));
  const viewerTz = viewer?.timezone || "UTC";
  const viewerTodayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(new Date());

  // Enrich with owner name, words, and per-user flags
  const enriched = await Promise.all(requests.map(async (r) => {
    const [owner] = await db
      .select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(eq(usersTable.id, r.ownerId));
    const words = await db.select({
      authorName: prayerWordsTable.authorName,
      content: prayerWordsTable.content,
      authorUserId: prayerWordsTable.authorUserId,
      createdAt: prayerWordsTable.createdAt,
    }).from(prayerWordsTable).where(eq(prayerWordsTable.requestId, r.id));

    const myWordRow = words.find(w => w.authorUserId === sessionUserId);
    const isOwnRequest = r.ownerId === sessionUserId;

    // Amen counts — only surfaced to the owner of the request. We
    // dedupe per-user per-day: if the same person taps Amen three
    // times in one day that's "1," but the same person praying on
    // two different days is "2." This stops the count from inflating
    // every time someone re-opens the slideshow during the same day.
    // "Day" is bucketed in the viewer (owner)'s timezone so the
    // number lines up with their lived day, even if the prayer-er
    // is in a different tz.
    let amenCountToday: number | null = null;
    let amenCountTotal: number | null = null;
    // Pull all amens once so we can derive both the owner-only counts
    // and the per-viewer "did I amen this today?" flag without two
    // round-trips. The viewer flag drives the slideshow's resume-
    // where-you-left-off behavior + the dashboard "X more prayers"
    // partial-progress card state.
    const amens = await db
      .select({
        prayedAt: prayerRequestAmensTable.prayedAt,
        userId: prayerRequestAmensTable.userId,
      })
      .from(prayerRequestAmensTable)
      .where(eq(prayerRequestAmensTable.requestId, r.id));

    let myAmenedToday = false;
    for (const row of amens) {
      if (row.userId !== sessionUserId) continue;
      if (!row.prayedAt) continue;
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(row.prayedAt);
      if (ymd === viewerTodayYmd) { myAmenedToday = true; break; }
    }

    if (isOwnRequest) {
      const distinctUserDays = new Set<string>();
      const distinctUsersToday = new Set<number>();
      for (const row of amens) {
        if (!row.prayedAt) continue;
        const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(row.prayedAt);
        distinctUserDays.add(`${row.userId}:${ymd}`);
        if (ymd === viewerTodayYmd) distinctUsersToday.add(row.userId);
      }
      amenCountTotal = distinctUserDays.size;
      amenCountToday = distinctUsersToday.size;
    }

    // Freshness flags based on expiresAt (which we no longer hard-filter on)
    let nearingExpiry = false;
    let needsRenewal = false;
    if (isOwnRequest && r.expiresAt) {
      const msUntilExpiry = r.expiresAt.getTime() - now.getTime();
      if (msUntilExpiry <= 0) {
        // Past the 3-day mark — owner can renew
        needsRenewal = true;
      } else if (msUntilExpiry <= 12 * 60 * 60 * 1000) {
        // Within 12 hours of the 3-day mark
        nearingExpiry = true;
      }
    }

    return {
      ...r,
      ownerName: r.isAnonymous ? null : (owner?.name ?? null),
      // Anonymous requests suppress the avatar too — the feed UI
      // renders an initials bubble when avatarUrl is null.
      ownerAvatarUrl: r.isAnonymous ? null : (owner?.avatarUrl ?? null),
      isOwnRequest,
      isCorrespondent: correspondentIds.has(r.ownerId),
      words: words.map(w => ({
        authorName: w.authorName,
        content: w.content,
        // ISO timestamp — the dashboard uses this to detect new words on the
        // viewer's own requests and surface a one-at-a-time popup.
        createdAt: w.createdAt ? w.createdAt.toISOString() : null,
      })),
      myWord: myWordRow?.content ?? null,
      nearingExpiry,
      needsRenewal,
      amenCountToday,
      amenCountTotal,
      // True if THIS viewer (not anyone) has tapped Amen on this
      // request today, in their own timezone. Drives the "skip
      // already-prayed slides" resume + the dashboard partial-
      // progress card state.
      myAmenedToday,
    };
  }));

  // Sort: correspondents' requests first, then by creation date (already ordered)
  enriched.sort((a, b) => {
    if (a.isCorrespondent && !b.isCorrespondent) return -1;
    if (!a.isCorrespondent && b.isCorrespondent) return 1;
    return 0;
  });

  res.json(enriched);
});

// POST /api/prayer-requests — create a request
// Cap: a user can only hold 3 active prayer requests at a time. "Active" =
// not answered, not closed — regardless of whether it has expired (owners
// keep seeing their own expired requests so they can renew them).
const ACTIVE_PRAYER_REQUEST_CAP = 3;

router.post("/prayer-requests", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const schema = z.object({
    body: z.string().min(1).max(1000),
    isAnonymous: z.boolean().optional().default(false),
    durationDays: z.number().int().min(1).max(30).optional().default(3),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const active = await db.select({ id: prayerRequestsTable.id })
    .from(prayerRequestsTable)
    .where(and(
      eq(prayerRequestsTable.ownerId, sessionUserId),
      eq(prayerRequestsTable.isAnswered, false),
      isNull(prayerRequestsTable.closedAt),
    ));
  if (active.length >= ACTIVE_PRAYER_REQUEST_CAP) {
    res.status(409).json({
      error: `You can only hold ${ACTIVE_PRAYER_REQUEST_CAP} active prayer requests at a time. Mark one as answered or release it to share a new one.`,
    });
    return;
  }

  const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, sessionUserId));

  const expiresAt = new Date(Date.now() + parsed.data.durationDays * 24 * 60 * 60 * 1000);

  const [created] = await db.insert(prayerRequestsTable)
    .values({
      ownerId: sessionUserId,
      body: parsed.data.body,
      isAnonymous: parsed.data.isAnonymous,
      createdByName: owner?.name ?? null,
      expiresAt,
    })
    .returning();

  // Notify everyone who would see this request — the owner's garden
  // (group peers + correspondents). Anonymous requests skip the push:
  // surfacing the owner's name in the title would defeat the toggle.
  // Symmetric in the common case; the hidden_admin veto can give a few
  // false positives (we'd push someone who can't actually see the
  // request) but the by-id endpoint will 403 them, so the worst case
  // is an empty page on tap, not a leak.
  if (!parsed.data.isAnonymous && owner?.name) {
    getGardenUserIds(sessionUserId)
      .then((audience) => {
        for (const recipientId of audience) {
          sendGardenPrayerRequestPush(recipientId, {
            prayerRequestId: created.id,
            ownerName: owner.name as string,
          }).catch((err) => {
            console.error(`[prayer-requests] new-request push failed for user=${recipientId}`, err);
          });
        }
      })
      .catch((err) => {
        console.error(`[prayer-requests] failed to compute audience for new request ${created.id}`, err);
      });
  }

  res.status(201).json(created);
});

// POST /api/prayer-requests/:id/word — leave (or update) a word on a request
router.post("/prayer-requests/:id/word", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({ content: z.string().min(1).max(120) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.closedAt) { res.status(400).json({ error: "Request is closed" }); return; }

  const [author] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, sessionUserId));
  const authorName = author?.name ?? "Someone";

  const [existing] = await db.select().from(prayerWordsTable)
    .where(and(eq(prayerWordsTable.requestId, id), eq(prayerWordsTable.authorUserId, sessionUserId)));

  let word;
  const isNewWord = !existing;
  if (existing) {
    [word] = await db.update(prayerWordsTable)
      .set({ content: parsed.data.content })
      .where(eq(prayerWordsTable.id, existing.id))
      .returning();
  } else {
    [word] = await db.insert(prayerWordsTable)
      .values({
        requestId: id,
        authorUserId: sessionUserId,
        authorName,
        content: parsed.data.content,
      })
      .returning();
  }

  // Push the request owner — "{authorName} raised you in prayer."
  // Only on the first time this user leaves a word on this request
  // (edits don't re-notify; we don't want a spammy "X said something"
  // every time they polish their phrasing). Also suppress self-words
  // in the rare case the owner writes on their own request.
  if (isNewWord && request.ownerId !== sessionUserId) {
    sendPrayerWordPush(request.ownerId, {
      authorUserId: sessionUserId,
      authorName,
      prayerRequestId: id,
    }).catch((err) => {
      console.warn("[prayer/word] push dispatch failed:", err);
    });
  }

  res.json(word);
});

// DELETE /api/prayer-requests/:id/word — remove the caller's word on a
// request. Used by the "x" affordance on the "Your word" card; lets a
// user retract a word of comfort they're no longer comfortable with
// (typo, second thoughts, accidentally tapped send, etc.). Scoped to
// the caller's own row so one user can't delete another's word.
router.delete("/prayer-requests/:id/word", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(prayerWordsTable).where(and(
    eq(prayerWordsTable.requestId, id),
    eq(prayerWordsTable.authorUserId, sessionUserId),
  ));

  // Idempotent — deleting a word that doesn't exist is a no-op success.
  res.json({ ok: true });
});

// PATCH /api/prayer-requests/:id — edit the body text (owner only).
// Pilot feature: the detail modal lets the owner tap "Edit" and revise
// the prayer. Words already left on the request are preserved. Body
// must be non-empty and under 1000 chars to match the create cap.
router.patch("/prayer-requests/:id", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({ body: z.string().min(1).max(1000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (request.closedAt) { res.status(400).json({ error: "Closed requests can't be edited" }); return; }

  const [updated] = await db.update(prayerRequestsTable)
    .set({ body: parsed.data.body.trim() })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// PATCH /api/prayer-requests/:id/answer — mark as answered (owner only)
router.patch("/prayer-requests/:id/answer", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(prayerRequestsTable)
    .set({ isAnswered: true, answeredAt: new Date(), closedAt: new Date(), closeReason: "answered" })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// PATCH /api/prayer-requests/:id/renew — renew expiry by 3 days (owner only)
router.patch("/prayer-requests/:id/renew", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const newExpiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const [updated] = await db.update(prayerRequestsTable)
    .set({ expiresAt: newExpiry })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// GET /api/prayer-requests/released-unread — requests the owner hasn't
// been shown the "released" popup for yet. Returns body + amen count per
// request. Used by the /prayer-list page to show a closing card the first
// time the owner visits after expiresAt passes. The popup is considered
// shown only after PATCH /acknowledge-release below stamps the row.
router.get("/prayer-requests/released-unread", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select({
    id: prayerRequestsTable.id,
    body: prayerRequestsTable.body,
    createdAt: prayerRequestsTable.createdAt,
    expiresAt: prayerRequestsTable.expiresAt,
  })
    .from(prayerRequestsTable)
    .where(and(
      eq(prayerRequestsTable.ownerId, sessionUserId),
      // Expired naturally (past expiresAt) and owner hasn't already
      // closed it via the "release" button (closedAt NULL).
      isNull(prayerRequestsTable.closedAt),
      isNull(prayerRequestsTable.releasePopupSeenAt),
      sql`${prayerRequestsTable.expiresAt} IS NOT NULL AND ${prayerRequestsTable.expiresAt} < now()`,
    ));

  // Amen count per request — same dedupe rule as the GET /prayer-requests
  // path: distinct (userId, local-day) pairs. Released-popup count
  // bucketed in the owner's timezone since they're the only ones who
  // see this number.
  const [viewerForReleased] = await db.select({ timezone: usersTable.timezone })
    .from(usersTable).where(eq(usersTable.id, sessionUserId));
  const releasedTz = viewerForReleased?.timezone || "UTC";
  const ids = rows.map(r => r.id);
  const amensByRequest = new Map<number, Set<string>>();
  if (ids.length > 0) {
    const amens = await db
      .select({
        requestId: prayerRequestAmensTable.requestId,
        userId: prayerRequestAmensTable.userId,
        prayedAt: prayerRequestAmensTable.prayedAt,
      })
      .from(prayerRequestAmensTable)
      .where(inArray(prayerRequestAmensTable.requestId, ids));
    for (const a of amens) {
      if (!a.prayedAt) continue;
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: releasedTz }).format(a.prayedAt);
      const key = `${a.userId}:${ymd}`;
      let set = amensByRequest.get(a.requestId);
      if (!set) { set = new Set(); amensByRequest.set(a.requestId, set); }
      set.add(key);
    }
  }

  res.json({
    requests: rows.map(r => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      amenCount: amensByRequest.get(r.id)?.size ?? 0,
    })),
  });
});

// PATCH /api/prayer-requests/:id/acknowledge-release — owner dismisses
// the "your request has been released" popup. Stamps releasePopupSeenAt
// AND sets closedAt so the request doesn't keep appearing in other
// owner-facing lists.
router.patch("/prayer-requests/:id/acknowledge-release", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const now = new Date();
  await db.update(prayerRequestsTable)
    .set({
      releasePopupSeenAt: now,
      closedAt: request.closedAt ?? now,
      closeReason: request.closeReason ?? "released",
    })
    .where(eq(prayerRequestsTable.id, id));
  res.json({ ok: true });
});

// PATCH /api/prayer-requests/:id/release — release/close a request (owner only)
router.patch("/prayer-requests/:id/release", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(prayerRequestsTable)
    .set({ closedAt: new Date(), closeReason: "released" })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// DELETE /api/prayer-requests/:id — hard delete (owner only)
router.delete("/prayer-requests/:id", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  res.sendStatus(204);
});

// POST /api/prayer-requests/:id/amen — log an "Amen" tap. Unbounded: every
// tap is its own row so we can tell "today" vs "all time" apart. Recording
// the owner's own amen on their own request feels self-congratulatory, so
// owners are a no-op. Any member of the app may record amens on anyone
// else's request (the list endpoint already filters what they see).
router.post("/prayer-requests/:id/amen", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.closedAt) { res.status(400).json({ error: "Request is closed" }); return; }
  // Owners used to be a no-op here ("feels self-congratulatory"), but
  // that silently broke the community metrics dashboard — when an admin
  // was the only person touching the community, every amen was dropped
  // and the tiles stayed at zero. Every tap now records; the UI still
  // gets to decide whether to surface the author's own amen count.

  // Push gating — TWO signals fire from the amen path, both gated to
  // avoid the "12-person circle becomes a notification storm during
  // morning prayer" failure mode the previous all-amens push had:
  //
  //   1. First-ever amen on the request → "Your community is praying
  //      for you." The moment the owner's ask stops being theirs alone.
  //   2. Third distinct (user, today-in-owner-tz) amen on the request →
  //      "3 people are praying for you today." Once per request per day.
  //
  // We pull all prior amens for this request before the insert so we
  // can distinguish "first ever" from "user is back later in the day"
  // and compute today's distinct-user count without a race.
  const isOwnerSelfAmen = request.ownerId === sessionUserId;

  let firstAmenFire = false;
  let thirdTodayFire = false;
  let ownerLocalYmd = "";

  if (!isOwnerSelfAmen) {
    const [owner] = await db.select({ timezone: usersTable.timezone })
      .from(usersTable).where(eq(usersTable.id, request.ownerId));
    const ownerTz = owner?.timezone || "UTC";
    ownerLocalYmd = new Intl.DateTimeFormat("en-CA", { timeZone: ownerTz }).format(new Date());

    const prior = await db.select({
      userId: prayerRequestAmensTable.userId,
      prayedAt: prayerRequestAmensTable.prayedAt,
    })
      .from(prayerRequestAmensTable)
      .where(eq(prayerRequestAmensTable.requestId, id));

    firstAmenFire = prior.length === 0;

    // Distinct users who already amened today (in owner's tz) BEFORE
    // this insert. If this insert adds a NEW user-day pair AND the
    // pre-count was exactly 2, we just hit 3 → fire.
    const distinctTodayBefore = new Set<number>();
    let sessionAlreadyToday = false;
    for (const r of prior) {
      if (!r.prayedAt) continue;
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: ownerTz }).format(r.prayedAt);
      if (ymd !== ownerLocalYmd) continue;
      distinctTodayBefore.add(r.userId);
      if (r.userId === sessionUserId) sessionAlreadyToday = true;
    }
    thirdTodayFire = !sessionAlreadyToday && distinctTodayBefore.size === 2;
  }

  await db.insert(prayerRequestAmensTable).values({
    requestId: id,
    userId: sessionUserId,
  });

  if (firstAmenFire) {
    sendFirstAmenPush(request.ownerId, { prayerRequestId: id }).catch((err) => {
      console.warn("[prayer/amen] first-amen push failed:", err);
    });
  }
  if (thirdTodayFire) {
    sendThirdAmenTodayPush(request.ownerId, {
      prayerRequestId: id,
      localYmd: ownerLocalYmd,
    }).catch((err) => {
      console.warn("[prayer/amen] third-amen push failed:", err);
    });
  }

  res.json({ ok: true });
});

// GET /api/prayer-requests/:id/amens — owner-only count of how many amens
// their request has received, split by today (in the owner's timezone) and
// all-time. Used by the popover in the prayer list when the owner taps the
// 🙏🏽 badge on their own row. Non-owners get 403 to preserve the "no
// count leaks" invariant.
router.get("/prayer-requests/:id/amens", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [owner] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, sessionUserId));
  const tz = owner?.timezone || "UTC";
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const amens = await db
    .select({
      prayedAt: prayerRequestAmensTable.prayedAt,
      userId: prayerRequestAmensTable.userId,
    })
    .from(prayerRequestAmensTable)
    .where(eq(prayerRequestAmensTable.requestId, id));

  // Same dedupe as GET /prayer-requests: distinct (userId, local-day)
  // pairs, owner's tz. Re-tapping during the same day no longer
  // inflates the count.
  const distinctUserDays = new Set<string>();
  const distinctUsersToday = new Set<number>();
  for (const row of amens) {
    if (!row.prayedAt) continue;
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(row.prayedAt);
    distinctUserDays.add(`${row.userId}:${ymd}`);
    if (ymd === todayYmd) distinctUsersToday.add(row.userId);
  }

  res.json({ today: distinctUsersToday.size, allTime: distinctUserDays.size });
});

export default router;
