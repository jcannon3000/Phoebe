import { Router, type IRouter } from "express";
import { eq, desc, inArray, notInArray, and, isNull, or, gt } from "drizzle-orm";
import { db, prayerRequestsTable, prayerWordsTable, prayerRequestAmensTable, prayerHeldNotificationsTable, usersTable, userMutesTable, groupMembersTable } from "@workspace/db";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { getCorrespondentUserIds } from "../lib/correspondents";
import { getGardenUserIds } from "../lib/garden";
import { sendPrayerWordPush, sendFirstAmenPush, sendNewPrayerRequestPush } from "../lib/pushSender";
import { logger } from "../lib/logger";

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

// GET /api/prayer-requests/:id — single request + words + amens.
// Powers three notification landing pages:
//   1. "X left you a word of comfort" — viewer is the owner.
//   2. "Y is asking for your prayers" — viewer is in Y's garden.
//   3. "The first amen just went up for your request" — viewer is
//      the owner; the page surfaces who said amen, the running
//      amen count, and every word people have left so far.
//
// Amens + words are only attached for the owner. Other viewers see
// the request body alone — Phoebe deliberately hides who else is
// praying for someone else's request from third parties.
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

  // Owner-only: surface who has prayed and how many times. We collapse
  // multiple taps from the same person on the same calendar day into a
  // single "amen" — same dedupe rule as the prayer-list feed counts —
  // so the number on this page lines up with what the owner sees on
  // their feed card. We surface the FULL deduped list (one row per
  // person-day, ordered most recent first) so the owner can see who
  // showed up and when. The most recent row is what the first-amen
  // push is celebrating.
  let amenCountTotal = 0;
  let amens: Array<{
    userId: number;
    userName: string | null;
    userAvatarUrl: string | null;
    prayedAt: string;
  }> = [];
  if (viewerIsOwner) {
    const rawAmens = await db
      .select({
        userId: prayerRequestAmensTable.userId,
        prayedAt: prayerRequestAmensTable.prayedAt,
        userName: usersTable.name,
        userAvatarUrl: usersTable.avatarUrl,
      })
      .from(prayerRequestAmensTable)
      .leftJoin(usersTable, eq(usersTable.id, prayerRequestAmensTable.userId))
      .where(eq(prayerRequestAmensTable.requestId, id))
      .orderBy(desc(prayerRequestAmensTable.prayedAt));

    // Bucket by (user, calendar-day) using the OWNER's timezone (which
    // is `sessionUserId` here since viewerIsOwner). Falls back to UTC
    // if no tz is set on the owner row — same fallback the feed uses.
    const [ownerTzRow] = await db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    const ownerTz = ownerTzRow?.timezone || "UTC";
    const ymdInOwnerTz = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: ownerTz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

    // Counts and the avatar list both bucket by (user, day-in-owner-tz):
    // one prayer per person per day. New writes are gated to 1/day at
    // the POST route, but this dedupe also protects against legacy
    // rows from the old 7/day cap inflating the visible total.
    const seenUser = new Set<number>();
    const userDayKeys = new Set<string>();
    for (const a of rawAmens) {
      const ymd = ymdInOwnerTz(a.prayedAt);
      userDayKeys.add(`${a.userId}|${ymd}`);
      if (seenUser.has(a.userId)) continue;
      seenUser.add(a.userId);
      amens.push({
        userId: a.userId,
        userName: a.userName ?? null,
        userAvatarUrl: a.userAvatarUrl ?? null,
        prayedAt: a.prayedAt.toISOString(),
      });
    }
    amenCountTotal = userDayKeys.size;
  }

  // Viewer-side bits the deep-link page needs to behave like the
  // slideshow request slide: their own word (if any) and whether
  // they've already amened today.
  let myWord: string | null = null;
  let myAmenedToday = false;
  if (!viewerIsOwner) {
    const [w] = await db
      .select({ content: prayerWordsTable.content })
      .from(prayerWordsTable)
      .where(and(
        eq(prayerWordsTable.requestId, id),
        eq(prayerWordsTable.authorUserId, sessionUserId),
      ))
      .limit(1);
    myWord = w?.content ?? null;
    // Was there an amen by THIS viewer that lands on today's calendar
    // date in the OWNER's tz? Same dedupe rule the count uses.
    const myAmens = await db
      .select({ prayedAt: prayerRequestAmensTable.prayedAt })
      .from(prayerRequestAmensTable)
      .where(and(
        eq(prayerRequestAmensTable.requestId, id),
        eq(prayerRequestAmensTable.userId, sessionUserId),
      ))
      .orderBy(desc(prayerRequestAmensTable.prayedAt))
      .limit(1);
    if (myAmens.length > 0) {
      const [ownerTzRow] = await db
        .select({ timezone: usersTable.timezone })
        .from(usersTable)
        .where(eq(usersTable.id, r.ownerId));
      const ownerTz = ownerTzRow?.timezone || "UTC";
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: ownerTz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const lastDay = new Intl.DateTimeFormat("en-CA", { timeZone: ownerTz, year: "numeric", month: "2-digit", day: "2-digit" }).format(myAmens[0].prayedAt);
      myAmenedToday = today === lastDay;
    }
  }

  res.json({
    id: r.id,
    body: r.body,
    // Author's framing — drives the small pill next to the eyebrow.
    // Mirrors the field on the prayer-mode slideshow's request slide
    // so the deep-link page renders the same chip.
    kind: r.kind ?? "request",
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
    amens,
    amenCountTotal,
    myWord,
    myAmenedToday,
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
    // Parish-scoped "pastoral concerns" are private to the requester
    // + parish admin and must not appear in the garden / slideshow.
    // We allow the owner to keep seeing their own (they can revisit /
    // edit on the parish dashboard), but for everyone else this hides
    // them.
    or(
      isNull(prayerRequestsTable.parishFeedId),
      eq(prayerRequestsTable.ownerId, sessionUserId),
    ),
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
    const allWords = await db.select({
      authorName: prayerWordsTable.authorName,
      content: prayerWordsTable.content,
      authorUserId: prayerWordsTable.authorUserId,
      createdAt: prayerWordsTable.createdAt,
      isPrivate: prayerWordsTable.isPrivate,
    }).from(prayerWordsTable).where(eq(prayerWordsTable.requestId, r.id));

    const isOwnRequest = r.ownerId === sessionUserId;
    // Privacy filter: a private word is visible only to the request
    // owner and to its own author. Public words are visible to anyone
    // who can see the request.
    const words = allWords.filter(w =>
      !w.isPrivate || isOwnRequest || w.authorUserId === sessionUserId,
    );

    const myWordRow = allWords.find(w => w.authorUserId === sessionUserId);

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
    let myAmenedEver = false;
    for (const row of amens) {
      if (row.userId !== sessionUserId) continue;
      if (!row.prayedAt) continue;
      myAmenedEver = true;
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(row.prayedAt);
      if (ymd === viewerTodayYmd) { myAmenedToday = true; }
      if (myAmenedToday && myAmenedEver) break;
    }

    if (isOwnRequest) {
      // Counts are bucketed by (user, day-in-viewer-tz): one prayer
      // per person per day, no matter how many rows that person has
      // in the table. New writes are gated to 1/day at the POST
      // route, but this dedupe also protects against legacy rows
      // from the old 7/day cap inflating the visible total.
      const totalUserDays = new Set<string>();
      const todayUsers = new Set<number>();
      for (const row of amens) {
        if (!row.prayedAt) continue;
        const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(row.prayedAt);
        totalUserDays.add(`${row.userId}|${ymd}`);
        if (ymd === viewerTodayYmd) todayUsers.add(row.userId);
      }
      amenCountTotal = totalUserDays.size;
      amenCountToday = todayUsers.size;
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
      // True if THIS viewer has *ever* tapped Amen on this request
      // (any day). Drives the dashboard's "X new prayers" subtitle
      // and red dot — once you've engaged with a request once, it's
      // not "new" to you anymore even after midnight rolls over.
      myAmenedEver,
    };
  }));

  // Order: pure chronological (createdAt-desc), already established
  // by the SQL query above. We deliberately do NOT re-tier by
  // ownership or correspondent status — the user wants the list to
  // read like a feed, not a triaged inbox. The `isCorrespondent`
  // and `isOwnRequest` flags are still attached to every row so the
  // client can decorate cards with a correspondent badge or "Your
  // request" label without that decoration affecting position.

  res.json(enriched);
});

