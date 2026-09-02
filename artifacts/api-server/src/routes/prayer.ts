import { Router, type IRouter } from "express";
import { eq, asc, desc, inArray, notInArray, and, isNull, isNotNull, or, gt, lt } from "drizzle-orm";
import { db, prayerRequestsTable, prayerWordsTable, prayerRequestAmensTable, prayerHeldNotificationsTable, usersTable, userMutesTable, groupMembersTable, anonymousAmensTable, prayerRequestTagsTable, prayerFeedSubscriptionsTable, adoptedPrayersTable, contentReportsTable, prayerRequestGroupsTable, groupsTable } from "@workspace/db";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { isSuperAdminUser } from "../lib/superAdmin";
import { getGardenUserIds, getFellowUserIds, getGroupMemberUserIds, getUserGroupIds } from "../lib/garden";
import { sendPrayerWordPush, sendFirstAmenPush, sendNewPrayerRequestPush, sendLifeEventUpdatePush } from "../lib/pushSender";
import { logger } from "../lib/logger";
import { isParishOnlyUser } from "../lib/parishGate";
import { rateLimit } from "../lib/rate-limit";
import { scanForCrisisLanguage, stripLinks } from "../lib/contentSafety";
import { HOME_MODULE_KEYS } from "../lib/homeModules";

// Per-user rate-limit key — throttles by account, not IP, so users
// behind a shared NAT aren't penalized for each other. Returns null
// (fail-open) for unauthenticated requests; those 401 in the handler.
const byUser = (req: { user?: unknown }): string | null => {
  const u = req.user as { id?: number } | undefined;
  return u?.id ? `u:${u.id}` : null;
};

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
// Amens + words are attached for the owner AND for tagged subjects —
// the person the prayer is FOR ("praying for my friend Matthew") should
// be able to see who prayed for them and the words of comfort left. Other
// viewers (untagged garden / third parties) see the request body alone:
// Phoebe hides who else is praying for someone else's request from bystanders.
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
  // Parish "pastoral concerns" (parishFeedId set) are private to the requester
  // + parish admins and must NEVER be reachable via the garden/tagged path —
  // mirror the list route's exclusion (see ~line 416). Gate them explicitly.
  if (r.parishFeedId != null) {
    // Legacy "pastoral concern" (parish tier, now removed) — private to the
    // requester. With the parish-admin concept gone, no other viewer can open it.
    if (!viewerIsOwner) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (r.directOnly) {
    // Directed ("to a fellow") request — private to the owner + tagged
    // recipients. Garden membership grants nothing here.
    if (!viewerIsOwner && !viewerIsTagged) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (!viewerIsOwner && !viewerIsTagged) {
    const garden = await getGardenUserIds(sessionUserId);
    if (!garden.includes(r.ownerId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  /**
   * THE FILTERS THE LIST ROUTE APPLIES, APPLIED HERE TOO.
   *
   * The garden check above answers "can this viewer see requests from this
   * owner at all" — it says nothing about closed, expired, muted, or
   * community-scoped requests, and this route checked none of them. A
   * request's serial `id` is guessable in sequence, so any garden peer could
   * walk `1..N` and read every closed, answered, expired, muted or
   * differently-scoped request any garden peer had ever written — months
   * after it was released, past the mute, past the community it was
   * actually shared with. The list route has always excluded all four;
   * this route just never inherited them.
   *
   * Skipped entirely for the owner and for an explicit tag/adopt grant —
   * same exemptions the list route makes, and for the same reason: your own
   * closed request should still open for you (to renew or just re-read),
   * and a tag or adoption is a deliberate grant that community scoping and
   * mutes shouldn't silently defeat.
   */
  if (!viewerIsOwner && !viewerIsTagged) {
    if (r.closedAt != null) { res.status(403).json({ error: "Forbidden" }); return; }
    if (r.isAnswered) { res.status(403).json({ error: "Forbidden" }); return; }
    if (r.expiresAt != null && r.expiresAt.getTime() < Date.now()) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [adoptedRow] = await db
      .select({ id: adoptedPrayersTable.id })
      .from(adoptedPrayersTable)
      .where(and(
        eq(adoptedPrayersTable.adopterUserId, sessionUserId),
        eq(adoptedPrayersTable.requestId, id),
        isNull(adoptedPrayersTable.releasedAt),
      ));
    const viewerIsAdopter = !!adoptedRow;
    if (!viewerIsAdopter) {
      const [mutedRow] = await db
        .select({ id: userMutesTable.id })
        .from(userMutesTable)
        .where(and(eq(userMutesTable.muterId, sessionUserId), eq(userMutesTable.mutedUserId, r.ownerId)));
      if (mutedRow) { res.status(403).json({ error: "Forbidden" }); return; }

      const scopeRows = await db
        .select({ groupId: prayerRequestGroupsTable.groupId, mutedAt: prayerRequestGroupsTable.mutedAt })
        .from(prayerRequestGroupsTable)
        .where(eq(prayerRequestGroupsTable.requestId, id));
      if (scopeRows.length > 0) {
        const viewerGroupIds = new Set(await getUserGroupIds(sessionUserId));
        const sharesAnUnmutedScope = scopeRows.some((g) => viewerGroupIds.has(g.groupId) && g.mutedAt == null);
        if (!sharesAnUnmutedScope) { res.status(403).json({ error: "Forbidden" }); return; }
      }
    }
  }

  const [owner] = await db
    .select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(eq(usersTable.id, r.ownerId));

  const wordRows = (viewerIsOwner || viewerIsTagged)
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

  // Owner + tagged subject: surface who has prayed and how many times.
  // We collapse multiple taps from the same person on the same calendar
  // day into a single "amen" — same dedupe rule as the prayer-list feed
  // counts — so the number on this page lines up with what the owner sees
  // on their feed card. We surface the FULL deduped list (one row per
  // person-day, ordered most recent first) so the viewer can see who
  // showed up and when. The most recent row is what the first-amen
  // push is celebrating.
  let amenCountTotal = 0;
  let amens: Array<{
    userId: number;
    userName: string | null;
    userAvatarUrl: string | null;
    prayedAt: string;
  }> = [];
  if (viewerIsOwner || viewerIsTagged) {
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

    // Bucket by (user, calendar-day) using the OWNER's timezone so the
    // count matches the owner's feed card regardless of who's viewing
    // (the viewer here may be a tagged subject, not the owner). Falls
    // back to UTC if no tz is set on the owner row — same as the feed.
    const [ownerTzRow] = await db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, r.ownerId));
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
      // Never surface the owner's OWN amen here. The rail/count means "who
      // prayed FOR you", so a self-amen would both inflate the count and — on
      // an anonymous request — leak the owner's real name+face to tagged
      // viewers. (Owner self-amens still count toward the separate metrics.)
      if (a.userId === r.ownerId) continue;
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

    // Also surface anonymous share-link amens — people who tapped Amen on the
    // public /p/:token link while logged out (e.g. a friend who isn't on Phoebe
    // yet). These live in a SEPARATE table and were never shown to the owner, so
    // the owner's page under-counted vs. the very link they shared (this is the
    // "Kyle prayed but doesn't show up" bug). Unclaimed only — a claimed row has
    // already become a real prayer_request_amens row above, so it'd double-count.
    // One row per visitor session (UNIQUE request_id+session_id); no prayed_at,
    // so created_at is the tap time.
    const anonAmens = await db
      .select({
        sessionId: anonymousAmensTable.sessionId,
        visitorName: anonymousAmensTable.visitorName,
        createdAt: anonymousAmensTable.createdAt,
      })
      .from(anonymousAmensTable)
      .where(and(
        eq(anonymousAmensTable.requestId, id),
        isNull(anonymousAmensTable.claimedAt),
      ));
    for (const a of anonAmens) {
      amens.push({
        userId: 0, // sentinel — no real account behind an anonymous amen
        userName: a.visitorName ?? null, // renders as their name, or "Someone"
        userAvatarUrl: null,
        prayedAt: a.createdAt.toISOString(),
      });
      amenCountTotal += 1;
    }
    // Keep the merged rail newest-first.
    amens.sort((x, y) => (y.prayedAt ?? "").localeCompare(x.prayedAt ?? ""));
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
    // "Did I amen this TODAY" is judged on the VIEWER'S calendar day — the
    // person praying — NOT the owner's. The home-list endpoint computes
    // myAmenedToday in the viewer's tz; this detail endpoint MUST match, or the
    // two disagree across a timezone boundary (an owner with no tz set defaults
    // to UTC, so a US viewer's evening amen reads as "today" here but
    // "yesterday" on the list) — the slide then shows "Amen sent" while the
    // home list still shows "Pray", and the viewer can't re-amen. (Prior bug.)
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
      const [viewerTzRow] = await db
        .select({ timezone: usersTable.timezone })
        .from(usersTable)
        .where(eq(usersTable.id, sessionUserId));
      const viewerTz = viewerTzRow?.timezone || "UTC";
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const lastDay = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz, year: "numeric", month: "2-digit", day: "2-digit" }).format(myAmens[0].prayedAt);
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

  // Communities this request was shared to, plus whether THIS viewer is an
  // admin there and whether it's currently muted in that group — drives
  // the "Mute in [Group]" admin action on the detail page. Owner: "an
  // admin should be able to mute a prayer request from the group."
  const scopedGroupRows = await db
    .select({
      groupId: prayerRequestGroupsTable.groupId,
      groupName: groupsTable.name,
      groupSlug: groupsTable.slug,
      mutedAt: prayerRequestGroupsTable.mutedAt,
      viewerRole: groupMembersTable.role,
    })
    .from(prayerRequestGroupsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, prayerRequestGroupsTable.groupId))
    .leftJoin(groupMembersTable, and(
      eq(groupMembersTable.groupId, prayerRequestGroupsTable.groupId),
      eq(groupMembersTable.userId, sessionUserId),
      isNotNull(groupMembersTable.joinedAt),
    ))
    .where(eq(prayerRequestGroupsTable.requestId, id));
  const groups = scopedGroupRows.map((g) => ({
    id: g.groupId,
    name: g.groupName,
    slug: g.groupSlug,
    isAdmin: g.viewerRole === "admin" || g.viewerRole === "hidden_admin",
    muted: g.mutedAt != null,
  }));

  res.json({
    id: r.id,
    body: r.body,
    // Author's framing — drives the small pill next to the eyebrow.
    // Mirrors the field on the prayer-mode slideshow's request slide
    // so the deep-link page renders the same chip.
    kind: r.kind ?? "request",
    // Life-event fields — the dated thing, and the owner's "how it went" update.
    eventDate: r.eventDate ? r.eventDate.toISOString() : null,
    eventTitle: r.eventTitle ?? null,
    eventUpdate: r.eventUpdate ?? null,
    eventUpdatedAt: r.eventUpdatedAt ? r.eventUpdatedAt.toISOString() : null,
    // Honor anonymity fully: suppress the author's stable id too, not just the
    // name/avatar. A parish admin (or garden viewer) is allowed to OPEN an
    // anonymous request, and a raw ownerId defeats anonymity on its own — it can
    // be mapped to a name via other surfaces, and links this row to the same
    // author's non-anonymous posts. The owner still gets their own id back.
    ownerId: (r.isAnonymous && !viewerIsOwner) ? null : r.ownerId,
    // Honor anonymity. Every other surface (feed list at ~531, the
    // slideshow, push copy) suppresses the author's name + avatar for an
    // anonymous request; this detail endpoint must too — otherwise a garden
    // viewer who opens an anonymous request sees exactly who posted it.
    ownerName: r.isAnonymous ? null : (owner?.name ?? null),
    ownerAvatarUrl: r.isAnonymous ? null : (owner?.avatarUrl ?? null),
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
    // Suppressed for directed ("to a fellow") requests — a private request
    // isn't publicly shareable, so the share affordance never appears.
    shareToken: (viewerIsOwner && !r.directOnly) ? r.shareToken ?? null : null,
    words: wordRows
      .map(w => {
        // If the request is anonymous and this word is the OWNER's own, mask the
        // author so a tagged viewer can't unmask the anonymous poster.
        const maskOwner = r.isAnonymous && w.authorUserId === r.ownerId;
        return {
          id: w.id,
          authorName: maskOwner ? "Someone" : w.authorName,
          authorAvatarUrl: maskOwner ? null : (w.authorAvatarUrl ?? null),
          content: w.content,
          createdAt: w.createdAt ? w.createdAt.toISOString() : null,
        };
      })
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    amens,
    amenCountTotal,
    myWord,
    myAmenedToday,
    groups,
  });
});

