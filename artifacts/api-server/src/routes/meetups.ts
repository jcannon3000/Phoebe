import { Router, type IRouter } from "express";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  meetupsTable,
  meetupRsvpsTable,
  ritualsTable,
  ritualGroupsTable,
  groupMembersTable,
  usersTable,
} from "@workspace/db";

// ─── Meetup RSVPs ─────────────────────────────────────────────────────────────
//
// Going / Maybe RSVPs on gathering meetups. Mirrors the action_rsvps
// model: one row per (meetup, user); clearing your RSVP deletes the
// row (absence speaks for "not going").
//
// Routes:
//   PUT    /api/meetups/:id/rsvp   { status: "going" | "maybe" }
//   DELETE /api/meetups/:id/rsvp
//   GET    /api/meetups/:id/rsvps  → { going: [...], maybe: [...] }
//
// Authorization: the caller must be a joined member of the ritual's
// group (when the ritual has one), OR the ritual's owner if it's
// personal. RSVPs on personal-only rituals are allowed for the owner
// so the same flow doesn't break for solo gatherings.

const router: IRouter = Router();

type SessionUser = { id: number; email: string; name: string };

function getUser(req: import("express").Request): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

// Returns the meetup + ritual + whether the caller may RSVP. Three
// outcomes are encoded:
//   • notFound       — no such meetup
//   • forbidden      — meetup exists, but caller can't see it
//   • ok + meetup    — proceed
async function authorizeMeetupAccess(
  meetupId: number,
  userId: number,
): Promise<
  | { kind: "notFound" }
  | { kind: "forbidden" }
  | {
      kind: "ok";
      meetup: typeof meetupsTable.$inferSelect;
      ritual: typeof ritualsTable.$inferSelect;
    }
> {
  const [meetup] = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.id, meetupId))
    .limit(1);
  if (!meetup) return { kind: "notFound" };

  const [ritual] = await db
    .select()
    .from(ritualsTable)
    .where(eq(ritualsTable.id, meetup.ritualId))
    .limit(1);
  if (!ritual) return { kind: "notFound" };

  // Personal ritual: only the owner can RSVP (this is mostly a noop
  // case — solo rituals don't really need RSVPs — but it preserves
  // symmetry and avoids leaking solo-ritual meetup ids).
  if (ritual.groupId == null) {
    if (ritual.ownerId === userId) {
      return { kind: "ok", meetup, ritual };
    }
    return { kind: "forbidden" };
  }

  // Group ritual: caller must be a joined member of ANY linked
  // community — the primary host on ritualsTable.groupId OR any
  // additional community in ritualGroupsTable. IS DISTINCT FROM in
  // the gather-helpers handles rows with NULL role; here we just
  // check joinedAt + a userId match, which is enough for the access
  // gate (hidden admins included intentionally — observers may want
  // to attend).
  const linkedGroupIds = new Set<number>([ritual.groupId]);
  try {
    const extra = await db
      .select({ groupId: ritualGroupsTable.groupId })
      .from(ritualGroupsTable)
      .where(eq(ritualGroupsTable.ritualId, ritual.id));
    for (const r of extra) linkedGroupIds.add(r.groupId);
  } catch {
    // ritual_groups may not exist on a fresh schema; fall through with
    // just the primary host (current behavior).
  }

  const [membership] = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(
      and(
        inArray(groupMembersTable.groupId, Array.from(linkedGroupIds)),
        eq(groupMembersTable.userId, userId),
        isNotNull(groupMembersTable.joinedAt),
      ),
    )
    .limit(1);
  if (!membership) return { kind: "forbidden" };
  return { kind: "ok", meetup, ritual };
}

// PUT /api/meetups/:id/rsvp — upsert the caller's RSVP.
router.put("/meetups/:id/rsvp", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const meetupId = Number(req.params.id);
  if (!Number.isFinite(meetupId) || meetupId <= 0) {
    res.status(400).json({ error: "Invalid meetup id" }); return;
  }

  const parsed = z
    .object({ status: z.enum(["going", "maybe"]) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "status must be 'going' or 'maybe'" });
    return;
  }
  const { status } = parsed.data;

  const access = await authorizeMeetupAccess(meetupId, user.id);
  if (access.kind === "notFound") { res.status(404).json({ error: "Meetup not found" }); return; }
  if (access.kind === "forbidden") { res.status(403).json({ error: "Not a member of this gathering's community" }); return; }

  try {
    // Upsert via insert-on-conflict so the round-trip is atomic and
    // updatedAt advances when status flips (going → maybe etc.).
    await db
      .insert(meetupRsvpsTable)
      .values({ meetupId, userId: user.id, status })
      .onConflictDoUpdate({
        target: [meetupRsvpsTable.meetupId, meetupRsvpsTable.userId],
        set: { status, updatedAt: new Date() },
      });
    res.json({ ok: true, status });
  } catch (err) {
    console.error("PUT /api/meetups/:id/rsvp error:", err);
    res.status(500).json({ error: "Failed to save RSVP" });
  }
});

