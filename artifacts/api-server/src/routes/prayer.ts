import { Router, type IRouter } from "express";
import { eq, desc, inArray, notInArray, and, isNull, or, gt } from "drizzle-orm";
import { db, prayerRequestsTable, prayerWordsTable, prayerRequestAmensTable, usersTable, userMutesTable, groupMembersTable } from "@workspace/db";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { getCorrespondentUserIds } from "../lib/correspondents";

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
async function getGardenUserIds(userId: number): Promise<number[]> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return [];
  const viewerEmail = user.email.toLowerCase();

  // Step 1 — groups the viewer belongs to. Match by userId primarily,
  // fall back to email for legacy rows where user_id was never linked.
  const myMemberships = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(
      sql`(${groupMembersTable.userId} = ${userId} OR LOWER(${groupMembersTable.email}) = ${viewerEmail})
          AND ${groupMembersTable.joinedAt} IS NOT NULL`,
    );
  const myGroupIds = Array.from(new Set(myMemberships.map(r => r.groupId)));

  const groupPeerIds = new Set<number>();
  if (myGroupIds.length > 0) {
    // Every other joined member of every group the viewer is in.
    const peerRows = await db
      .select({
        rowUserId: groupMembersTable.userId,
        emailUserId: usersTable.id,
      })
      .from(groupMembersTable)
      .leftJoin(
        usersTable,
        sql`LOWER(${usersTable.email}) = LOWER(${groupMembersTable.email})`,
      )
      .where(
        sql`${groupMembersTable.groupId} IN (${sql.join(
          myGroupIds.map(id => sql`${id}`),
          sql`, `,
        )})
        AND ${groupMembersTable.joinedAt} IS NOT NULL`,
      );
    for (const row of peerRows) {
      const id = row.rowUserId ?? row.emailUserId;
      if (typeof id === "number" && id !== userId) groupPeerIds.add(id);
    }
  }

  // Step 2 — letter correspondents (mutual exchange). Same rule used
  // for the prayer-feed "correspondent" priority flag. Already scoped
  // to active correspondences with ≥1 letter from each side.
  const correspondentIds = await getCorrespondentUserIds(userId);
  for (const id of correspondentIds) {
    if (id !== userId) groupPeerIds.add(id);
  }

  return Array.from(groupPeerIds);
}

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

  // Hidden admins are invisible community observers. Their prayer
  // requests must not leak to other users through the garden feed
  // (which powers the /prayer-mode slideshow on the home dashboard).
  // User explicitly asked: "do not show up on people in the groups
  // prayer slide shows or elsewhere". Rule: if the owner holds
  // role=hidden_admin in any group, drop their request unless the
  // viewer is the owner themself.
  const hiddenAdminRows = await db
    .select({
      rowUserId: groupMembersTable.userId,
      emailUserId: usersTable.id,
    })
    .from(groupMembersTable)
    .leftJoin(
      usersTable,
      sql`LOWER(${usersTable.email}) = LOWER(${groupMembersTable.email})`,
    )
    .where(eq(groupMembersTable.role, "hidden_admin"));
  const hiddenAdminIds = Array.from(new Set(
    hiddenAdminRows
      .map(r => r.rowUserId ?? r.emailUserId)
      .filter((id): id is number => typeof id === "number" && id !== sessionUserId),
  ));
  console.log(
    `[GET /prayer-requests] viewer=${sessionUserId} gardenIds=[${gardenIds.join(",")}] ` +
    `hiddenAdminRows=${hiddenAdminRows.length} hiddenAdminIds=[${hiddenAdminIds.join(",")}]`,
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
  if (hiddenAdminIds.length > 0) baseFilters.push(notInArray(prayerRequestsTable.ownerId, hiddenAdminIds));
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

    // Amen counts — only surfaced to the owner of the request. We bucket
    // "today" in the viewer's timezone so the number lines up with their
    // lived day. For non-owners we return null to keep the wire small and
    // avoid leaking a signal we don't want to expose.
    let amenCountToday: number | null = null;
    let amenCountTotal: number | null = null;
    if (isOwnRequest) {
      const amens = await db
        .select({ prayedAt: prayerRequestAmensTable.prayedAt })
        .from(prayerRequestAmensTable)
        .where(eq(prayerRequestAmensTable.requestId, r.id));
      amenCountTotal = amens.length;
      amenCountToday = amens.reduce((acc, row) => {
        if (!row.prayedAt) return acc;
        const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(row.prayedAt);
        return ymd === viewerTodayYmd ? acc + 1 : acc;
      }, 0);
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

  res.json(word);
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

  // Amen count per request in a single pass.
  const ids = rows.map(r => r.id);
  const amensByRequest = new Map<number, number>();
  if (ids.length > 0) {
    const amens = await db
      .select({ requestId: prayerRequestAmensTable.requestId })
      .from(prayerRequestAmensTable)
      .where(inArray(prayerRequestAmensTable.requestId, ids));
    for (const a of amens) {
      amensByRequest.set(a.requestId, (amensByRequest.get(a.requestId) ?? 0) + 1);
    }
  }

  res.json({
    requests: rows.map(r => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      amenCount: amensByRequest.get(r.id) ?? 0,
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

  await db.insert(prayerRequestAmensTable).values({
    requestId: id,
    userId: sessionUserId,
  });
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
    .select({ prayedAt: prayerRequestAmensTable.prayedAt })
    .from(prayerRequestAmensTable)
    .where(eq(prayerRequestAmensTable.requestId, id));

  const allTime = amens.length;
  const today = amens.reduce((acc, row) => {
    if (!row.prayedAt) return acc;
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(row.prayedAt);
    return ymd === todayYmd ? acc + 1 : acc;
  }, 0);

  res.json({ today, allTime });
});

export default router;