// POST /api/prayer-requests — create a request
// Cap: a user can only hold 3 active prayer requests at a time. "Active" =
// not answered, not closed — regardless of whether it has expired (owners
// keep seeing their own expired requests so they can renew them).
const ACTIVE_PRAYER_REQUEST_CAP = 3;

router.post("/prayer-requests", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    logger.warn({
      ua: req.headers["user-agent"],
      hasBody: req.body != null,
    }, "[prayer-requests:post] rejected — no session");
    res.status(401).json({ error: "Please sign in again — your session has expired." });
    return;
  }

  const schema = z.object({
    body: z.string().min(1).max(1000),
    isAnonymous: z.boolean().optional().default(false),
    // Older iOS bundles (pre-3.3) might omit durationDays or send strings;
    // schema stays permissive — any missing/invalid value falls back to
    // the 7-day default rather than 400ing the submission.
    durationDays: z.number().int().min(1).max(30).optional().default(7),
    // Author's framing at submission. Drives the optional pill on cards /
    // slideshow. Default "request" renders no pill. Older iOS bundles
    // don't send this; defaults to "request" so they're never rejected.
    // Community intercessions are not prayer requests — they live in
    // shared_moments via /moment/new?template=intercession, so they
    // never reach this endpoint.
    kind: z.enum(["request", "life-event", "justice"]).optional().default("request"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({
      ua: req.headers["user-agent"],
      userId: sessionUserId,
      err: parsed.error.flatten(),
      body: req.body,
    }, "[prayer-requests:post] rejected — schema mismatch");
    res.status(400).json({ error: "Please share a non-empty prayer request." });
    return;
  }

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
      kind: parsed.data.kind,
      expiresAt,
    })
    .returning();

  // Fan out a "{owner} is asking for your prayers" push to every
  // member of the requester's garden. Re-enabled per user direction
  // — the request appearing in the slideshow / prayer list isn't
  // enough; people need the lock-screen prompt to actually carry
  // each other in real time. Fired async so the HTTP response
  // doesn't wait on APNs / web-push round-trips.
  (async () => {
    try {
      const gardenIds = await getGardenUserIds(sessionUserId);
      const recipients = gardenIds.filter((id) => id !== sessionUserId);
      if (recipients.length === 0) return;
      const authorName = owner?.name ?? "Someone";
      await Promise.all(
        recipients.map((rid) =>
          sendNewPrayerRequestPush(rid, {
            authorName,
            isAnonymous: parsed.data.isAnonymous,
            prayerRequestId: created.id,
          }).catch((err) =>
            console.warn("[prayer] new-prayer-request push failed:", err)
          )
        )
      );
    } catch (err) {
      console.warn("[prayer] new-prayer-request fan-out failed:", err);
    }
  })();

  res.status(201).json(created);
});