// DELETE /api/meetups/:id/rsvp — clear the caller's RSVP (i.e. "no
// longer going / maybe"). Absence-as-not-going matches action_rsvps.
router.delete("/meetups/:id/rsvp", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const meetupId = Number(req.params.id);
  if (!Number.isFinite(meetupId) || meetupId <= 0) {
    res.status(400).json({ error: "Invalid meetup id" }); return;
  }

  const access = await authorizeMeetupAccess(meetupId, user.id);
  if (access.kind === "notFound") { res.status(404).json({ error: "Meetup not found" }); return; }
  if (access.kind === "forbidden") { res.status(403).json({ error: "Not a member of this gathering's community" }); return; }

  try {
    await db
      .delete(meetupRsvpsTable)
      .where(
        and(
          eq(meetupRsvpsTable.meetupId, meetupId),
          eq(meetupRsvpsTable.userId, user.id),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/meetups/:id/rsvp error:", err);
    res.status(500).json({ error: "Failed to clear RSVP" });
  }
});

// GET /api/meetups/:id/rsvps — list everyone going + maybe. Returned
// shape lines up with how the dashboard card and detail page render
// (separate going / maybe buckets, name + avatar per person).
router.get("/meetups/:id/rsvps", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const meetupId = Number(req.params.id);
  if (!Number.isFinite(meetupId) || meetupId <= 0) {
    res.status(400).json({ error: "Invalid meetup id" }); return;
  }

  const access = await authorizeMeetupAccess(meetupId, user.id);
  if (access.kind === "notFound") { res.status(404).json({ error: "Meetup not found" }); return; }
  if (access.kind === "forbidden") { res.status(403).json({ error: "Not a member of this gathering's community" }); return; }

  try {
    const rows = await db
      .select({
        userId: meetupRsvpsTable.userId,
        status: meetupRsvpsTable.status,
        respondedAt: meetupRsvpsTable.updatedAt,
        name: usersTable.name,
        email: usersTable.email,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(meetupRsvpsTable)
      .innerJoin(usersTable, eq(usersTable.id, meetupRsvpsTable.userId))
      .where(eq(meetupRsvpsTable.meetupId, meetupId))
      .orderBy(meetupRsvpsTable.updatedAt);

    const yours = rows.find((r) => r.userId === user.id);
    res.json({
      yourStatus: yours?.status ?? null,
      going: rows.filter((r) => r.status === "going").map(stripEmailIfNotSelf(user.id)),
      maybe: rows.filter((r) => r.status === "maybe").map(stripEmailIfNotSelf(user.id)),
    });
  } catch (err) {
    console.error("GET /api/meetups/:id/rsvps error:", err);
    res.status(500).json({ error: "Failed to load RSVPs" });
  }
});

// GET /api/meetups/rsvp-summary?ids=1,2,3 — batch RSVP summary for a
// list of meetup ids. Used by surfaces that render many gatherings at
// once (the dashboard, the community page) so they can show
// "N going · M maybe" + a small avatar stack without N+1 round-trips.
// Caller is silently filtered to meetups they have access to — no
// 403 noise for ids they happen not to belong to.
router.get("/meetups/rsvp-summary", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = (req.query.ids as string | undefined) ?? "";
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) { res.json({ meetups: {} }); return; }
  // Soft cap. Way more than a dashboard ever needs in one page.
  const capped = ids.slice(0, 100);

  try {
    // One query joins meetups -> rituals so we can filter on
    // groupId + ownerId in JS. Cheaper than 100 individual access
    // checks against group_members.
    const rituals = await db
      .select({
        meetupId: meetupsTable.id,
        ritualId: ritualsTable.id,
        ownerId: ritualsTable.ownerId,
        groupId: ritualsTable.groupId,
      })
      .from(meetupsTable)
      .innerJoin(ritualsTable, eq(ritualsTable.id, meetupsTable.ritualId))
      .where(inArray(meetupsTable.id, capped));
    if (rituals.length === 0) { res.json({ meetups: {} }); return; }

    // For multi-community gatherings, ALL linked communities count
    // toward access. Build a map of ritualId → set of group ids
    // (primary host + additional invited communities).
    const ritualIds = rituals.map((r) => r.ritualId);
    const ritualGroupRows = await db
      .select({ ritualId: ritualGroupsTable.ritualId, groupId: ritualGroupsTable.groupId })
      .from(ritualGroupsTable)
      .where(inArray(ritualGroupsTable.ritualId, ritualIds))
      .catch(() => [] as Array<{ ritualId: number; groupId: number }>);

    const linkedGroupsByRitual = new Map<number, Set<number>>();
    for (const r of rituals) {
      const set = new Set<number>();
      if (r.groupId != null) set.add(r.groupId);
      linkedGroupsByRitual.set(r.ritualId, set);
    }
    for (const r of ritualGroupRows) {
      const set = linkedGroupsByRitual.get(r.ritualId);
      if (set) set.add(r.groupId);
    }

    // Which group ids does the caller belong to (joined, regardless
    // of role)? Drives the access filter.
    const groupIds = Array.from(
      new Set(
        Array.from(linkedGroupsByRitual.values()).flatMap((s) => Array.from(s)),
      ),
    );
    const memberRows = groupIds.length
      ? await db
          .select({ groupId: groupMembersTable.groupId })
          .from(groupMembersTable)
          .where(
            and(
              eq(groupMembersTable.userId, user.id),
              inArray(groupMembersTable.groupId, groupIds),
              isNotNull(groupMembersTable.joinedAt),
            ),
          )
      : [];
    const memberOfGroups = new Set(memberRows.map((m) => m.groupId));

    const allowedMeetupIds = rituals
      .filter((r) => {
        const linked = linkedGroupsByRitual.get(r.ritualId) ?? new Set<number>();
        if (linked.size === 0) return r.ownerId === user.id; // personal ritual
        for (const gid of linked) if (memberOfGroups.has(gid)) return true;
        return false;
      })
      .map((r) => r.meetupId);
    if (allowedMeetupIds.length === 0) { res.json({ meetups: {} }); return; }

    const rsvps = await db
      .select({
        meetupId: meetupRsvpsTable.meetupId,
        userId: meetupRsvpsTable.userId,
        status: meetupRsvpsTable.status,
        updatedAt: meetupRsvpsTable.updatedAt,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(meetupRsvpsTable)
      .innerJoin(usersTable, eq(usersTable.id, meetupRsvpsTable.userId))
      .where(inArray(meetupRsvpsTable.meetupId, allowedMeetupIds))
      .orderBy(meetupRsvpsTable.updatedAt);

    // Group by meetup id. Avatars cap at 6 each side so the wire
    // response stays tight; the detail page hits /meetups/:id/rsvps
    // for the full list.
    type Tiny = { userId: number; name: string | null; avatarUrl: string | null };
    const map: Record<
      number,
      { goingCount: number; maybeCount: number; goingPreview: Tiny[]; maybePreview: Tiny[]; yourStatus: "going" | "maybe" | null }
    > = {};
    for (const id of allowedMeetupIds) {
      map[id] = { goingCount: 0, maybeCount: 0, goingPreview: [], maybePreview: [], yourStatus: null };
    }
    for (const r of rsvps) {
      const slot = map[r.meetupId];
      if (!slot) continue;
      if (r.userId === user.id) {
        if (r.status === "going" || r.status === "maybe") slot.yourStatus = r.status;
      }
      if (r.status === "going") {
        slot.goingCount += 1;
        if (slot.goingPreview.length < 6) {
          slot.goingPreview.push({ userId: r.userId, name: r.name, avatarUrl: r.avatarUrl });
        }
      } else if (r.status === "maybe") {
        slot.maybeCount += 1;
        if (slot.maybePreview.length < 6) {
          slot.maybePreview.push({ userId: r.userId, name: r.name, avatarUrl: r.avatarUrl });
        }
      }
    }

    res.json({ meetups: map });
  } catch (err) {
    console.error("GET /api/meetups/rsvp-summary error:", err);
    res.status(500).json({ error: "Failed to load RSVP summary" });
  }
});

// Tiny helper: scrub other people's emails from the response. Names
// + avatars + a stable userId are enough for the UI; emails are PII
// we don't need to expose here.
function stripEmailIfNotSelf(selfUserId: number) {
  return (r: { userId: number; status: string; respondedAt: Date; name: string | null; email: string; avatarUrl: string | null }) => ({
    userId: r.userId,
    status: r.status,
    respondedAt: r.respondedAt instanceof Date ? r.respondedAt.toISOString() : r.respondedAt,
    name: r.name,
    avatarUrl: r.avatarUrl,
    ...(r.userId === selfUserId ? { email: r.email } : {}),
  });
}

// Suppress unused-import warning for sql/inArray when shaking trees.
void sql;
void inArray;

export default router;