// GET /api/prayer-requests — list active prayer requests visible to me (mine + garden)
router.get("/prayer-requests", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const gardenIds = await getGardenUserIds(sessionUserId);
  // Fellows are already folded into getGardenUserIds (garden.ts → getFellowUserIds),
  // so an accepted fellow's requests surface here automatically.
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

  // Requests the viewer has ADOPTED ("pray along") — they carry these as
  // their own going forward, so they must surface in the viewer's list +
  // slideshow even once the owner is no longer in their garden. Active
  // adoptions only (releasedAt IS NULL). OR'd into the visibility clause
  // below alongside tagged-in ids.
  const adoptedRows = await db
    .select({ requestId: adoptedPrayersTable.requestId })
    .from(adoptedPrayersTable)
    .where(and(
      eq(adoptedPrayersTable.adopterUserId, sessionUserId),
      isNull(adoptedPrayersTable.releasedAt),
    ));
  const adoptedReqIds = adoptedRows.map(r => r.requestId);

  // Fetch muted user IDs so we can exclude their requests
  const mutedRows = await db
    .select({ mutedUserId: userMutesTable.mutedUserId })
    .from(userMutesTable)
    .where(eq(userMutesTable.muterId, sessionUserId));
  const mutedIds = mutedRows.map(r => r.mutedUserId);

  // (Letters feature removed 2026-07-23 — there is no longer a
  // correspondent signal; isCorrespondent is always false below.)

  const now = new Date();

  // The previous global hidden_admin filter is gone — it was
  // over-filtering users who were hidden_admin in ONE community
  // but regular admins/members in OTHERS. Per-group scoping now
  // lives inside getGardenUserIds (above): the garden only
  // includes peers from groups where they're NOT hidden_admin.
  // If the only community we share is one where they're hidden,
  // they don't enter the garden and their prayers don't surface.
  // If we share any community where they're visible, they do.

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
  // specific request) OR (I've adopted it). Wrapped in `or()` so any
  // signal grants access without breaking the existing garden-based
  // filtering. The directOnly/parish guards below still apply, so an
  // adopted id can't slip a private request through.
  const explicitVisibleIds = [...new Set([...taggedInIds, ...adoptedReqIds])];
  const visibilityFilter = explicitVisibleIds.length > 0
    ? or(
        inArray(prayerRequestsTable.ownerId, visibleOwnerIds),
        inArray(prayerRequestsTable.id, explicitVisibleIds),
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
    // Directed ("to a fellow") requests are private: only the owner or a tagged
    // recipient sees them — never the rest of the garden.
    taggedInIds.length > 0
      ? or(
          eq(prayerRequestsTable.directOnly, false),
          eq(prayerRequestsTable.ownerId, sessionUserId),
          inArray(prayerRequestsTable.id, taggedInIds),
        )
      : or(
          eq(prayerRequestsTable.directOnly, false),
          eq(prayerRequestsTable.ownerId, sessionUserId),
        ),
  ];
  if (mutedIds.length > 0) baseFilters.push(notInArray(prayerRequestsTable.ownerId, mutedIds));
  const requestsUnfiltered = await db.select().from(prayerRequestsTable)
    .where(and(...baseFilters))
    .orderBy(desc(prayerRequestsTable.createdAt))
    .limit(200);

  // A request scoped to specific communities ("select which communities to
  // share it with") is visible only to someone who actually shares one of
  // those communities — the broad owner-in-my-garden rule above is too
  // wide for it (that rule unions EVERY group the owner belongs to, which
  // is exactly the "goes to all communities" behavior this scoping
  // replaces). A request with NO scoping row is legacy/unscoped and keeps
  // the existing broad rule unchanged. Post-filtered here (rather than
  // folded into baseFilters) to avoid a raw-SQL subquery — the candidate
  // set is already .limit(200)-bounded, so this is cheap.
  let requests = requestsUnfiltered;
  if (requestsUnfiltered.length > 0) {
    const scopeRows = await db
      .select({ requestId: prayerRequestGroupsTable.requestId, groupId: prayerRequestGroupsTable.groupId, mutedAt: prayerRequestGroupsTable.mutedAt })
      .from(prayerRequestGroupsTable)
      .where(inArray(prayerRequestGroupsTable.requestId, requestsUnfiltered.map(r => r.id)));
    if (scopeRows.length > 0) {
      // groupId -> muted, per request — a group admin's mute (owner: "an
      // admin should be able to mute a prayer request from the group")
      // only silences it for viewers whose ONLY shared-group path to this
      // request runs through that muted group; a viewer who shares a
      // DIFFERENT (unmuted) group with the requester still sees it.
      const scopedGroupsByRequest = new Map<number, Map<number, boolean>>();
      for (const row of scopeRows) {
        const map = scopedGroupsByRequest.get(row.requestId) ?? new Map<number, boolean>();
        map.set(row.groupId, row.mutedAt != null);
        scopedGroupsByRequest.set(row.requestId, map);
      }
      const viewerGroupIds = await getUserGroupIds(sessionUserId);
      const viewerGroupSet = new Set(viewerGroupIds);
      requests = requestsUnfiltered.filter((r) => {
        // Owner always sees their own request; an explicit tag/adopt grant
        // shouldn't be silently defeated by community scoping either.
        if (r.ownerId === sessionUserId || explicitVisibleIds.includes(r.id)) return true;
        const scope = scopedGroupsByRequest.get(r.id);
        if (!scope) return true; // legacy/unscoped — existing rule applies
        for (const [gid, muted] of scope) if (viewerGroupSet.has(gid) && !muted) return true;
        return false;
      });
    }
  }

  // Viewer's timezone — used to scope "today" for their own amen counts so
  // the number in the UI matches the user's local day, not UTC.
  const [viewer] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, sessionUserId));
  const viewerTz = viewer?.timezone || "UTC";
  // ONE formatter for the viewer's tz, reused for every amen below. Constructing
  // a fresh Intl.DateTimeFormat per amen (×200 requests) was a real hot-path cost.
  const viewerFmt = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz });
  const viewerTodayYmd = viewerFmt.format(new Date());

  // Bulk-load owners, words, and amens for all requests in three queries
  // instead of 3×N individual lookups.
  const requestIds = requests.map(r => r.id);
  const ownerIds = [...new Set(requests.map(r => r.ownerId))];

  const [ownerRows, allWordsRows, allAmenRows] = await Promise.all([
    ownerIds.length > 0
      ? db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
          .from(usersTable).where(inArray(usersTable.id, ownerIds))
      : Promise.resolve([] as Array<{ id: number; name: string | null; avatarUrl: string | null }>),
    requestIds.length > 0
      ? db.select({
          requestId: prayerWordsTable.requestId,
          authorName: prayerWordsTable.authorName,
          content: prayerWordsTable.content,
          authorUserId: prayerWordsTable.authorUserId,
          createdAt: prayerWordsTable.createdAt,
          isPrivate: prayerWordsTable.isPrivate,
        }).from(prayerWordsTable).where(inArray(prayerWordsTable.requestId, requestIds))
      : Promise.resolve([] as Array<{ requestId: number; authorName: string | null; content: string; authorUserId: number | null; createdAt: Date | null; isPrivate: boolean | null }>),
    requestIds.length > 0
      ? db.select({
          requestId: prayerRequestAmensTable.requestId,
          prayedAt: prayerRequestAmensTable.prayedAt,
          userId: prayerRequestAmensTable.userId,
          // The amener's name + avatar, so an OWNER's card can show the faces of
          // who prayed for THAT request. Ordered newest-first so the face list
          // below is the most recent prayers.
          amenName: usersTable.name,
          amenAvatarUrl: usersTable.avatarUrl,
        }).from(prayerRequestAmensTable)
          .leftJoin(usersTable, eq(usersTable.id, prayerRequestAmensTable.userId))
          .where(inArray(prayerRequestAmensTable.requestId, requestIds))
          .orderBy(desc(prayerRequestAmensTable.prayedAt))
      : Promise.resolve([] as Array<{ requestId: number; prayedAt: Date; userId: number; amenName: string | null; amenAvatarUrl: string | null }>),
  ]);

  const ownersMap = new Map<number, { name: string | null; avatarUrl: string | null }>();
  for (const o of ownerRows) ownersMap.set(o.id, { name: o.name, avatarUrl: o.avatarUrl });

  const wordsByRequest = new Map<number, typeof allWordsRows>();
  for (const w of allWordsRows) {
    if (!wordsByRequest.has(w.requestId)) wordsByRequest.set(w.requestId, []);
    wordsByRequest.get(w.requestId)!.push(w);
  }

  const amensByRequest = new Map<number, typeof allAmenRows>();
  for (const a of allAmenRows) {
    if (!amensByRequest.has(a.requestId)) amensByRequest.set(a.requestId, []);
    amensByRequest.get(a.requestId)!.push(a);
  }

  // Active "pray along" adoptions for these requests — drives the
  // "N praying along" count (everyone sees it as social proof) and the
  // viewer's own isAdopted flag (so the client renders an adopted prayer
  // as one the viewer is carrying, not just another's request).
  const adoptForRequests = requestIds.length > 0
    ? await db.select({ requestId: adoptedPrayersTable.requestId, adopterUserId: adoptedPrayersTable.adopterUserId })
        .from(adoptedPrayersTable)
        .where(and(inArray(adoptedPrayersTable.requestId, requestIds), isNull(adoptedPrayersTable.releasedAt)))
    : [] as Array<{ requestId: number; adopterUserId: number }>;
  const adoptCountByRequest = new Map<number, number>();
  const iAdoptedSet = new Set<number>();
  for (const a of adoptForRequests) {
    adoptCountByRequest.set(a.requestId, (adoptCountByRequest.get(a.requestId) ?? 0) + 1);
    if (a.adopterUserId === sessionUserId) iAdoptedSet.add(a.requestId);
  }

  // Enrich with owner name, words, and per-user flags
  const enriched = requests.map((r) => {
    const owner = ownersMap.get(r.ownerId);
    const allWords = wordsByRequest.get(r.id) ?? [];
    const amens = amensByRequest.get(r.id) ?? [];

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
    // Up to 3 distinct faces of people who prayed for THIS request (owner-only),
    // most-recent first — for the home "Your prayer requests" card.
    let amenFaces: Array<{ name: string | null; avatarUrl: string | null }> | null = null;

    let myAmenedToday = false;
    let myAmenedEver = false;
    for (const row of amens) {
      if (row.userId !== sessionUserId) continue;
      if (!row.prayedAt) continue;
      myAmenedEver = true;
      const ymd = viewerFmt.format(row.prayedAt);
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
        const ymd = viewerFmt.format(row.prayedAt);
        totalUserDays.add(`${row.userId}|${ymd}`);
        distinctUsers.add(row.userId);
        if (ymd === viewerTodayYmd) todayUsers.add(row.userId);
      }
      amenCountTotal = totalUserDays.size;
      amenCountToday = todayUsers.size;
      amenPeopleCount = distinctUsers.size;
      // `amens` is ordered newest-first (the bulk query orders by prayedAt
      // desc), so walking it and keeping the first occurrence per user yields
      // the 3 most-recent distinct people who prayed for this request.
      const seenFace = new Set<number>();
      const faces: Array<{ name: string | null; avatarUrl: string | null }> = [];
      for (const row of amens) {
        if (seenFace.has(row.userId)) continue;
        seenFace.add(row.userId);
        faces.push({ name: row.amenName ?? null, avatarUrl: row.amenAvatarUrl ?? null });
        if (faces.length >= 3) break;
      }
      amenFaces = faces;
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
      // The public-share secret must only ever reach the owner (and never for a
      // directed request) — the spread above would otherwise leak every listed
      // request's shareToken to every garden viewer. Matches the by-id route.
      shareToken: (isOwnRequest && !r.directOnly) ? (r.shareToken ?? null) : null,
      // Honor anonymity FULLY, exactly like the by-id route (~293): the spread
      // above carries the raw `ownerId` (stable account id) and `createdByName`
      // (the author's real name, set unconditionally at creation) — both defeat
      // anonymity on their own from dev tools / the network log even though the
      // UI hides them. Null them for anonymous requests seen by non-owners; the
      // owner still gets their own values back.
      ownerId: (r.isAnonymous && !isOwnRequest) ? null : r.ownerId,
      createdByName: (r.isAnonymous && !isOwnRequest) ? null : r.createdByName,
      ownerName: r.isAnonymous ? null : (owner?.name ?? null),
      // Anonymous requests suppress the avatar too — the feed UI
      // renders an initials bubble when avatarUrl is null.
      ownerAvatarUrl: r.isAnonymous ? null : (owner?.avatarUrl ?? null),
      isOwnRequest,
      // "One time" community ask — surfaces first, and leaves a viewer's list
      // the moment they've prayed it (see the filter + sort below).
      oneTime: r.oneTime ?? false,
      // "Pray along": the viewer is carrying this (not their own) request.
      // adoptCount is the number of people actively praying it along (any
      // viewer can see it — gentle "you're not alone" social proof).
      isAdopted: iAdoptedSet.has(r.id),
      adoptCount: adoptCountByRequest.get(r.id) ?? 0,
      isCorrespondent: false,
      words: words.map(w => {
        // Same mask the by-id route already applies (~line 404): the OWNER
        // can write on their own anonymous request, and this list route
        // shipped that word under their real name to every garden viewer —
        // the exact thing "anonymous" was supposed to prevent. A word from
        // someone else on an anonymous request is unaffected; only the
        // owner's own name, on their own request, is masked.
        const maskOwner = r.isAnonymous && w.authorUserId === r.ownerId;
        return {
          authorName: maskOwner ? "Someone" : w.authorName,
          content: w.content,
          // ISO timestamp — the dashboard uses this to detect new words on the
          // viewer's own requests and surface a one-at-a-time popup.
          createdAt: w.createdAt ? w.createdAt.toISOString() : null,
        };
      }),
      myWord: myWordRow?.content ?? null,
      nearingExpiry,
      needsRenewal,
      amenCountToday,
      amenCountTotal,
      amenPeopleCount,
      // Up to 3 faces (owner-only) of who prayed for THIS request, newest-first.
      amenFaces,
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
  });

  // "One time" community asks: a viewer who has ALREADY prayed one once drops
  // it from their list (the request lives on for others until they pray it or
  // it expires). The owner always keeps seeing their own.
  const visible = enriched.filter((r) => !(r.oneTime && r.myAmenedEver && !r.isOwnRequest));

  // Order: one-time asks the viewer hasn't prayed yet surface FIRST (a gentle
  // "pray this once" nudge at the top); everything else keeps the chronological
  // (createdAt-desc) order from the SQL query. V8's Array.sort is stable, so
  // returning 0 for same-tier rows preserves that order. We otherwise do NOT
  // re-tier by ownership/correspondent — the rest reads like a feed.
  visible.sort((a, b) => {
    const aFirst = a.oneTime && !a.myAmenedEver ? 1 : 0;
    const bFirst = b.oneTime && !b.myAmenedEver ? 1 : 0;
    return bFirst - aFirst;
  });

  res.json(visible);
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

  // Distinct people who prayed each request — drives the "Prayed by N people"
  // line. Batched into ONE query (was one round-trip per row) so the past
  // list scales regardless of length.
  const pastIds = rows.map((r) => r.id);
  const allAmens = pastIds.length > 0
    ? await db
        .select({ requestId: prayerRequestAmensTable.requestId, userId: prayerRequestAmensTable.userId })
        .from(prayerRequestAmensTable)
        .where(inArray(prayerRequestAmensTable.requestId, pastIds))
    : [];
  const amenPeopleByRequest = new Map<number, Set<number>>();
  for (const a of allAmens) {
    let set = amenPeopleByRequest.get(a.requestId);
    if (!set) { set = new Set(); amenPeopleByRequest.set(a.requestId, set); }
    set.add(a.userId);
  }

  const enriched = rows.map((r) => {
    const amenPeopleCount = amenPeopleByRequest.get(r.id)?.size ?? 0;
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
  });

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