// POST /api/prayer-requests/:id/word — leave (or update) a word on a request
router.post("/prayer-requests/:id/word", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({
    content: z.string().min(1).max(120),
    // Author chooses visibility at submit time. `true` → only the
    // request owner + the author can see it. `false` (default →
    // legacy behavior) → anyone who can see the request sees it.
    isPrivate: z.boolean().optional().default(false),
  });
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
      .set({ content: parsed.data.content, isPrivate: parsed.data.isPrivate })
      .where(eq(prayerWordsTable.id, existing.id))
      .returning();
  } else {
    [word] = await db.insert(prayerWordsTable)
      .values({
        requestId: id,
        authorUserId: sessionUserId,
        authorName,
        content: parsed.data.content,
        isPrivate: parsed.data.isPrivate,
      })
      .returning();
  }

  // Push the owner on every word submission, not just the first — the
  // owner wants to feel each act of prayer, not just the initial ping.
  // Self-words still suppressed (the rare case where the owner writes
  // on their own request).
  if (request.ownerId !== sessionUserId) {
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

  // 7-day renewal — matches the default duration on a fresh request
  // and keeps the renew/new flows consistent. Also clear closedAt so
  // a renewal of a previously-released request truly reopens it.
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [updated] = await db.update(prayerRequestsTable)
    .set({ expiresAt: newExpiry, closedAt: null, releasePopupSeenAt: null, renewalNudgeSentAt: null })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// GET /api/prayer-requests/last-mine — the user's most recently created
// prayer request, regardless of state (active / expired / closed). Used
// by the new-request prompts (FAB → /pray-request/new and the in-
// slideshow "ask-request" slide) to surface a "renew this instead?"
// card when the user starts typing a fresh ask, so the previous one
// they actually carry doesn't get silently abandoned. Returns 200 with
// `{ request: null }` if the user has never made a prayer request.
router.get("/prayer-requests/last-mine", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db.select({
    id: prayerRequestsTable.id,
    body: prayerRequestsTable.body,
    createdAt: prayerRequestsTable.createdAt,
    expiresAt: prayerRequestsTable.expiresAt,
    closedAt: prayerRequestsTable.closedAt,
    isAnswered: prayerRequestsTable.isAnswered,
    kind: prayerRequestsTable.kind,
  })
    .from(prayerRequestsTable)
    .where(eq(prayerRequestsTable.ownerId, sessionUserId))
    .orderBy(desc(prayerRequestsTable.createdAt))
    .limit(1);

  if (!row) { res.json({ request: null }); return; }

  const now = Date.now();
  const expired = !!row.expiresAt && row.expiresAt.getTime() < now;
  const isActive = !row.closedAt && !row.isAnswered && !expired;

  res.json({
    request: {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      isAnswered: !!row.isAnswered,
      kind: row.kind ?? null,
      isActive,
      isExpired: expired && !row.closedAt,
    },
  });
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

// POST /api/prayer-requests/:id/amen — log an "Amen" tap. Throttled
// per (user, request, day-in-owner-tz): the user gets at most one
// recorded amen per request per calendar day. A second tap that day
// returns `{ ok: true, throttled: true }` without recording — the
// client UI keeps its optimistic feedback (the tap is acknowledged)
// but no duplicate row contributes to counts or notifications. The
// previous 2-hour-gap + 7/day model inflated visible amen counts;
// users wanted "X people prayed for me today" to mean X *people*,
// not X taps.
//
// Recording the owner's own amen on their own request feels self-
// congratulatory, so owners are a no-op. Any other member may record
// amens on someone else's request (the list endpoint already filters
// what they see).
const AMEN_DAILY_CAP = 1;
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
  // Lifted to outer scope so the held-in-prayer upsert downstream can
  // skip Day 0 of a request (the immediate first-amen push already
  // covers that day, so we don't queue a second batched push). True
  // means "today is the very first day this request has been amened."
  let firstEverAmenWasToday = false;

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

    // Throttle: skip the insert if this user has already logged an
    // amen on this request today (in the owner's tz). One amen per
    // person per request per day — the client's optimistic UI is
    // unaffected; the row just doesn't contribute to counts or
    // notifications.
    let myAmensToday = 0;
    for (const r of prior) {
      if (r.userId !== sessionUserId || !r.prayedAt) continue;
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: ownerTz }).format(r.prayedAt);
      if (ymd === ownerLocalYmd) myAmensToday += 1;
    }
    if (myAmensToday >= AMEN_DAILY_CAP) {
      res.json({ ok: true, throttled: true, reason: "daily-cap" });
      return;
    }

    firstAmenFire = prior.length === 0;

    // Distinct users who already amened today (in owner's tz) BEFORE
    // this insert. If this insert adds a NEW user-day pair AND the
    // pre-count was exactly 2, we just hit 3 → fire.
    const distinctTodayBefore = new Set<number>();
    let sessionAlreadyToday = false;
    for (const r of prior) {
      if (!r.prayedAt) continue;
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: ownerTz }).format(r.prayedAt);
      if (ymd === ownerLocalYmd) {
        distinctTodayBefore.add(r.userId);
        if (r.userId === sessionUserId) sessionAlreadyToday = true;
      }
    }
    // Day-one silence: if the very first amen this request ever
    // received happened today, the owner already got the
    // first-amen "Sarah is praying for you" push and we don't want
    // to double-tap them with "3 people are praying" the same day.
    // Day two and on, when older amens exist, the third-today push
    // fires as a fresh celebration of the day's care.
    const earliestPrior = prior.reduce<Date | null>((acc, r) => {
      if (!r.prayedAt) return acc;
      if (!acc || r.prayedAt < acc) return r.prayedAt;
      return acc;
    }, null);
    if (earliestPrior) {
      const earliestYmd = new Intl.DateTimeFormat("en-CA", { timeZone: ownerTz }).format(earliestPrior);
      firstEverAmenWasToday = earliestYmd === ownerLocalYmd;
    } else {
      // No prior amens → this insert IS the first-ever, which is today.
      firstEverAmenWasToday = true;
    }
    thirdTodayFire = !firstEverAmenWasToday && !sessionAlreadyToday && distinctTodayBefore.size === 2;
    logger.info({
      requestId: id,
      ownerId: request.ownerId,
      ownerTz,
      ownerLocalYmd,
      priorCount: prior.length,
      distinctTodayBefore: distinctTodayBefore.size,
      sessionAlreadyToday,
      firstEverAmenWasToday,
      thirdTodayFire,
    }, "[prayer/amen] third-today check");
  }

  await db.insert(prayerRequestAmensTable).values({
    requestId: id,
    userId: sessionUserId,
  });

  // Daily "you've been held in prayer today" coalesced push — upsert
  // into prayer_held_notifications. First non-owner amen of the day
  // creates a row; subsequent amens within the 2h window bump
  // amen_count (but only if sent_at is still null — once today's push
  // has fired, further amens stop mutating it). The scanner picks up
  // pending rows ≥2h old and sends one combined push per recipient.
  //
  // Day 0 is intentionally skipped: when today is the FIRST day the
  // request has ever received an amen, the immediate "first amen"
  // push already lands ("The first amen just went up for your
  // request by Sara") with the same "held in prayer" framing — a
  // second batched push the same day would be a double-tap. The
  // daily batched cadence kicks in on day 1 and beyond.
  if (!isOwnerSelfAmen && ownerLocalYmd && !firstEverAmenWasToday) {
    try {
      await db
        .insert(prayerHeldNotificationsTable)
        .values({
          requestId: id,
          recipientId: request.ownerId,
          dayKey: ownerLocalYmd,
          firstAmenAt: new Date(),
          firstAmenUserId: sessionUserId,
          amenCount: 1,
        })
        .onConflictDoUpdate({
          target: [prayerHeldNotificationsTable.requestId, prayerHeldNotificationsTable.dayKey],
          set: { amenCount: sql`${prayerHeldNotificationsTable.amenCount} + 1` },
          where: isNull(prayerHeldNotificationsTable.sentAt),
        });
    } catch (err) {
      logger.warn({ err, requestId: id }, "[prayer/amen] held-in-prayer upsert failed");
    }
  }

  if (firstAmenFire) {
    const [prayer] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, sessionUserId));
    sendFirstAmenPush(request.ownerId, {
      prayerRequestId: id,
      prayerName: prayer?.name || "Someone",
    }).catch((err) => {
      console.warn("[prayer/amen] first-amen push failed:", err);
    });
  }
  // "3 people are praying for you today" push — disabled per user
  // direction. The owner can still see their amen counts inside
  // /prayer-requests/:id and /prayer-list; the lock-screen nudge
  // was felt as noise. Leaving the `thirdTodayFire` calculation in
  // place above so re-enabling later is a one-line change.
  void thirdTodayFire;

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

// GET /api/me/parish-weekly — beta experiment.
// People in the viewer's parish groups who have an active prayer
// request, split into "I haven't prayed for them this week" vs "I
// have." Drives the new weekly home card + slideshow scope.
//
// Always returns a response (no beta gate on the server) so the
// client can branch entirely on its own beta flag. Calling for a
// non-beta user just costs one round trip of cheap queries.
router.get("/me/parish-weekly", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { getParishWeekly } = await import("../lib/parishWeekly");
    const result = await getParishWeekly(sessionUserId);
    res.json(result);
  } catch (err) {
    console.error("[/me/parish-weekly] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
