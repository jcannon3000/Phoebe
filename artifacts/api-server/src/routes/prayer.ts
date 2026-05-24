import { Router, type IRouter } from "express";
import { eq, desc, inArray, notInArray, and, isNull, isNotNull, or, gt, lt } from "drizzle-orm";
import { db, prayerRequestsTable, prayerWordsTable, prayerRequestAmensTable, prayerHeldNotificationsTable, usersTable, userMutesTable, groupMembersTable, anonymousAmensTable, fellowsTable, prayerRequestTagsTable, prayerFeedSubscriptionsTable } from "@workspace/db";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { getCorrespondentUserIds } from "../lib/correspondents";
import { getGardenUserIds } from "../lib/garden";
import { sendPrayerWordPush, sendFirstAmenPush, sendNewPrayerRequestPush } from "../lib/pushSender";
import { logger } from "../lib/logger";
import { isParishOnlyUser } from "../lib/parishGate";

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
  // Tag-based visibility: a viewer who was tagged in this request
  // can see it regardless of garden membership. Drives the
  // "praying for my friend Matthew" flow where the tagged user
  // gets a notification + can read the request even if they're not
  // in any shared community with the owner.
  const taggedRow = await db
    .select({ id: prayerRequestTagsTable.id })
    .from(prayerRequestTagsTable)
    .where(and(
      eq(prayerRequestTagsTable.requestId, id),
      eq(prayerRequestTagsTable.taggedUserId, sessionUserId),
      isNull(prayerRequestTagsTable.removedAt),
    ));
  const viewerIsTagged = taggedRow.length > 0;
  if (!viewerIsOwner && !viewerIsTagged) {
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

  // Fetch active tags so the detail page can render the "Tagged"
  // row beneath the body + drive the per-viewer "I'm tagged" pill.
  const tagRows = await db
    .select({
      id: prayerRequestTagsTable.id,
      userId: prayerRequestTagsTable.taggedUserId,
      userName: usersTable.name,
      userAvatarUrl: usersTable.avatarUrl,
    })
    .from(prayerRequestTagsTable)
    .leftJoin(usersTable, eq(usersTable.id, prayerRequestTagsTable.taggedUserId))
    .where(and(
      eq(prayerRequestTagsTable.requestId, id),
      isNull(prayerRequestTagsTable.removedAt),
    ));

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
    viewerIsTagged,
    // Tagged users — rendered in a "Tagged" row beneath the body.
    // Empty array when nobody was tagged. Visible to everyone with
    // access to the request (owner / tagged users / garden viewers)
    // since the tag itself is the visibility signal — once you can
    // see the request, you know who else was named.
    tags: tagRows.map(t => ({
      id: t.userId,
      name: t.userName ?? null,
      avatarUrl: t.userAvatarUrl ?? null,
    })),
    // Owner-only share token. Surfaces the /p/:token public-share
    // link on the detail page so the requester can hand it out.
    // Only sent on the owner's view of the row; non-owners get
    // null (the share button hides itself anyway since it's gated
    // on viewerIsOwner client-side).
    shareToken: viewerIsOwner ? r.shareToken ?? null : null,
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

  // Requests the viewer has been TAGGED in by someone else. Tag is
  // a per-request visibility grant — the viewer sees that specific
  // request regardless of garden / community membership. We pull
  // ids only and OR them into the visibility WHERE clause below so
  // the SQL stays a single query.
  const taggedInRows = await db
    .select({ requestId: prayerRequestTagsTable.requestId })
    .from(prayerRequestTagsTable)
    .where(and(
      eq(prayerRequestTagsTable.taggedUserId, sessionUserId),
      isNull(prayerRequestTagsTable.removedAt),
    ));
  const taggedInIds = taggedInRows.map(r => r.requestId);

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
  // Visibility = (owner is in my garden) OR (I'm tagged in this
  // specific request). Wrapped in `or()` so either signal grants
  // access without breaking the existing garden-based filtering.
  const visibilityFilter = taggedInIds.length > 0
    ? or(
        inArray(prayerRequestsTable.ownerId, visibleOwnerIds),
        inArray(prayerRequestsTable.id, taggedInIds),
      )!
    : inArray(prayerRequestsTable.ownerId, visibleOwnerIds);
  const baseFilters = [
    visibilityFilter,
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
    // Distinct people who have prayed this request (any day). Drives
    // the "Prayed by N people" line on the prayer-list — a person who
    // prays on three different days counts once here (vs amenCountTotal
    // which is per-user-per-day).
    let amenPeopleCount: number | null = null;
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
      const distinctUsers = new Set<number>();
      for (const row of amens) {
        if (!row.prayedAt) continue;
        const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(row.prayedAt);
        totalUserDays.add(`${row.userId}|${ymd}`);
        distinctUsers.add(row.userId);
        if (ymd === viewerTodayYmd) todayUsers.add(row.userId);
      }
      amenCountTotal = totalUserDays.size;
      amenCountToday = todayUsers.size;
      amenPeopleCount = distinctUsers.size;
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
      amenPeopleCount,
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

// GET /api/prayer-requests/mine/past — the viewer's OWN past requests:
// answered, released/closed, or expired (ran their 3-day cycle without
// renewal). Powers the faded "Past" backlog at the bottom of the Prayer
// List so a request doesn't simply vanish when its window closes — it
// joins the user's standing record of what they've carried. Strictly
// owner-scoped; we never expose anyone else's closed requests here.
//
// Path is two segments (`mine/past`) so it never collides with the
// single-segment `/prayer-requests/:id` route.
router.get("/prayer-requests/mine/past", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now = new Date();
  const rows = await db.select().from(prayerRequestsTable)
    .where(and(
      eq(prayerRequestsTable.ownerId, sessionUserId),
      // Past = closed (released/answered set closedAt) OR explicitly
      // answered OR expired past its window.
      or(
        isNotNull(prayerRequestsTable.closedAt),
        eq(prayerRequestsTable.isAnswered, true),
        and(
          isNotNull(prayerRequestsTable.expiresAt),
          lt(prayerRequestsTable.expiresAt, now),
        )!,
      )!,
    ))
    .orderBy(desc(prayerRequestsTable.createdAt));

  const [owner] = await db
    .select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(eq(usersTable.id, sessionUserId));

  const enriched = await Promise.all(rows.map(async (r) => {
    // Distinct people who prayed it — drives the "Prayed by N people"
    // line, which is a quietly lovely thing to keep on an answered
    // prayer. One round-trip per row is fine: a user's past list is
    // small and this endpoint isn't on a hot path.
    const amens = await db
      .select({ userId: prayerRequestAmensTable.userId })
      .from(prayerRequestAmensTable)
      .where(eq(prayerRequestAmensTable.requestId, r.id));
    const amenPeopleCount = new Set(amens.map((a) => a.userId)).size;

    const endedRaw = r.closedAt ?? r.expiresAt ?? r.createdAt;
    return {
      // Shape matches the client's PrayerRequest type so the same
      // RequestCard renders these (with isPast). Words aren't surfaced
      // on the faded card, so we send an empty array rather than pay
      // for the per-row word fetch.
      id: r.id,
      body: r.body,
      ownerId: r.ownerId,
      ownerName: r.isAnonymous ? null : (owner?.name ?? null),
      ownerAvatarUrl: r.isAnonymous ? null : (owner?.avatarUrl ?? null),
      isOwnRequest: true,
      isAnswered: !!r.isAnswered,
      isAnonymous: !!r.isAnonymous,
      closedAt: r.closedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      nearingExpiry: false,
      // These are renewable from the detail page; flag as needing
      // renewal so any shared "past" affordance reads consistently.
      needsRenewal: true,
      words: [] as Array<{ authorName: string; content: string; createdAt?: string | null }>,
      myWord: null,
      createdAt: r.createdAt.toISOString(),
      amenPeopleCount,
      kind: r.kind ?? null,
      // Extra fields (not on every active row) for ordering / future use.
      endedAt: endedRaw ? new Date(endedRaw).toISOString() : null,
      closeReason: r.closeReason ?? null,
    };
  }));

  // Most-recently-ended first so the freshest history reads at the top.
  enriched.sort((a, b) => {
    const ax = a.endedAt ? Date.parse(a.endedAt) : 0;
    const bx = b.endedAt ? Date.parse(b.endedAt) : 0;
    return bx - ax;
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
  if (!sessionUserId) {
    logger.warn({
      ua: req.headers["user-agent"],
      hasBody: req.body != null,
    }, "[prayer-requests:post] rejected — no session");
    res.status(401).json({ error: "Please sign in again — your session has expired." });
    return;
  }

  // Parish-only users (Phoebe Parish tier — no community memberships,
  // no beta access) don't get the garden-visible prayer-request flow.
  // The UI hides the compose surface from them; this gate is the
  // server-side enforcement so a hand-crafted POST can't bypass it.
  // Pastoral concerns (private to the parish admin) go through
  // /api/parish/concerns instead.
  if (await isParishOnlyUser(sessionUserId)) {
    res.status(403).json({
      error: "Prayer requests aren't available on the parish tier. Share a pastoral concern with your parish admin instead.",
    });
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
    // Tagged Phoebe users — the owner explicitly named these people
    // in the request ("praying for my friend Matthew"). They get
    // visibility regardless of garden membership and receive a push
    // on creation + on first amen + on words of comfort. Empty /
    // missing array = no one tagged; the rest of the flow behaves
    // exactly like a normal request.
    taggedUserIds: z.array(z.number().int().positive()).optional().default([]),
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

  // Every new request gets a public share token at creation time.
  // The /p/:token public page reads through this slug; without one,
  // the owner can't share. 96 bits of entropy (24 hex chars) keeps
  // brute-forcing the namespace infeasible. Per-row uniqueness is
  // enforced by the partial UNIQUE index in migrate.ts.
  const shareToken = crypto.randomBytes(12).toString("hex");

  const [created] = await db.insert(prayerRequestsTable)
    .values({
      ownerId: sessionUserId,
      body: parsed.data.body,
      isAnonymous: parsed.data.isAnonymous,
      createdByName: owner?.name ?? null,
      kind: parsed.data.kind,
      expiresAt,
      shareToken,
    })
    .returning();

  // Insert tag rows for each user explicitly named in the request.
  // Filter out the owner themselves (no-op tag) and dedupe. The
  // taggedUserIds array was validated by zod above; we still verify
  // each id exists in users before INSERT to avoid orphan tags from
  // a hand-crafted client. Best-effort — a tag insertion failure
  // shouldn't unwind the just-created request.
  const validTaggedIds: number[] = [];
  if (parsed.data.taggedUserIds.length > 0) {
    const wantedIds = Array.from(new Set(parsed.data.taggedUserIds.filter(id => id !== sessionUserId)));
    if (wantedIds.length > 0) {
      try {
        const existing = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(inArray(usersTable.id, wantedIds));
        const existingSet = new Set(existing.map(u => u.id));
        for (const id of wantedIds) if (existingSet.has(id)) validTaggedIds.push(id);
        if (validTaggedIds.length > 0) {
          await db
            .insert(prayerRequestTagsTable)
            .values(validTaggedIds.map(uid => ({
              requestId: created.id,
              taggedUserId: uid,
              createdByUserId: sessionUserId,
            })))
            .onConflictDoNothing();
        }
      } catch (err) {
        console.warn("[prayer] tag insert failed (non-fatal):", err);
      }
    }
  }

  // Fan out a "{owner} is asking for your prayers" push to every
  // member of the requester's garden. Re-enabled per user direction
  // — the request appearing in the slideshow / prayer list isn't
  // enough; people need the lock-screen prompt to actually carry
  // each other in real time. Fired async so the HTTP response
  // doesn't wait on APNs / web-push round-trips.
  //
  // We exclude any recipient who has MUTED the author. The
  // GET /api/prayer-requests filter already drops muted authors from
  // the list (line 261); without this matching filter on the fan-out
  // path, the muter still gets a lock-screen ping for a request they
  // can't see in-app, which reads as a bug rather than a mute.
  (async () => {
    try {
      const gardenIds = await getGardenUserIds(sessionUserId);
      // Union garden + tagged users so a tagged person who isn't in
      // any shared community still gets the "asking for your
      // prayers" push. Self-tag was already filtered out above when
      // we built validTaggedIds, but we also skip the author here
      // (gardenIds includes them by design — they're the center of
      // their own garden — and we don't want them to push themselves).
      const recipients = Array.from(new Set([
        ...gardenIds.filter((id) => id !== sessionUserId),
        ...validTaggedIds,
      ]));
      if (recipients.length === 0) return;
      // Drop anyone who has muted the author. userMutes(muter=R, muted=A)
      // → R does not receive A's pushes. Single SELECT, cheap.
      const muteRows = await db
        .select({ muterId: userMutesTable.muterId })
        .from(userMutesTable)
        .where(eq(userMutesTable.mutedUserId, sessionUserId));
      const mutersOfAuthor = new Set(muteRows.map(r => r.muterId));
      const unmutedRecipients = recipients.filter(rid => !mutersOfAuthor.has(rid));
      if (unmutedRecipients.length === 0) return;
      const authorName = owner?.name ?? "Someone";
      await Promise.all(
        unmutedRecipients.map((rid) =>
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

// ── Tag CRUD ──────────────────────────────────────────────────────
//
// Owner-only: POST /api/prayer-requests/:id/tags { userIds: number[] }
// Adds the listed Phoebe users as tags. Idempotent — already-tagged
// users are skipped via the UNIQUE constraint. A previously-removed
// user (removed_at set) gets their row revived by lifting removed_at
// back to NULL.
//
// DELETE /api/prayer-requests/:id/tags/:userId — owner OR the tagged
// user themselves can remove. Soft-delete via removed_at so the audit
// row persists; the visibility join filters them out via the partial
// indexes on (removed_at IS NULL).
router.post("/prayer-requests/:id/tags", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [r] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  if (r.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Only the prayer-request owner can tag people." });
    return;
  }

  const schema = z.object({ userIds: z.array(z.number().int().positive()).min(1).max(50) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "bad_request" }); return; }
  const userIds = Array.from(new Set(parsed.data.userIds.filter(uid => uid !== sessionUserId)));

  if (userIds.length === 0) { res.json({ ok: true, tags: [] }); return; }

  try {
    // Verify each id exists. Drop unknown ids silently — the
    // caller can detect missing entries by diffing the returned
    // tag list against what they sent.
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));
    const validIds = existing.map(u => u.id);
    if (validIds.length === 0) { res.json({ ok: true, tags: [] }); return; }

    await db
      .insert(prayerRequestTagsTable)
      .values(validIds.map(uid => ({
        requestId: id,
        taggedUserId: uid,
        createdByUserId: sessionUserId,
      })))
      .onConflictDoUpdate({
        target: [prayerRequestTagsTable.requestId, prayerRequestTagsTable.taggedUserId],
        // Re-tag of a previously-removed user lifts removed_at back
        // to NULL. createdByUserId stays whatever it was originally
        // (or the new value if the row didn't exist — ON CONFLICT
        // here only fires on a real conflict).
        set: { removedAt: null },
      });

    // Push notification to each newly-tagged user (best-effort).
    // We use the same "asking for your prayers" push the create
    // fan-out uses so the tagged user lands on the same lock-screen
    // copy — the request IS now visible to them.
    (async () => {
      try {
        const muteRows = await db
          .select({ muterId: userMutesTable.muterId })
          .from(userMutesTable)
          .where(eq(userMutesTable.mutedUserId, sessionUserId));
        const muters = new Set(muteRows.map(m => m.muterId));
        const authorName = r.createdByName ?? "Someone";
        await Promise.all(validIds.filter(uid => !muters.has(uid)).map(uid =>
          sendNewPrayerRequestPush(uid, {
            authorName,
            isAnonymous: r.isAnonymous,
            prayerRequestId: r.id,
          }).catch(err => console.warn("[prayer] tag-push failed:", err))
        ));
      } catch (err) {
        console.warn("[prayer] tag-push fan-out failed:", err);
      }
    })();

    const tagsAfter = await db
      .select({
        id: prayerRequestTagsTable.taggedUserId,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(prayerRequestTagsTable)
      .leftJoin(usersTable, eq(usersTable.id, prayerRequestTagsTable.taggedUserId))
      .where(and(
        eq(prayerRequestTagsTable.requestId, id),
        isNull(prayerRequestTagsTable.removedAt),
      ));
    res.json({ ok: true, tags: tagsAfter });
  } catch (err) {
    console.error("[prayer-requests/tags POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/prayer-requests/:id/tags/:userId", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid id" }); return;
  }

  const [r] = await db.select({ ownerId: prayerRequestsTable.ownerId })
    .from(prayerRequestsTable)
    .where(eq(prayerRequestsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  // Allowed: owner of the request, OR the tagged user removing
  // themselves. Anyone else (including a non-tagged garden viewer)
  // can't manipulate someone else's tag.
  if (r.ownerId !== sessionUserId && userId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    await db
      .update(prayerRequestTagsTable)
      .set({ removedAt: new Date() })
      .where(and(
        eq(prayerRequestTagsTable.requestId, id),
        eq(prayerRequestTagsTable.taggedUserId, userId),
        isNull(prayerRequestTagsTable.removedAt),
      ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[prayer-requests/tags DELETE] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
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
  // on their own request). Also fan out to every active tagged user
  // so they feel each word of comfort coming in for the person they
  // were asked to pray for. The author themselves is excluded
  // (suppresses a self-push if a tagged user writes their own word).
  if (request.ownerId !== sessionUserId) {
    sendPrayerWordPush(request.ownerId, {
      authorUserId: sessionUserId,
      authorName,
      prayerRequestId: id,
    }).catch((err) => {
      console.warn("[prayer/word] push dispatch failed:", err);
    });
  }
  (async () => {
    try {
      const taggedRows = await db
        .select({ uid: prayerRequestTagsTable.taggedUserId })
        .from(prayerRequestTagsTable)
        .where(and(
          eq(prayerRequestTagsTable.requestId, id),
          isNull(prayerRequestTagsTable.removedAt),
        ));
      const taggedIds = taggedRows
        .map(t => t.uid)
        .filter(uid => uid !== sessionUserId && uid !== request.ownerId);
      await Promise.all(taggedIds.map(uid =>
        sendPrayerWordPush(uid, {
          authorUserId: sessionUserId,
          authorName,
          prayerRequestId: id,
        }).catch(err => console.warn("[prayer/word] tagged push failed:", err))
      ));
    } catch (err) {
      console.warn("[prayer/word] tagged fan-out failed:", err);
    }
  })();

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
  //
  // Recipients are the owner PLUS every active tagged user (skipping
  // the pray-er themselves so a self-amen never schedules a push for
  // the amener). Each row uses the recipient's own timezone for the
  // dayKey so "today" lines up with their lived day, not the owner's.
  if (!isOwnerSelfAmen && ownerLocalYmd && !firstEverAmenWasToday) {
    try {
      // Owner row (existing behaviour).
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
          target: [prayerHeldNotificationsTable.requestId, prayerHeldNotificationsTable.recipientId, prayerHeldNotificationsTable.dayKey],
          set: { amenCount: sql`${prayerHeldNotificationsTable.amenCount} + 1` },
          where: isNull(prayerHeldNotificationsTable.sentAt),
        });

      // Tagged-user rows. Look up each tagged user's tz so the
      // dayKey is in their own local day. Skip the pray-er
      // themselves (self-amen suppression) + the owner (already
      // handled above; a tag on yourself is filtered at insert
      // time but we belt-and-suspender here).
      const taggedRows = await db
        .select({
          uid: prayerRequestTagsTable.taggedUserId,
          tz: usersTable.timezone,
        })
        .from(prayerRequestTagsTable)
        .leftJoin(usersTable, eq(usersTable.id, prayerRequestTagsTable.taggedUserId))
        .where(and(
          eq(prayerRequestTagsTable.requestId, id),
          isNull(prayerRequestTagsTable.removedAt),
        ));
      const eligibleTags = taggedRows.filter(t =>
        t.uid !== sessionUserId && t.uid !== request.ownerId,
      );
      for (const t of eligibleTags) {
        const tz = t.tz || "UTC";
        const taggedYmd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
        await db
          .insert(prayerHeldNotificationsTable)
          .values({
            requestId: id,
            recipientId: t.uid,
            dayKey: taggedYmd,
            firstAmenAt: new Date(),
            firstAmenUserId: sessionUserId,
            amenCount: 1,
          })
          .onConflictDoUpdate({
            target: [prayerHeldNotificationsTable.requestId, prayerHeldNotificationsTable.recipientId, prayerHeldNotificationsTable.dayKey],
            set: { amenCount: sql`${prayerHeldNotificationsTable.amenCount} + 1` },
            where: isNull(prayerHeldNotificationsTable.sentAt),
          });
      }
    } catch (err) {
      logger.warn({ err, requestId: id }, "[prayer/amen] held-in-prayer upsert failed");
    }
  }

  if (firstAmenFire) {
    const [prayer] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, sessionUserId));
    const prayerName = prayer?.name || "Someone";
    sendFirstAmenPush(request.ownerId, {
      prayerRequestId: id,
      prayerName,
    }).catch((err) => {
      console.warn("[prayer/amen] first-amen push failed:", err);
    });
    // Fan out the first-amen push to active tagged users too —
    // they get to share in the moment when the first prayer
    // lands for the person they were named alongside. Owner +
    // the pray-er themselves are excluded (owner already got
    // their push above; pray-er would self-push otherwise).
    (async () => {
      try {
        const taggedRows = await db
          .select({ uid: prayerRequestTagsTable.taggedUserId })
          .from(prayerRequestTagsTable)
          .where(and(
            eq(prayerRequestTagsTable.requestId, id),
            isNull(prayerRequestTagsTable.removedAt),
          ));
        const taggedIds = taggedRows
          .map(t => t.uid)
          .filter(uid => uid !== request.ownerId && uid !== sessionUserId);
        await Promise.all(taggedIds.map(uid =>
          sendFirstAmenPush(uid, {
            prayerRequestId: id,
            prayerName,
          }).catch(err => console.warn("[prayer/amen] tagged first-amen push failed:", err))
        ));
      } catch (err) {
        console.warn("[prayer/amen] tagged first-amen fan-out failed:", err);
      }
    })();
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
// request, plus community intercessions and feed intercessions, split
// into "I haven't prayed this week" vs "I have." Drives the new
// weekly home card + slideshow scope.
//
// Always returns a response (no beta gate on the server) so the
// client can branch entirely on its own beta flag.
//
// We mirror /api/moments' pre-reconcile step so the parish-weekly
// view stays in sync with what /prayer-list, /prayer-mode (default),
// and the community detail page see. Without the reconcile a freshly-
// joined member would see feed/group intercessions in parish-weekly
// at different times than on those other surfaces.
router.get("/me/parish-weekly", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [
      { getParishWeekly },
      { reconcileGroupPracticeMembers, reconcileFeedPracticeMembers },
    ] = await Promise.all([
      import("../lib/parishWeekly"),
      import("./groups"),
    ]);
    // Pre-reconcile every group + feed practice the viewer touches so
    // their moment_user_tokens row exists before we read it. Mirrors
    // the start of GET /api/moments.
    try {
      const { db, sharedMomentsTable, prayerFeedSubscriptionsTable, momentGroupsTable } = await import("@workspace/db");
      const { eq: dEq, inArray: dInArray, sql: dSql, and: dAnd } = await import("drizzle-orm");
      const myGroupRows = await db
        .select({ groupId: groupMembersTable.groupId })
        .from(groupMembersTable)
        .where(dEq(groupMembersTable.userId, sessionUserId));
      const myGroupIds = [...new Set(myGroupRows.map(r => r.groupId))];
      const practiceIds = new Set<number>();
      if (myGroupIds.length > 0) {
        const primary = await db
          .select({ id: sharedMomentsTable.id })
          .from(sharedMomentsTable)
          .where(dAnd(
            dInArray(sharedMomentsTable.groupId, myGroupIds),
            dSql`${sharedMomentsTable.state} != 'archived'`,
          ));
        for (const r of primary) practiceIds.add(r.id);
        const secondary = await db
          .select({ id: sharedMomentsTable.id })
          .from(sharedMomentsTable)
          .innerJoin(momentGroupsTable, dEq(momentGroupsTable.momentId, sharedMomentsTable.id))
          .where(dAnd(
            dInArray(momentGroupsTable.groupId, myGroupIds),
            dSql`${sharedMomentsTable.state} != 'archived'`,
          ));
        for (const r of secondary) practiceIds.add(r.id);
      }
      const myFeedRows = await db
        .select({ feedId: prayerFeedSubscriptionsTable.feedId })
        .from(prayerFeedSubscriptionsTable)
        .where(dEq(prayerFeedSubscriptionsTable.userId, sessionUserId));
      const myFeedIds = [...new Set(myFeedRows.map(r => r.feedId))];
      const feedPracticeIds = new Set<number>();
      if (myFeedIds.length > 0) {
        const fp = await db
          .select({ id: sharedMomentsTable.id })
          .from(sharedMomentsTable)
          .where(dAnd(
            dInArray(sharedMomentsTable.prayerFeedId, myFeedIds),
            dSql`${sharedMomentsTable.state} != 'archived'`,
          ));
        for (const r of fp) feedPracticeIds.add(r.id);
      }
      await Promise.all([
        ...Array.from(practiceIds).map(id => reconcileGroupPracticeMembers(id)),
        ...Array.from(feedPracticeIds).map(id => reconcileFeedPracticeMembers(id)),
      ]);
    } catch (err) {
      console.warn("[/me/parish-weekly] pre-reconcile failed:", err);
    }
    const result = await getParishWeekly(sessionUserId);
    res.json(result);
  } catch (err) {
    console.error("[/me/parish-weekly] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /api/me/feed-digest ──────────────────────────────────────────────
// Backs the queue=feed-digest slideshow that the weekly push deep-links
// into. Returns the new intercessions on the viewer's subscribed feeds
// since the previous digest (or the last 7 days for a first-ever
// caller). Beta-only while the digest is a beta-cohort feature.
//
// ?since=YYYY-MM-DD optionally overrides the cutoff — handy for QA or
// for clients that want to re-pull a previously-sent digest.
router.get("/me/feed-digest", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    // Beta gate. Mirrors the prayer-feeds requireBeta pattern.
    const { db: ddb, usersTable: uT, betaUsersTable: bT } = await import("@workspace/db");
    const { eq: dEq } = await import("drizzle-orm");
    const [me] = await ddb.select({ email: uT.email, lastDigestSentDate: uT.lastDigestSentDate })
      .from(uT).where(dEq(uT.id, sessionUserId));
    if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [beta] = await ddb.select({ email: bT.email })
      .from(bT).where(dEq(bT.email, me.email.toLowerCase()));
    if (!beta) { res.status(403).json({ error: "Weekly digest is a beta feature." }); return; }

    const sinceRaw = typeof req.query.since === "string" ? req.query.since : null;
    const sinceFromQuery = sinceRaw && /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw)
      ? new Date(`${sinceRaw}T00:00:00Z`)
      : null;
    // Default: previous digest stamp, or 7 days ago.
    const since = sinceFromQuery
      ?? (me.lastDigestSentDate
        ? new Date(`${me.lastDigestSentDate}T00:00:00Z`)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    const { loadFeedDigest } = await import("../lib/feedDigest");
    const digest = await loadFeedDigest(sessionUserId, since);
    res.json({
      sinceDate: digest.sinceDate.toISOString(),
      entries: digest.entries.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      actionEntries: digest.actionEntries.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[/me/feed-digest] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Weekly digest opt-out preference ─────────────────────────────────────
// Single boolean toggle the settings page reads + writes. The sender's
// beta-only gate lives at query time, so non-beta users see this
// preference as inert (the UI hides it for them too).
router.get("/me/weekly-digest-pref", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [me] = await db
      .select({ enabled: usersTable.weeklyDigestEnabled })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
    res.json({ enabled: me.enabled });
  } catch (err) {
    console.error("[/me/weekly-digest-pref GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/me/weekly-digest-pref", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ weeklyDigestEnabled: enabled })
      .where(eq(usersTable.id, sessionUserId));
    res.json({ enabled });
  } catch (err) {
    console.error("[/me/weekly-digest-pref PUT] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Feed-first home ──────────────────────────────────────────────────
// Sets which feed (if any) leads the home screen. Any subscriber can
// pick — the Settings UI lists the Daily Office plus one row per feed
// they follow. Body: { feedId: number | null }.
//   • null   → office-led home (feed_first_home off; home_feed_id left
//              as-is so a later re-enable can remember the last choice,
//              though the picker always re-sends an explicit feedId).
//   • number → that feed leads. We verify the caller is actually
//              subscribed before honoring it, so a hand-crafted request
//              can't pin a feed the user doesn't follow (the dashboard
//              would just fall back to the office card anyway, but we
//              reject it cleanly rather than store a dangling pointer).
// Returns the resulting { homeFeedId, feedFirstHome } so the client can
// reconcile its /auth/me cache.
router.put("/me/feed-first-home", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const feedId = (req.body as { feedId?: unknown })?.feedId;
  if (feedId !== null && typeof feedId !== "number") {
    res.status(400).json({ error: "feedId must be a number or null" });
    return;
  }
  try {
    if (feedId === null) {
      await db
        .update(usersTable)
        .set({ feedFirstHome: false })
        .where(eq(usersTable.id, sessionUserId));
      res.json({ homeFeedId: null, feedFirstHome: false });
      return;
    }
    // Verify the subscription before pinning the feed.
    const [sub] = await db
      .select({ feedId: prayerFeedSubscriptionsTable.feedId })
      .from(prayerFeedSubscriptionsTable)
      .where(and(
        eq(prayerFeedSubscriptionsTable.userId, sessionUserId),
        eq(prayerFeedSubscriptionsTable.feedId, feedId),
      ));
    if (!sub) {
      res.status(400).json({ error: "Not subscribed to that feed." });
      return;
    }
    await db
      .update(usersTable)
      .set({ homeFeedId: feedId, feedFirstHome: true })
      .where(eq(usersTable.id, sessionUserId));
    res.json({ homeFeedId: feedId, feedFirstHome: true });
  } catch (err) {
    console.error("[/me/feed-first-home PUT] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Public share endpoints ──────────────────────────────────────────
// No auth required. A prayer-request owner hands out a /p/:token
// link; the visitor lands on a slim public page that reads through
// here. Two endpoints:
//
//   GET  /api/prayer-requests/share/:token
//        Slim payload — body, owner display name + avatar, kind,
//        days-left, prayed-count. Honors is_anonymous (returns
//        "Someone" + no avatar). 404 if the token is unknown,
//        revoked, or the request is closed / answered (the page
//        treats expired-but-active rows as visible so a visitor
//        can still pray on the very last day; the link only goes
//        dead once the owner actually closes the request).
//
//   POST /api/prayer-requests/share/:token/amen
//        Records an Amen. Two paths:
//          • Authenticated viewer  — write a real prayer_request_amens
//            row keyed on user_id, then auto-Fellow the viewer + owner
//            (two directional rows). Same as the existing in-app amen
//            endpoint, just reached via the share path.
//          • Unauthenticated      — write an anonymous_amens row
//            keyed by the body's sessionId (96-bit hex from the
//            visitor's localStorage). Signup linker later claims
//            these rows and fans them out to prayer_request_amens
//            + fellows. Self-deduping via the UNIQUE
//            (request_id, session_id) index.
//
// Anonymous requests are still surfaceable through this path; the
// public payload just hides identifying fields. Once the
// "no more anonymous requests" UI removal lands, new requests
// won't be anonymous, but the existing rows stay valid.

router.get("/prayer-requests/share/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token ?? "").trim();
  if (token.length < 8) { res.status(404).json({ error: "Not found" }); return; }

  try {
    const [row] = await db
      .select({
        id: prayerRequestsTable.id,
        body: prayerRequestsTable.body,
        kind: prayerRequestsTable.kind,
        isAnonymous: prayerRequestsTable.isAnonymous,
        ownerId: prayerRequestsTable.ownerId,
        createdByName: prayerRequestsTable.createdByName,
        expiresAt: prayerRequestsTable.expiresAt,
        closedAt: prayerRequestsTable.closedAt,
        isAnswered: prayerRequestsTable.isAnswered,
        createdAt: prayerRequestsTable.createdAt,
      })
      .from(prayerRequestsTable)
      .where(eq(prayerRequestsTable.shareToken, token));

    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    if (row.closedAt || row.isAnswered) {
      // Treat closed/answered as gone — the owner shouldn't have a
      // shareable link to a request they've already wrapped up.
      res.status(404).json({ error: "Not found" }); return;
    }

    // Owner display fields. Anonymous requests redact name + avatar.
    const [owner] = await db
      .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(eq(usersTable.id, row.ownerId));

    // Distinct pray-count: real amens + anonymous amens (deduped by
    // session_id). Cheap two-query approach — keeping them split
    // makes the SQL legible and the totals additive.
    const realAmenRows = await db
      .selectDistinct({ userId: prayerRequestAmensTable.userId })
      .from(prayerRequestAmensTable)
      .where(eq(prayerRequestAmensTable.requestId, row.id));
    const anonAmenRows = await db
      .selectDistinct({ sessionId: anonymousAmensTable.sessionId })
      .from(anonymousAmensTable)
      .where(eq(anonymousAmensTable.requestId, row.id));
    const prayedCount = realAmenRows.length + anonAmenRows.length;

    const daysLeft = row.expiresAt
      ? Math.max(0, Math.ceil((row.expiresAt.getTime() - Date.now()) / 86_400_000))
      : null;

    res.json({
      request: {
        body: row.body,
        kind: row.kind,
        daysLeft,
        prayedCount,
        owner: row.isAnonymous
          ? { name: "Someone", avatarUrl: null, isAnonymous: true }
          : {
              name: row.createdByName ?? owner?.name ?? "Someone",
              avatarUrl: owner?.avatarUrl ?? null,
              isAnonymous: false,
            },
      },
    });
  } catch (err) {
    console.error("[prayer-requests/share GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/prayer-requests/share/:token/amen", async (req, res): Promise<void> => {
  const token = String(req.params.token ?? "").trim();
  if (token.length < 8) { res.status(404).json({ error: "Not found" }); return; }

  const schema = z.object({
    // 24-hex from the visitor's localStorage. Required for the
    // unauthenticated path (the only way we can later link these
    // rows to a real account at signup); ignored if the request is
    // authenticated.
    sessionId: z.string().min(16).max(64).optional(),
    // Optional self-declared name from the public page. Stored on
    // the anonymous row so the owner's "Someone prayed for you" copy
    // can include it. Capped tight to avoid abuse vectors.
    visitorName: z.string().max(64).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  try {
    const [row] = await db
      .select({ id: prayerRequestsTable.id, ownerId: prayerRequestsTable.ownerId })
      .from(prayerRequestsTable)
      .where(eq(prayerRequestsTable.shareToken, token));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const viewerUserId = req.user ? (req.user as { id: number }).id : null;

    if (viewerUserId) {
      // Authenticated viewer — treat this exactly like the in-app
      // amen endpoint. The viewer also gets fellowed to the owner.
      // ON CONFLICT DO NOTHING for the amen so a re-tap is a no-op.
      await db
        .insert(prayerRequestAmensTable)
        .values({ requestId: row.id, userId: viewerUserId })
        .onConflictDoNothing();
      if (viewerUserId !== row.ownerId) {
        await createFellowPair(viewerUserId, row.ownerId, "shared_prayer");
      }
      res.json({ ok: true, claimed: true });
      return;
    }

    // Unauthenticated — anonymous amen, keyed by session_id.
    if (!parsed.data.sessionId) {
      res.status(400).json({ error: "session_id_required" });
      return;
    }
    await db
      .insert(anonymousAmensTable)
      .values({
        requestId: row.id,
        sessionId: parsed.data.sessionId,
        visitorName: parsed.data.visitorName ?? null,
      })
      .onConflictDoNothing();
    res.json({ ok: true, claimed: false });
  } catch (err) {
    console.error("[prayer-requests/share/amen POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Helper — insert both directions of a fellow pair. Idempotent via
// the UNIQUE (user_id, fellow_user_id) constraint. Kept local so
// the route file is self-contained; the signup linker has its own
// copy in routes/auth.ts (small duplication; the surface is so thin
// it's cheaper than a shared helper file).
async function createFellowPair(a: number, b: number, source: string) {
  if (a === b) return;
  await db
    .insert(fellowsTable)
    .values([
      { userId: a, fellowUserId: b, source },
      { userId: b, fellowUserId: a, source },
    ])
    .onConflictDoNothing();
}

export default router;