router.post("/prayer-requests", rateLimit({
  name: "prayer_request_create",
  max: 30,
  windowMs: 60 * 60 * 1000,
  keyFn: byUser,
  message: "You're creating prayer requests very quickly — please slow down a moment.",
}), async (req, res): Promise<void> => {
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
    // "Ongoing" requests skip the 7–30 day clock — a far-future expiry keeps
    // them on the list until they're answered or released.
    ongoing: z.boolean().optional().default(false),
    // "One time" community ask: surfaces first + leaves a person's list once
    // they've prayed it once; bounded by a 7-day expiry. Mutually exclusive
    // with ongoing (one-time wins if both are somehow sent).
    oneTime: z.boolean().optional().default(false),
    // Author's framing at submission. Drives the optional pill on cards /
    // slideshow. Default "request" renders no pill. Older iOS bundles
    // don't send this; defaults to "request" so they're never rejected.
    // Community intercessions are not prayer requests — they live in
    // shared_moments via /moment/new?template=intercession, so they
    // never reach this endpoint.
    kind: z.enum(["request", "life-event", "justice"]).optional().default("request"),
    // Life-event fields — only meaningful when kind === "life-event": the date
    // it happens (ISO) and a short title ("Knee surgery"). Ignored otherwise.
    eventDate: z.string().datetime().optional(),
    eventTitle: z.string().trim().max(80).optional(),
    // Tagged Phoebe users — the owner explicitly named these people
    // in the request ("praying for my friend Matthew"). They get
    // visibility regardless of garden membership and receive a push
    // on creation + on first amen + on words of comfort. Empty /
    // missing array = no one tagged; the rest of the flow behaves
    // exactly like a normal request.
    taggedUserIds: z.array(z.number().int().positive()).optional().default([]),
    // When true, this is a PRIVATE request directed only to the tagged
    // fellow(s): owner + tagged see it, nobody else (no garden / slideshow).
    // Requires at least one tag to be meaningful; ignored (forced false) if
    // no one is tagged so an empty "direct" request can't silently vanish.
    directOnly: z.boolean().optional().default(false),
    // Which of the owner's own communities to share this with — owner:
    // "have it have you select which communities to share it with".
    // Validated against the caller's actual memberships below (a
    // hand-crafted id for a group they're not in is silently dropped, not
    // rejected). Empty/missing = legacy whole-garden behavior (every
    // group the owner belongs to), for backward compatibility with older
    // app builds that don't send this yet.
    groupIds: z.array(z.number().int().positive()).optional().default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    // Log the field-level error shape only — never req.body, which carries the
    // prayer text + event title (operator-readable logs).
    logger.warn({
      ua: req.headers["user-agent"],
      userId: sessionUserId,
      err: parsed.error.flatten(),
      bodyLen: typeof (req.body as { body?: unknown })?.body === "string" ? (req.body as { body: string }).body.length : undefined,
    }, "[prayer-requests:post] rejected — schema mismatch");
    res.status(400).json({ error: "Please share a non-empty prayer request." });
    return;
  }

  // Owner-requested group scoping ("share to my community") is REMOVED.
  // This path had no moderation at all — it inserted a prayer_request_groups
  // row and immediately pushed "{name} is asking for your prayers" to every
  // group member, with only a REACTIVE post-hoc mute for an admin to catch
  // it after the fact. That's the opposite of group-prayer-list.ts's own
  // threat model (an admin reads a request BEFORE it reaches the group,
  // specifically because it may name a third party's health without their
  // consent), and that properly-moderated path already exists — Jeremy's
  // decision was to send people there instead of half-fixing this one.
  //
  // Refuse at the input, before any insert, rather than silently re-target
  // the request: `validGroupIds` filtered to empty falls back to the
  // WHOLE-GARDEN fan-out below (legacy no-selection behavior, correct in
  // its own right) — quietly dropping a hand-crafted or now-stale groupIds
  // array would take a request meant for one parish and push it to the
  // caller's entire garden instead, silently wider than the bug being
  // removed. A hard error is also the right choice over creating an
  // unscoped private request: a silent downgrade means someone believes
  // their parish is praying for them when nobody is, which is worse than
  // an error message that sends them to /communities/:slug/prayer-list.
  if (parsed.data.groupIds.length > 0) {
    res.status(400).json({
      error: "group_sharing_moved",
      message: "Sharing a request straight to a community has moved — post it from the community's own Prayer list instead, where a leader reviews it first.",
    });
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

  // Content safety, server-side (defense in depth — the compose UI already
  // strips links and shows a standing crisis-resources line, but a
  // hand-crafted POST could skip both). Links come out of the stored text
  // entirely — a public, unmoderated garden isn't a place for outbound
  // URLs. A crisis-language hit does NOT block the post (someone in
  // crisis should be met with resources, not told their words aren't
  // allowed) — it auto-flags the row into the same moderation queue a
  // user report lands in, and the response tells the client to show
  // crisis resources immediately rather than waiting for anyone to notice.
  const { text: safeBody, hadLinks } = stripLinks(parsed.data.body);
  const crisisFlagged = scanForCrisisLanguage(safeBody);

  const [owner] = await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, sessionUserId));

  // Validate requested groupIds against the caller's ACTUAL memberships —
  // a hand-crafted id for a group they're not in is silently dropped, not
  // rejected (matches the tag-validation pattern below). Membership can
  // be by userId OR by matching (unclaimed) email invite, same lookup
  // garden.ts uses.
  let validGroupIds: number[] = [];
  if (parsed.data.groupIds.length > 0) {
    const wantedGroupIds = Array.from(new Set(parsed.data.groupIds));
    const viewerEmail = (owner?.email ?? "").toLowerCase();
    const myMemberships = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(and(
        inArray(groupMembersTable.groupId, wantedGroupIds),
        sql`(${groupMembersTable.userId} = ${sessionUserId} OR LOWER(${groupMembersTable.email}) = ${viewerEmail})`,
      ));
    const memberGroupIds = Array.from(new Set(myMemberships.map(m => m.groupId)));
    // Server-side enforcement (not just a hidden client checkbox): a group
    // with prayer requests turned off, OR any public/listed group (owner:
    // "no publicly listed group can have shared prayer requests" — public
    // groups can never carry this even if prayer_requests_enabled is
    // stale-true from before the group went public), is silently dropped
    // from the scoping list, same as a group the caller isn't in.
    if (memberGroupIds.length > 0) {
      const eligibleGroups = await db
        .select({ id: groupsTable.id })
        .from(groupsTable)
        .where(and(
          inArray(groupsTable.id, memberGroupIds),
          eq(groupsTable.prayerRequestsEnabled, true),
          eq(groupsTable.isPublic, false),
        ));
      validGroupIds = eligibleGroups.map(g => g.id);
    }
  }

  // Life events live until just after the event itself, so the "how did it go?"
  // nudge can fire the evening of (the +2-day grace keeps the row active through
  // that follow-up). Everything else uses the chosen 3/7-day window.
  const eventDate = parsed.data.kind === "life-event" && parsed.data.eventDate
    ? new Date(parsed.data.eventDate) : null;
  // A life event needs BOTH a date and a title (the follow-up cron + the detail
  // UI depend on them), and the date can't be in the past — otherwise the row's
  // expiry (eventDate + 2d) would land in the past and it'd be born expired.
  // (>24h-ago guard, not "before now", so picking today still works.)
  if (parsed.data.kind === "life-event") {
    if (!eventDate) {
      res.status(400).json({ error: "A life event needs a date." });
      return;
    }
    if (eventDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      res.status(400).json({ error: "The event date can't be in the past." });
      return;
    }
    if (!parsed.data.eventTitle || !parsed.data.eventTitle.trim()) {
      res.status(400).json({ error: "A life event needs a title." });
      return;
    }
  }
  // One-time wins over ongoing: it always carries the 7-day expiry so an
  // unprayed one-time ask drops off everyone's list after a week.
  const oneTime = parsed.data.oneTime && parsed.data.kind === "request";
  const expiresAt = eventDate
    ? new Date(eventDate.getTime() + 2 * 24 * 60 * 60 * 1000)
    : oneTime
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : parsed.data.ongoing
        ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + parsed.data.durationDays * 24 * 60 * 60 * 1000);

  // Every new request gets a public share token at creation time.
  // The /p/:token public page reads through this slug; without one,
  // the owner can't share. 96 bits of entropy (24 hex chars) keeps
  // brute-forcing the namespace infeasible. Per-row uniqueness is
  // enforced by the partial UNIQUE index in migrate.ts.
  const shareToken = crypto.randomBytes(12).toString("hex");

  // A "to a fellow" request is private (directOnly) — but only if it actually
  // names someone. An empty tag list forces it back to a normal garden request
  // so a directed request can never silently reach no one.
  const directOnly = parsed.data.directOnly && parsed.data.taggedUserIds.length > 0;

  const [created] = await db.insert(prayerRequestsTable)
    .values({
      ownerId: sessionUserId,
      body: safeBody,
      isAnonymous: parsed.data.isAnonymous,
      createdByName: owner?.name ?? null,
      kind: parsed.data.kind,
      eventDate,
      eventTitle: parsed.data.kind === "life-event" ? (parsed.data.eventTitle?.trim() || null) : null,
      expiresAt,
      oneTime,
      shareToken,
      directOnly,
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

  // Record which communities this request was scoped to — the actual
  // visibility/push targeting reads this table (see GET /prayer-requests
  // and the fan-out below), not a column on the request row itself.
  if (validGroupIds.length > 0) {
    try {
      await db
        .insert(prayerRequestGroupsTable)
        .values(validGroupIds.map(gid => ({ requestId: created.id, groupId: gid })))
        .onConflictDoNothing();
    } catch (err) {
      console.warn("[prayer] group scoping insert failed (non-fatal):", err);
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
      // Scoped share ("select which communities") → only those groups'
      // members, not the whole garden. Legacy/no-selection share falls
      // back to the old whole-garden fan-out for backward compatibility.
      const gardenIds = validGroupIds.length > 0
        ? await getGroupMemberUserIds(validGroupIds, sessionUserId)
        : await getGardenUserIds(sessionUserId);
      // For a directed ("to a fellow") request, push ONLY to the tagged
      // recipients. Fanning out to the garden would leak the owner's
      // name and the existence of a private request to people who hit a
      // 403 the instant they tap the push — the by-id and list routes
      // both hide directOnly from non-owner/non-tagged viewers, so the
      // ping dead-ends. Mirror those visibility guards here.
      //
      // Otherwise union garden + tagged users so a tagged person who
      // isn't in any shared community still gets the "asking for your
      // prayers" push. Self-tag was already filtered out above when we
      // built validTaggedIds, but we also skip the author here
      // (gardenIds includes them by design — they're the center of
      // their own garden — and we don't want them to push themselves).
      // A fellow should ALWAYS get a fellow's new prayer request — even if the
      // garden's hidden-admin veto or a stale early/legacy connection would have
      // dropped them. Union the raw fellow ids back in. directOnly stays tagged-only.
      const fellowIds = directOnly ? [] : await getFellowUserIds(sessionUserId);
      const recipients = directOnly
        ? Array.from(new Set(validTaggedIds))
        : Array.from(new Set([
            ...gardenIds.filter((id) => id !== sessionUserId),
            ...fellowIds.filter((id) => id !== sessionUserId),
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

  // Auto-flag into the same moderation queue a user report lands in —
  // best-effort, fired async so it doesn't hold up the response. Uses the
  // author's own id as reporterUserId (the schema requires a real user);
  // the reason string is how an admin tells this apart from a real report.
  if (crisisFlagged) {
    db.insert(contentReportsTable).values({
      reporterUserId: sessionUserId,
      kind: "prayer_request",
      targetId: created.id,
      reason: "AUTO: crisis-language pattern matched on creation",
    }).catch((err) => logger.warn({ err, requestId: created.id }, "[prayer-requests] auto-flag insert failed"));
  }

  res.status(201).json({ ...created, crisisFlagged, linksRemoved: hadLinks });
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
    // Same class as /release and /answer: an unsent queued push for THIS
    // recipient (only — other tagged users' queued rows are untouched)
    // used to survive the untag. Removed here, they were held in prayer
    // for a request they'd just been un-tagged from, tapped the push, and
    // hit a 403 on by-id.
    await db.delete(prayerHeldNotificationsTable)
      .where(and(
        eq(prayerHeldNotificationsTable.requestId, id),
        eq(prayerHeldNotificationsTable.recipientId, userId),
        isNull(prayerHeldNotificationsTable.sentAt),
      ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[prayer-requests/tags DELETE] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/prayer-requests/:id/word — leave (or update) a word on a request
router.post("/prayer-requests/:id/word", rateLimit({
  name: "prayer_word_create",
  max: 60,
  windowMs: 60 * 60 * 1000,
  keyFn: byUser,
  message: "You're leaving words very quickly — please slow down a moment.",
}), async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
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
  // A parish "pastoral concern" is private to the requester + parish admins —
  // don't let a guessed id attach a word from anyone else.
  if (request.parishFeedId != null && request.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  // A directed ("to a fellow") request is private — only the owner + tagged
  // recipients can leave a word on it.
  if (request.directOnly && request.ownerId !== sessionUserId) {
    const [tag] = await db.select({ id: prayerRequestTagsTable.id }).from(prayerRequestTagsTable).where(and(
      eq(prayerRequestTagsTable.requestId, id),
      eq(prayerRequestTagsTable.taggedUserId, sessionUserId),
      isNull(prayerRequestTagsTable.removedAt),
    ));
    if (!tag) { res.status(403).json({ error: "Forbidden" }); return; }
  }
  // A PUBLIC (non-parish, non-directed) request is still only visible to the
  // owner's garden — mirror the amen route's gate so a guessed/enumerated id
  // can't attach a word + forge an amen + push a stranger's request.
  if (request.ownerId !== sessionUserId && request.parishFeedId == null && !request.directOnly) {
    const [tag] = await db.select({ id: prayerRequestTagsTable.id }).from(prayerRequestTagsTable).where(and(
      eq(prayerRequestTagsTable.requestId, id),
      eq(prayerRequestTagsTable.taggedUserId, sessionUserId),
      isNull(prayerRequestTagsTable.removedAt),
    ));
    let canSee = !!tag;
    if (!canSee) {
      const gardenIds = await getGardenUserIds(sessionUserId);
      canSee = gardenIds.includes(request.ownerId);
    }
    if (!canSee) {
      const [adopted] = await db.select({ id: adoptedPrayersTable.id }).from(adoptedPrayersTable)
        .where(and(eq(adoptedPrayersTable.requestId, id), eq(adoptedPrayersTable.adopterUserId, sessionUserId)));
      canSee = !!adopted;
    }
    if (!canSee) { res.status(404).json({ error: "Not found" }); return; }
  }

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

  // A word of comfort IS an act of prayer — count it as an amen too, so the
  // commenter shows up in the request's amen total and their own "prayed
  // today" reflects it. Idempotent on the same one-per-user-per-day rule the
  // amen endpoint enforces (judged in the VIEWER's tz, matching the read):
  // insert only when this user has no amen logged today. We deliberately
  // SKIP the amen push cascade (first-amen / third-today / held-in-prayer) —
  // the word push below already tells the owner, so firing amen pushes too
  // would double-notify. Best-effort: a failure here never blocks the word.
  try {
    const [viewerRow] = await db.select({ timezone: usersTable.timezone })
      .from(usersTable).where(eq(usersTable.id, sessionUserId));
    const viewerTz = viewerRow?.timezone || "UTC";
    const viewerYmd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(new Date());
    const myAmens = await db.select({ prayedAt: prayerRequestAmensTable.prayedAt })
      .from(prayerRequestAmensTable)
      .where(and(
        eq(prayerRequestAmensTable.requestId, id),
        eq(prayerRequestAmensTable.userId, sessionUserId),
      ));
    const alreadyAmenedToday = myAmens.some(r =>
      r.prayedAt &&
      new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(r.prayedAt) === viewerYmd);
    if (!alreadyAmenedToday) {
      await db.insert(prayerRequestAmensTable).values({ requestId: id, userId: sessionUserId });
    }
  } catch (err) {
    console.warn("[prayer/word] amen-from-word failed:", err);
  }

  // Merge with the first-amen push when this author is ALSO the request's
  // first amen-er: the recipient already got "the first amen just went up
  // by {Name}" — a separate word banner from the same person reads as a
  // double-tap. The merged word push covers both moments and reuses the
  // first-amen collapse-id so iOS replaces that banner with ONE
  // notification. Scoped to the FIRST insert only — edits keep the plain
  // body + per-author collapse-id so they replace the author's own banner
  // rather than re-announcing a stale "first amen". The condition mirrors
  // firstAmenFire exactly: the request's earliest amen OVERALL is this
  // author's, and the author isn't the owner (owner self-amens never fire
  // a first-amen push, so there'd be nothing to merge with). Best-effort:
  // a lookup failure falls back to the plain word push.
  let mergedFirstAmen = false;
  if (!existing && sessionUserId !== request.ownerId) {
    try {
      const [earliest] = await db.select({ userId: prayerRequestAmensTable.userId })
        .from(prayerRequestAmensTable)
        .where(and(
          eq(prayerRequestAmensTable.requestId, id),
          isNotNull(prayerRequestAmensTable.prayedAt),
        ))
        .orderBy(asc(prayerRequestAmensTable.prayedAt))
        .limit(1);
      mergedFirstAmen = earliest?.userId === sessionUserId;
    } catch (err) {
      console.warn("[prayer/word] first-amen merge lookup failed:", err);
    }
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
      mergedFirstAmen,
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
          mergedFirstAmen,
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

  // Same content-safety pass as creation — an edit is just as capable of
  // introducing a link or crisis language as the original post.
  const { text: safeBody, hadLinks } = stripLinks(parsed.data.body.trim());
  const crisisFlagged = scanForCrisisLanguage(safeBody);
  if (crisisFlagged) {
    db.insert(contentReportsTable).values({
      reporterUserId: sessionUserId,
      kind: "prayer_request",
      targetId: id,
      reason: "AUTO: crisis-language pattern matched on edit",
    }).catch((err) => logger.warn({ err, requestId: id }, "[prayer-requests] auto-flag insert failed (edit)"));
  }

  const [updated] = await db.update(prayerRequestsTable)
    .set({ body: safeBody })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json({ ...updated, crisisFlagged, linksRemoved: hadLinks });
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
  // Same cleanup as /release — see the comment there. An answered request
  // shouldn't go on paging people about amens it already stopped collecting.
  await db.delete(prayerHeldNotificationsTable)
    .where(and(eq(prayerHeldNotificationsTable.requestId, id), isNull(prayerHeldNotificationsTable.sentAt)));
  res.json(updated);
});

/**
 * PATCH /api/prayer-requests/:id/revoke-share — the owner turns their public
 * link off.
 *
 * The schema has said since the column existed that `shareToken: null` "means
 * sharing is disabled (only possible if the owner explicitly revokes the
 * link later)" — no route ever did that. The only ways to kill a link were
 * answering, releasing, or deleting the whole request, none of which fit
 * "I shared this by mistake" or "this got forwarded somewhere I didn't
 * intend, but the request itself should stay up." Nulling the token is
 * enough on its own: both the JSON route and the OG preview select by
 * `shareToken`, so a null token means neither can find the row at all.
 */
router.patch("/prayer-requests/:id/revoke-share", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select({ ownerId: prayerRequestsTable.ownerId }).from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(prayerRequestsTable)
    .set({ shareToken: null })
    .where(eq(prayerRequestsTable.id, id));
  res.json({ ok: true });
});

/**
 * PATCH /api/prayer-requests/:id/re-share — mint a NEW public link.
 *
 * The natural pair to revoke: once a token is null there was also no way
 * to get a fresh one without deleting and recreating the whole request.
 * A new random token, never the old one — revoking is meant to actually
 * kill the address that leaked or got forwarded, not just hide it.
 */
router.patch("/prayer-requests/:id/re-share", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select({ ownerId: prayerRequestsTable.ownerId }).from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const newToken = crypto.randomBytes(12).toString("hex");
  await db.update(prayerRequestsTable)
    .set({ shareToken: newToken })
    .where(eq(prayerRequestsTable.id, id));
  res.json({ ok: true, shareToken: newToken });
});

// POST /api/prayer-requests/:id/event-update — the owner of a life-event request
// shares how it went. The update is stored on the request; on the FIRST update,
// everyone who prayed for it (the amen-ers) gets a "how it went" push. Editing
// it later doesn't re-notify. Owner only.
router.post("/prayer-requests/:id/event-update", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 1000) { res.status(400).json({ error: "Please share a short update." }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const firstUpdate = !request.eventUpdate;
  const [updated] = await db.update(prayerRequestsTable)
    .set({ eventUpdate: text, eventUpdatedAt: new Date() })
    .where(eq(prayerRequestsTable.id, id))
    .returning();

  if (firstUpdate) {
    void (async () => {
      try {
        const rows = await db.select({ userId: prayerRequestAmensTable.userId })
          .from(prayerRequestAmensTable)
          .where(eq(prayerRequestAmensTable.requestId, id));
        const ids = Array.from(new Set(rows.map(r => r.userId))).filter(uid => uid !== sessionUserId);
        if (ids.length === 0) return;
        const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, sessionUserId));
        await sendLifeEventUpdatePush(ids, {
          prayerRequestId: id,
          ownerName: request.isAnonymous ? "Someone" : (owner?.name?.trim() || "Someone"),
          eventTitle: request.eventTitle,
        });
      } catch { /* best-effort */ }
    })();
  }

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

// PATCH/DELETE /api/prayer-requests/:id/mute-in-group — owner: "an admin
// should be able to mute a prayer request from the group." Per-(request,
// group) moderation: a group admin can silence one request from THEIR
// group's view without touching any other group it was also shared to,
// and without muting the requester as a person (that's the separate,
// per-viewer user_mutes feature). Requires an existing
// prayer_request_groups row for (id, groupId) — the request must
// actually be scoped to that group — and requires the caller be an
// admin/hidden_admin member of it.
async function requireGroupAdminForRequest(
  requestId: number,
  groupId: number,
  userId: number,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [scoped] = await db.select({ id: prayerRequestGroupsTable.id })
    .from(prayerRequestGroupsTable)
    .where(and(eq(prayerRequestGroupsTable.requestId, requestId), eq(prayerRequestGroupsTable.groupId, groupId)));
  if (!scoped) return { ok: false, status: 404, error: "Not shared with this group" };
  const [membership] = await db.select({ role: groupMembersTable.role })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, groupId),
      eq(groupMembersTable.userId, userId),
      isNotNull(groupMembersTable.joinedAt),
    ));
  if (!membership || (membership.role !== "admin" && membership.role !== "hidden_admin")) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}

router.patch("/prayer-requests/:id/mute-in-group", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const groupId = parseInt(req.body?.groupId, 10);
  if (isNaN(id) || isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const gate = await requireGroupAdminForRequest(id, groupId, sessionUserId);
  if (!gate.ok) { res.status(gate.status).json({ error: gate.error }); return; }

  await db.update(prayerRequestGroupsTable)
    .set({ mutedAt: new Date(), mutedByUserId: sessionUserId })
    .where(and(eq(prayerRequestGroupsTable.requestId, id), eq(prayerRequestGroupsTable.groupId, groupId)));
  res.json({ ok: true, muted: true });
});

router.delete("/prayer-requests/:id/mute-in-group", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const groupId = parseInt(String(req.body?.groupId ?? req.query.groupId), 10);
  if (isNaN(id) || isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const gate = await requireGroupAdminForRequest(id, groupId, sessionUserId);
  if (!gate.ok) { res.status(gate.status).json({ error: gate.error }); return; }

  await db.update(prayerRequestGroupsTable)
    .set({ mutedAt: null, mutedByUserId: null })
    .where(and(eq(prayerRequestGroupsTable.requestId, id), eq(prayerRequestGroupsTable.groupId, groupId)));
  res.json({ ok: true, muted: false });
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
  /**
   * CLEAR ANYTHING STILL QUEUED to notify about this request.
   *
   * `prayer_held_notifications` rows with `sentAt IS NULL` are picked up by
   * the scanner and pushed later — and neither release nor answer ever
   * touched this table. Owner marks their request answered at 9am; at
   * 10:15 the queued "Sara and 3 others prayed for your request today"
   * push fires anyway, deep-linking to something already closed. Only
   * UNSENT rows are removed — a push that already went out stays as the
   * historical record it is.
   */
  await db.delete(prayerHeldNotificationsTable)
    .where(and(eq(prayerHeldNotificationsTable.requestId, id), isNull(prayerHeldNotificationsTable.sentAt)));
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
// POST /api/prayer-requests/:id/adopt — "Pray along": adopt someone else's
// prayer intention so it joins the viewer's OWN list + daily slideshow going
// forward (it spreads). Idempotent — re-adopting a released one revives it.
router.post("/prayer-requests/:id/adopt", rateLimit({
  name: "prayer_request_adopt",
  max: 120,
  windowMs: 60 * 60 * 1000,
  keyFn: byUser,
  message: "You're praying along very quickly — please slow down a moment.",
}), async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  // You can't adopt your own intention (it's already yours), a closed/answered
  // one, or a private (directed / parish-pastoral) one — those never spread.
  if (request.ownerId === sessionUserId) { res.status(400).json({ error: "Can't pray along with your own prayer" }); return; }
  if (request.closedAt || request.isAnswered) { res.status(400).json({ error: "Request is closed" }); return; }
  if (request.expiresAt && new Date(request.expiresAt) <= new Date()) { res.status(400).json({ error: "This prayer has ended" }); return; }
  if (request.directOnly || request.parishFeedId) { res.status(403).json({ error: "This prayer is private" }); return; }
  // You can only adopt a prayer you can actually SEE — its owner must be in
  // your garden (group peers + correspondents + fellows) or you must be
  // tagged in it. This keeps adopt from bypassing the garden scoping that
  // the list endpoint enforces (no praying-along with a stranger's request
  // by guessing an id).
  const gardenIds = await getGardenUserIds(sessionUserId);
  let canSee = gardenIds.includes(request.ownerId);
  if (!canSee) {
    const [tag] = await db.select({ id: prayerRequestTagsTable.id })
      .from(prayerRequestTagsTable)
      .where(and(
        eq(prayerRequestTagsTable.requestId, id),
        eq(prayerRequestTagsTable.taggedUserId, sessionUserId),
        isNull(prayerRequestTagsTable.removedAt),
      ));
    canSee = !!tag;
  }
  if (!canSee) { res.status(404).json({ error: "Not found" }); return; }

  // Upsert against the (request, adopter) unique index — insert a fresh
  // adoption or revive a previously-released one.
  await db.insert(adoptedPrayersTable)
    .values({ requestId: id, adopterUserId: sessionUserId })
    .onConflictDoUpdate({
      target: [adoptedPrayersTable.requestId, adoptedPrayersTable.adopterUserId],
      set: { releasedAt: null, adoptedAt: new Date() },
    });

  // How many people are now carrying this (active), so the client can show
  // "N praying along" without a refetch.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(adoptedPrayersTable)
    .where(and(eq(adoptedPrayersTable.requestId, id), isNull(adoptedPrayersTable.releasedAt)));
  res.json({ ok: true, adopted: true, adoptCount: n });
});

// POST /api/prayer-requests/:id/release — stop carrying an adopted prayer.
router.post("/prayer-requests/:id/release", rateLimit({
  name: "prayer_request_release",
  max: 120,
  windowMs: 60 * 60 * 1000,
  keyFn: byUser,
  message: "You're updating very quickly — please slow down a moment.",
}), async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(adoptedPrayersTable)
    .set({ releasedAt: new Date() })
    .where(and(
      eq(adoptedPrayersTable.requestId, id),
      eq(adoptedPrayersTable.adopterUserId, sessionUserId),
      isNull(adoptedPrayersTable.releasedAt),
    ));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(adoptedPrayersTable)
    .where(and(eq(adoptedPrayersTable.requestId, id), isNull(adoptedPrayersTable.releasedAt)));
  res.json({ ok: true, adopted: false, adoptCount: n });
});

router.post("/prayer-requests/:id/amen", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.closedAt) { res.status(400).json({ error: "Request is closed" }); return; }
  // Visibility gate (mirrors the list scoping) — a logged-in user can only amen
  // a request they can actually SEE, so ids can't be enumerated to amen (and
  // push-notify + geotag) a private directed/parish intention. The owner can
  // always amen their own.
  if (request.ownerId !== sessionUserId) {
    // Parish "pastoral concern" → private to the requester; nobody else amens.
    if (request.parishFeedId) { res.status(404).json({ error: "Not found" }); return; }
    // Tagged recipient? (the only way to see a directed request.)
    const [tag] = await db.select({ id: prayerRequestTagsTable.id })
      .from(prayerRequestTagsTable)
      .where(and(
        eq(prayerRequestTagsTable.requestId, id),
        eq(prayerRequestTagsTable.taggedUserId, sessionUserId),
        isNull(prayerRequestTagsTable.removedAt),
      ));
    let canSee = !!tag;
    if (!canSee && !request.directOnly) {
      // Public request → its owner must be in my garden, or I've adopted it.
      const gardenIds = await getGardenUserIds(sessionUserId);
      canSee = gardenIds.includes(request.ownerId);
      if (!canSee) {
        const [adopted] = await db.select({ id: adoptedPrayersTable.id })
          .from(adoptedPrayersTable)
          .where(and(eq(adoptedPrayersTable.requestId, id), eq(adoptedPrayersTable.adopterUserId, sessionUserId)));
        canSee = !!adopted;
      }
    }
    if (!canSee) { res.status(404).json({ error: "Not found" }); return; }
  }
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
  // Before the insert we read (a) the earliest amen ever, (b) the viewer's own
  // amens, and (c) the last 48h of amens — enough to distinguish "first ever"
  // from "user is back later in the day" and compute today's distinct-user
  // count, without loading the request's entire amen history.
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
    // Owner + viewer timezones, the viewer's OWN amens on this request, the
    // earliest amen ever (indexed asc LIMIT 1), and the last 48h of amens — all
    // fired concurrently. This replaces a single UNBOUNDED load of every amen
    // row on the request (which grew without limit on a viral request, on the
    // per-tap POST path). Each replacement is bounded: the viewer's own rows by
    // their history; the earliest is one indexed row; and the 48h window fully
    // covers "today in the owner's tz" (which can't reach further back than
    // ~38h). The tz math below is byte-for-byte the same, just over these sets.
    const amenNowMs = Date.now();
    const [ownerRows, viewerRows, viewerAmenRows, earliestRows, recentAmenRows] = await Promise.all([
      db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, request.ownerId)),
      db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, sessionUserId)),
      db.select({ prayedAt: prayerRequestAmensTable.prayedAt })
        .from(prayerRequestAmensTable)
        .where(and(
          eq(prayerRequestAmensTable.requestId, id),
          eq(prayerRequestAmensTable.userId, sessionUserId),
        )),
      db.select({ prayedAt: prayerRequestAmensTable.prayedAt })
        .from(prayerRequestAmensTable)
        .where(eq(prayerRequestAmensTable.requestId, id))
        .orderBy(asc(prayerRequestAmensTable.prayedAt))
        .limit(1),
      db.select({ userId: prayerRequestAmensTable.userId, prayedAt: prayerRequestAmensTable.prayedAt })
        .from(prayerRequestAmensTable)
        .where(and(
          eq(prayerRequestAmensTable.requestId, id),
          gt(prayerRequestAmensTable.prayedAt, new Date(amenNowMs - 48 * 60 * 60 * 1000)),
        )),
    ]);

    const ownerTz = ownerRows[0]?.timezone || "UTC";
    ownerLocalYmd = new Intl.DateTimeFormat("en-CA", { timeZone: ownerTz }).format(new Date());

    // The "have I already prayed this today" throttle must be judged on the
    // VIEWER's calendar day — same tz the read (myAmenedToday) uses — or the
    // two disagree across a tz boundary (the throttle blocks the insert while
    // the read still shows "not prayed" → a permanently-uncheckable card).
    const viewerTz = viewerRows[0]?.timezone || "UTC";
    const viewerYmd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(new Date());

    // Throttle: skip the insert if this user has already logged an amen on this
    // request today (the viewer's tz). One amen per person per request per day —
    // the client keeps its ✓ regardless; the row just doesn't double-count.
    let myAmensToday = 0;
    for (const r of viewerAmenRows) {
      if (!r.prayedAt) continue;
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(r.prayedAt);
      if (ymd === viewerYmd) myAmensToday += 1;
    }
    if (myAmensToday >= AMEN_DAILY_CAP) {
      // Already prayed today — tell the client so its ✓ is never wrong.
      res.json({ ok: true, throttled: true, reason: "daily-cap", myAmenedToday: true });
      return;
    }

    // No amen row at all → this insert is the request's first-ever amen.
    firstAmenFire = earliestRows.length === 0;

    // Distinct users who already amened today (in owner's tz) BEFORE
    // this insert. If this insert adds a NEW user-day pair AND the
    // pre-count was exactly 2, we just hit 3 → fire. The 48h window fully
    // contains the owner's local today, so this set is complete.
    const distinctTodayBefore = new Set<number>();
    let sessionAlreadyToday = false;
    for (const r of recentAmenRows) {
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
    const earliestPrior = earliestRows[0]?.prayedAt ?? null;
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
      recentAmenCount: recentAmenRows.length,
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
    // If this first amen-er already left a word of comfort on the request,
    // the owner just got a "{Name} prayed for you" word push — merge the
    // two into ONE notification (merged body + the word push's collapse-id
    // so iOS replaces it) instead of stacking a second banner. PRIVATE
    // words are excluded: the same opts fan out to tagged users, who can't
    // see a private word — advertising one would leak that it exists.
    let withWordFromUserId: number | undefined;
    try {
      const [existingWord] = await db.select({ id: prayerWordsTable.id })
        .from(prayerWordsTable)
        .where(and(
          eq(prayerWordsTable.requestId, id),
          eq(prayerWordsTable.authorUserId, sessionUserId),
          eq(prayerWordsTable.isPrivate, false),
        ))
        .limit(1);
      if (existingWord) withWordFromUserId = sessionUserId;
    } catch (err) {
      console.warn("[prayer/amen] word merge lookup failed:", err);
    }
    sendFirstAmenPush(request.ownerId, {
      prayerRequestId: id,
      prayerName,
      withWordFromUserId,
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
            withWordFromUserId,
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

// ── Home-screen layout ───────────────────────────────────────────────
// Backs the Customize page (reached from the "Customize" pill on the
// home screen). Body: { order: string[], hidden: string[] } where each
// entry is a known home-module key. We validate against the allowed set
// and ensure `order` is a complete permutation so the dashboard never
// drops a module it doesn't know how to place. Returns the saved layout.
// Keep this list in sync with HOME_MODULES in customize-home.tsx and
// dashboard.tsx — any key not in this set is silently dropped from the
// stored order/hidden arrays, which presents in the UI as "the toggle
// doesn't do anything." (Earlier this list was 4 keys and gratitude /
// examen rows on /customize-home couldn't be turned on at all because
// the server kept stripping them out on the way to the DB.)
// Keep in sync with HOME_MODULES in mymonastery/pages/customize-home.tsx —
// anything missing here is SILENTLY STRIPPED from a saved layout, which is how
// a reflection can be chosen in the customizer and be gone on the next load.
router.put("/me/home-layout", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = req.body as { order?: unknown; hidden?: unknown; v?: unknown };
  const order = Array.isArray(body.order) ? body.order.filter((k): k is string => typeof k === "string") : null;
  const hidden = Array.isArray(body.hidden) ? body.hidden.filter((k): k is string => typeof k === "string") : [];
  // Layout version (client constant). Stored so a global default reset can be
  // rolled out by bumping the version: the client treats any saved layout whose
  // `v` is below the current version as "use the new default" (see dashboard /
  // customize-home), then a re-save stamps the new version. No DB migration.
  const v = typeof body.v === "number" ? body.v : undefined;
  if (!order) { res.status(400).json({ error: "order must be an array" }); return; }
  const allowed = new Set<string>(HOME_MODULE_KEYS);
  // Keep only known keys, dedupe, then append any missing keys so the
  // stored order is always a full permutation of the module set.
  const seen = new Set<string>();
  const cleanOrder = order.filter((k) => allowed.has(k) && !seen.has(k) && (seen.add(k), true));
  /**
   * A MODULE THIS LAYOUT HAS NEVER HEARD OF ARRIVES HIDDEN.
   *
   * Backfilling keeps `order` a full permutation of the module set, which is
   * what the client's reconciliation expects. But a card is VISIBLE when it
   * is in `order` and absent from `hidden` — so backfilling alone turns every
   * newly-added module on for every existing user the next time they save
   * anything. That is how Taizé would have appeared unbidden on the home
   * screen of everyone who has ever customized their layout.
   *
   * Being absent from the incoming `order` already means "not visible" — a
   * client cannot ask for a visible card without ordering it — so recording
   * that as hidden says exactly what the layout meant, and every module added
   * after this one defaults off rather than on.
   */
  const backfilled: string[] = [];
  for (const k of HOME_MODULE_KEYS) if (!seen.has(k)) { cleanOrder.push(k); backfilled.push(k); }
  let cleanHidden = [...new Set([...hidden.filter((k) => allowed.has(k)), ...backfilled])];
  // Never hide every module — that would leave the home's anchor area
  // blank. If a request would hide all of them, drop the first module in
  // order from the hidden set so at least one card always leads. (The
  // client already guards this; this is server-side defense-in-depth.)
  if (cleanHidden.length >= cleanOrder.length) {
    cleanHidden = cleanHidden.filter((k) => k !== cleanOrder[0]);
  }
  const layout = { order: cleanOrder, hidden: cleanHidden, ...(v !== undefined ? { v } : {}) };
  try {
    await db.update(usersTable).set({ homeLayout: layout }).where(eq(usersTable.id, sessionUserId));
    res.json(layout);
  } catch (err) {
    console.error("[/me/home-layout PUT] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Custom rituals (user-defined daily anchors) ──────────────────────────────
// Backs lib/customAnchors server sync so a person's rituals are their DATA and
// show on every device, not just where they were created.
//
// NON-DESTRUCTIVE MERGE (the invariant: a push can NEVER delete a user's cards).
// The server is the durable source of truth and MERGES the incoming snapshot
// with what's already stored — it never blind-replaces. Concretely:
//   • defs union BY ID — an id present on the server is NEVER dropped just
//     because the incoming push omits it (a cleared cache / private mode /
//     stale device / cross-user-leak push exports an empty or partial list;
//     none of those can shrink the stored set).
//   • the ONLY way an anchor leaves is an explicit TOMBSTONE: the client sends
//     `deletedIds` for anchors the user actually removed; we record a tombstone
//     and exclude that id forever after (so a later union from another device
//     can't resurrect it). Absence ≠ deletion.
//   • per-day `log` state merges field-wise, most-recent-wins (never lets a
//     stale server entry wipe a fresh local "done", and vice-versa).
// Stored shape: { defs, log, tombstones: {id: ts}, updatedAt }.
type CASnap = { defs?: unknown; log?: unknown; tombstones?: unknown; updatedAt?: unknown; deletedIds?: unknown };
type CALog = { done?: string; skip?: string; readToday?: string; readTotal?: number };
const caLaterStamp = (a?: string, b?: string): string | undefined => (a && b ? (a >= b ? a : b) : a || b);
const caLaterReadToday = (a?: string, b?: string): string | undefined => {
  if (!a) return b; if (!b) return a;
  const ay = a.split("|")[0]; const by = b.split("|")[0];
  return ay !== by ? (ay > by ? a : b) : a;
};
function caMergeLog(l: CALog | undefined, s: CALog | undefined): CALog {
  const e: CALog = {};
  const done = caLaterStamp(l?.done, s?.done);
  const skip = caLaterStamp(l?.skip, s?.skip);
  if (done) e.done = done;
  // The client's mergeLogEntry twin carries the reasoning: comparing the two
  // stamps for equality assumed both were today's date, and a weekly practice
  // stamps `done` with the week's closing Sunday — so both survived on six
  // days in seven, and `skipped` wins every filter downstream.
  if (skip && !done) e.skip = skip;
  const rt = caLaterReadToday(l?.readToday, s?.readToday);
  if (rt) e.readToday = rt;
  const total = Math.max(l?.readTotal ?? 0, s?.readTotal ?? 0);
  if (total > 0) e.readTotal = total;
  return e;
}
function mergeCustomAnchors(existing: CASnap | null | undefined, incoming: CASnap) {
  const exDefs = Array.isArray(existing?.defs) ? (existing!.defs as Array<{ id?: unknown }>) : [];
  const inDefs = Array.isArray(incoming.defs) ? (incoming.defs as Array<{ id?: unknown }>) : [];
  const exLog = (existing?.log && typeof existing.log === "object") ? existing!.log as Record<string, CALog> : {};
  const inLog = (incoming.log && typeof incoming.log === "object") ? incoming.log as Record<string, CALog> : {};
  const now = Date.now();
  // Tombstones: keep existing, add any the incoming push declares (deletedIds),
  // plus re-assert any tombstones the incoming snapshot carries (a device that
  // learned a delete echoes it).
  const tombstones: Record<string, number> = {};
  const exTomb = (existing?.tombstones && typeof existing.tombstones === "object") ? existing!.tombstones as Record<string, number> : {};
  for (const [id, ts] of Object.entries(exTomb)) if (typeof ts === "number") tombstones[id] = ts;
  if (incoming.tombstones && typeof incoming.tombstones === "object") {
    for (const [id, ts] of Object.entries(incoming.tombstones as Record<string, unknown>)) if (typeof ts === "number" && !tombstones[id]) tombstones[id] = ts;
  }
  if (Array.isArray(incoming.deletedIds)) {
    for (const id of incoming.deletedIds) if (typeof id === "string" && !tombstones[id]) tombstones[id] = now;
  }
  // defs: union by id (existing first, incoming overrides shared ids = latest
  // edit), then drop anything tombstoned. Never drops on mere absence.
  const byId = new Map<string, { id?: unknown }>();
  for (const d of exDefs) { const id = (d as { id?: unknown }).id; if (typeof id === "string") byId.set(id, d); }
  for (const d of inDefs) { const id = (d as { id?: unknown }).id; if (typeof id === "string") byId.set(id, d); }
  let defs = Array.from(byId.values()).filter((d) => !tombstones[(d as { id?: unknown }).id as string]);
  if (defs.length > 64) defs = defs.slice(0, 64);
  const liveIds = new Set(defs.map((d) => (d as { id?: unknown }).id as string));
  // log: field-wise most-recent-wins, pruned to live anchors (bounds growth).
  const log: Record<string, CALog> = {};
  for (const id of new Set([...Object.keys(exLog), ...Object.keys(inLog)])) {
    if (!liveIds.has(id)) continue;
    log[id] = caMergeLog(exLog[id], inLog[id]);
  }
  // Prune tombstones to the most recent (bounds growth); keep newest 256.
  const tombEntries = Object.entries(tombstones).sort((a, b) => b[1] - a[1]).slice(0, 256);
  const prunedTomb: Record<string, number> = {};
  for (const [id, ts] of tombEntries) prunedTomb[id] = ts;
  return {
    defs,
    log,
    tombstones: prunedTomb,
    updatedAt: typeof incoming.updatedAt === "number" ? incoming.updatedAt : now,
  };
}
router.put("/me/custom-anchors", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = req.body as CASnap;
  if (!body || !Array.isArray(body.defs)) { res.status(400).json({ error: "defs must be an array" }); return; }
  if (body.defs.length > 64) { res.status(400).json({ error: "too many rituals" }); return; }
  try {
    // Read-merge-write: the stored row is authoritative; we union the incoming
    // snapshot into it so a push can never delete a card (only a tombstone can).
    const [row] = await db.select({ ca: usersTable.customAnchors }).from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);
    const merged = mergeCustomAnchors(row?.ca as CASnap | null | undefined, body);
    if (JSON.stringify(merged).length > 96_000) { res.status(413).json({ error: "snapshot too large" }); return; }
    await db.update(usersTable).set({ customAnchors: merged }).where(eq(usersTable.id, sessionUserId));
    // Return the merged snapshot so the client can reconcile to server truth.
    res.json({ ok: true, customAnchors: merged });
  } catch (err) {
    console.error("[/me/custom-anchors PUT] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * THE ORDER PEOPLE PRAY IN — one person's recent opening sequences up, and
 * the shape across everyone back down (owner: "ordering based on tracking in
 * what order the user is opening the cards", and "use this data to see
 * patterns across users through feeding it into the api").
 *
 * What travels is practice KEYS and dates. Not a word of anything prayed,
 * read or written — the sequence of cards someone tapped, which is what an
 * order can be learned from and is the least that can answer the question.
 */
router.put("/me/practice-open-log", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "not_authenticated" }); return; }
  const body = req.body as { days?: unknown };
  if (!Array.isArray(body?.days)) { res.status(400).json({ error: "days must be an array" }); return; }
  // Validate rather than trust: dated rows of string keys, bounded on every
  // axis so a malformed or hostile client can't grow the column without limit.
  const days = body.days
    .filter((d): d is { ymd: string; keys: string[] } =>
      !!d && typeof (d as { ymd?: unknown }).ymd === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test((d as { ymd: string }).ymd)
      && Array.isArray((d as { keys?: unknown }).keys))
    .map((d) => ({
      ymd: d.ymd,
      keys: d.keys.filter((k): k is string => typeof k === "string" && k.length <= 64).slice(0, 32),
    }))
    .slice(-31);
  try {
    await db.update(usersTable).set({ practiceOpenLog: days }).where(eq(usersTable.id, sessionUserId));
    res.json({ ok: true, days: days.length });
  } catch (err) {
    console.error("[/me/practice-open-log PUT] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * The pattern ACROSS people — super-admin only, and aggregate by construction:
 * it answers "where in the day does this practice tend to sit, and how often
 * does it get opened at all", never "what did this person do". Rows are counted
 * across accounts and the per-account sequences never leave the server.
 */
router.get("/admin/practice-order-patterns", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "not_authenticated" }); return; }
  if (!(await isSuperAdminUser(sessionUserId))) { res.status(403).json({ error: "forbidden" }); return; }
  try {
    const rows = await db
      .select({ log: usersTable.practiceOpenLog })
      .from(usersTable)
      .where(sql`${usersTable.practiceOpenLog} IS NOT NULL`);
    const agg = new Map<string, { opens: number; posSum: number; people: Set<number> }>();
    let people = 0;
    rows.forEach((r, idx) => {
      const log = (r.log ?? []) as Array<{ ymd: string; keys: string[] }>;
      if (log.length === 0) return;
      people += 1;
      for (const d of log) {
        d.keys.forEach((k, i) => {
          const cur = agg.get(k) ?? { opens: 0, posSum: 0, people: new Set<number>() };
          cur.opens += 1;
          cur.posSum += i;
          cur.people.add(idx);
          agg.set(k, cur);
        });
      }
    });
    const practices = [...agg.entries()]
      .map(([key, v]) => ({
        key,
        opens: v.opens,
        people: v.people.size,
        meanPosition: Number((v.posSum / v.opens).toFixed(2)),
      }))
      // A practice only one or two people open says nothing about a pattern,
      // and naming it starts to describe individuals rather than a shape.
      .filter((p) => p.people >= 3)
      .sort((a, b) => a.meanPosition - b.meanPosition);
    res.json({ people, practices });
  } catch (err) {
    console.error("[/admin/practice-order-patterns] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Routine config (per-side office levels, slots, etc.) ─────────────────────
// A single synced blob of the routine's per-device localStorage SETTINGS so the
// rhythm matches across devices (mirrors custom-anchors above, but the values
// are plain strings, so the merge is last-write-wins by `updatedAt` rather than
// a field union). The client owns the key/value shape (lib/routineSync).
router.put("/me/rule-config", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = req.body as { values?: unknown; updatedAt?: unknown };
  const rawValues = (body && typeof body.values === "object" && body.values && !Array.isArray(body.values))
    ? (body.values as Record<string, unknown>) : null;
  if (!rawValues) { res.status(400).json({ error: "values must be an object" }); return; }
  /**
   * Keep only sane string→string entries (cap count + lengths).
   *
   * The count cap was 64 and ROUTINE_KEYS had reached 63 — one key from
   * silently truncating people's rules. And it truncates in ROUTINE_KEYS
   * order, so the loss would have been invisible: the keys that fell off the
   * end are the ones nothing immediately reads, and no error is raised
   * anywhere. The real guard against a runaway payload is the 32KB size check
   * below, which is measured on the actual bytes; this is only here to stop an
   * unbounded key count, so it can be generous.
   */
  const values: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(rawValues)) {
    if (n >= 300) break;
    if (typeof k === "string" && k.length <= 80 && typeof v === "string" && v.length <= 8000) { values[k] = v; n++; }
  }
  const clientAt = typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt) ? body.updatedAt : Date.now();
  // Clamp to server time. A device whose clock is set to the future would
  // otherwise stamp a far-future updatedAt that permanently wins last-write-wins:
  // thereafter every legitimate push (now < stored) is rejected and the frozen
  // blob is re-adopted, leaving the routine un-syncable across devices until that
  // wall-clock time actually arrives. Never trust a client timestamp ahead of now.
  const updatedAt = Math.min(clientAt, Date.now());
  try {
    // Last-write-wins: a stale push from an older device can't clobber a newer
    // stored config. If stored is newer, keep it and echo it back to reconcile.
    const [row] = await db.select({ rc: usersTable.ruleConfig }).from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);
    const stored = row?.rc as { values: Record<string, string>; updatedAt: number } | null | undefined;
    if (stored && typeof stored.updatedAt === "number" && stored.updatedAt > updatedAt) {
      res.json({ ok: true, ruleConfig: stored });
      return;
    }
    const next = { values, updatedAt };
    if (JSON.stringify(next).length > 32_000) { res.status(413).json({ error: "config too large" }); return; }
    await db.update(usersTable).set({ ruleConfig: next }).where(eq(usersTable.id, sessionUserId));
    res.json({ ok: true, ruleConfig: next });
  } catch (err) {
    console.error("[/me/rule-config PUT] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Phone sabbath (rest days) ────────────────────────────────────────────────
// Weekday numbers (0=Sun..6=Sat) the user rests from their phone. On those days
// fellows see a calm "on a sabbath" state instead of "fell behind". Body:
// { days: number[] }.
router.put("/me/rest-days", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = (req.body as { days?: unknown })?.days;
  if (!Array.isArray(raw)) { res.status(400).json({ error: "days must be an array" }); return; }
  const days = [...new Set(raw.filter((d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  try {
    await db.update(usersTable).set({ restDays: days }).where(eq(usersTable.id, sessionUserId));
    res.json({ days });
  } catch (err) {
    console.error("[/me/rest-days PUT] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Master notifications switch ──────────────────────────────────────
// Settings → Notifications. Body: { enabled: boolean }. When off,
// sendPushToUser suppresses every push for this user. Returns the saved
// value; /auth/me also carries pushEnabled so the toggle reads its
// current state.
router.put("/me/notifications-pref", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  try {
    await db.update(usersTable).set({ pushEnabled: enabled }).where(eq(usersTable.id, sessionUserId));
    res.json({ pushEnabled: enabled });
  } catch (err) {
    console.error("[/me/notifications-pref PUT] failed:", err);
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
        directOnly: prayerRequestsTable.directOnly,
        parishFeedId: prayerRequestsTable.parishFeedId,
      })
      .from(prayerRequestsTable)
      .where(eq(prayerRequestsTable.shareToken, token));

    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    if (row.closedAt || row.isAnswered) {
      // Treat closed/answered as gone — the owner shouldn't have a
      // shareable link to a request they've already wrapped up.
      res.status(404).json({ error: "Not found" }); return;
    }
    // A request that has RELEASED by expiry, not by the owner closing it,
    // was missing here entirely — `closedAt` is deliberately left null on
    // expiry (the owner still gets the "renew or let it close" popup), so
    // this check never treated an expired request as gone. The share link
    // therefore stayed world-readable indefinitely past its own "released"
    // state, for as long as the owner didn't happen to reopen the app.
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      res.status(404).json({ error: "Not found" }); return;
    }
    // A directed ("to a fellow") request is private — never publicly shareable.
    if (row.directOnly) { res.status(404).json({ error: "Not found" }); return; }
    // A parish "pastoral concern" is private to the requester + parish admins and
    // must NEVER be world-readable by token — defense-in-depth so a concern that
    // ever acquires a shareToken (future path / data copy) can't leak its body.
    if (row.parishFeedId != null) { res.status(404).json({ error: "Not found" }); return; }

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

    const daysLeftRaw = row.expiresAt
      ? Math.max(0, Math.ceil((row.expiresAt.getTime() - Date.now()) / 86_400_000))
      : null;
    // "Ongoing" requests carry a ~100-year expiry sentinel — don't surface that
    // as a giant "36500 days left" countdown on the public share page.
    const daysLeft = daysLeftRaw != null && daysLeftRaw > 365 ? null : daysLeftRaw;

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

router.post("/prayer-requests/share/:token/amen", rateLimit({
  // Unauthenticated + client-chosen sessionId: without a cap, a script could
  // insert unbounded anonymous_amens rows and inflate a share token's
  // prayedCount. Key by IP (genuine prayers come from many different IPs, so
  // this only blunts single-source flooding). Generous for real link-sharing.
  name: "share_amen",
  max: 40,
  windowMs: 60 * 60 * 1000,
  message: "Too many amens from this device. Please try again later.",
}), async (req, res): Promise<void> => {
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
      .select({ id: prayerRequestsTable.id, ownerId: prayerRequestsTable.ownerId, directOnly: prayerRequestsTable.directOnly })
      .from(prayerRequestsTable)
      .where(eq(prayerRequestsTable.shareToken, token));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    // A directed ("to a fellow") request is private — no public-link amens.
    if (row.directOnly) { res.status(404).json({ error: "Not found" }); return; }

    const viewerUserId = req.user ? (req.user as { id: number }).id : null;

    if (viewerUserId) {
      // Authenticated viewer — treat this exactly like the in-app amen
      // endpoint's daily-cap throttle. There is no unique constraint on
      // (request_id, user_id) — the table is deliberately unbounded so the
      // same user amening across days still accrues (see the schema
      // comment) — so onConflictDoNothing() here was a no-op: every tap
      // through the share link inserted a fresh row, letting a visitor
      // bypass the one-amen-per-day cap the in-app route enforces just by
      // reloading the public page. Apply the same viewer-tz "already
      // amened today" check before inserting.
      const [viewerRow, viewerAmenRows] = await Promise.all([
        db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, viewerUserId)),
        db.select({ prayedAt: prayerRequestAmensTable.prayedAt })
          .from(prayerRequestAmensTable)
          .where(and(
            eq(prayerRequestAmensTable.requestId, row.id),
            eq(prayerRequestAmensTable.userId, viewerUserId),
          )),
      ]);
      const viewerTz = viewerRow[0]?.timezone || "UTC";
      const viewerYmd = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(new Date());
      const alreadyAmenedToday = viewerAmenRows.some(r =>
        r.prayedAt && new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(r.prayedAt) === viewerYmd);
      if (alreadyAmenedToday) {
        res.json({ ok: true, claimed: true, throttled: true });
        return;
      }
      await db
        .insert(prayerRequestAmensTable)
        .values({ requestId: row.id, userId: viewerUserId });
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

export default router;
