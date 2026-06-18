// Fellow Plans — the "How About" surface. A person shares something they're
// going to ("Evensong at the Cathedral, Thursday 6pm") and their active
// Fellows see it and can say they'll come. Built on the existing fellows
// model: a plan is visible only to its host + the host's Fellows (1:1
// connections), never community-wide. Two tables: fellow_plans (the plan) +
// fellow_plan_rsvps (who's coming).
//
// Creating a plan is a beta capability (like manual fellow-add). Reading the
// feed + RSVPing stays open to any authenticated fellow, so a non-beta fellow
// can still see and join a beta host's plan.

import { Router, type IRouter, type RequestHandler } from "express";
import crypto from "crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  db,
  fellowPlansTable,
  fellowPlanRsvpsTable,
  fellowsTable,
  fellowPrefsTable,
  usersTable,
  betaUsersTable,
  type FellowPlan,
} from "@workspace/db";
import { z } from "zod/v4";
import { getFellowUserIds } from "../lib/garden";
import { sendPushToUser, sendPushToUsers } from "../lib/pushSender";

import { rateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

const byUser = (req: { user?: unknown }): string | null => {
  const u = req.user as { id?: number } | undefined;
  return u?.id ? `u:${u.id}` : null;
};

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

// Creating plans is a beta capability for now (mirrors fellows manual-add).
const requireBeta: RequestHandler = async (req, res, next) => {
  const id = getUserId(req);
  if (!id) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, id));
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [beta] = await db.select({ email: betaUsersTable.email })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (!beta) { res.status(403).json({ error: "Plans is a beta feature." }); return; }
    next();
  } catch {
    res.status(403).json({ error: "Plans is a beta feature." });
  }
};

async function areFellows(a: number, b: number): Promise<boolean> {
  if (a === b) return true;
  const rows = await db.select({ id: fellowsTable.id }).from(fellowsTable).where(or(
    and(eq(fellowsTable.userId, a), eq(fellowsTable.fellowUserId, b)),
    and(eq(fellowsTable.userId, b), eq(fellowsTable.fellowUserId, a)),
  )).limit(1);
  return rows.length > 0;
}

type Brief = { userId: number; name: string; avatarUrl: string | null };
function briefName(name: string | null): string { return name?.trim() || "Someone"; }

function serializePlan(p: FellowPlan) {
  return {
    id: p.id,
    title: p.title,
    note: p.note,
    location: p.location,
    emoji: p.emoji,
    startsAt: p.startsAt ? p.startsAt.toISOString() : null,
    whenText: p.whenText,
    createdAt: p.createdAt.toISOString(),
  };
}

// ─── POST /api/fellow-plans — share a plan ───────────────────────────────────
const createSchema = z.object({
  title: z.string().trim().min(1).max(140),
  note: z.string().trim().max(500).optional(),
  location: z.string().trim().max(140).optional(),
  emoji: z.string().trim().max(8).optional(),
  whenText: z.string().trim().max(80).optional(),
  startsAt: z.string().datetime().optional(),
});
router.post("/fellow-plans", rateLimit({
  name: "fellow_plan_create",
  max: 20,
  windowMs: 60 * 60 * 1000,
  keyFn: byUser,
  message: "You've shared a lot of plans. Take a breath and try again soon.",
}), requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "A plan needs a title." }); return; }
  const { title, note, location, emoji, whenText, startsAt } = parsed.data;

  const [row] = await db.insert(fellowPlansTable).values({
    userId: me,
    title,
    note: note || null,
    location: location || null,
    emoji: emoji || null,
    whenText: whenText || null,
    startsAt: startsAt ? new Date(startsAt) : null,
  }).returning();

  // Let the host's fellows know — fire-and-forget.
  void (async () => {
    try {
      const fellowIds = await getFellowUserIds(me);
      if (fellowIds.length === 0) return;
      const [host] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, me));
      const who = briefName(host?.name ?? null);
      const label = `${emoji ? emoji + " " : ""}${title}`.trim();
      await sendPushToUsers(fellowIds, {
        title: `${who} has a plan`,
        body: label,
        path: "/people",
        threadId: "fellow-plan",
      });
    } catch { /* push is best-effort */ }
  })();

  res.json({ plan: serializePlan(row) });
});

// ─── PATCH /api/fellow-plans/:id — edit your own plan ────────────────────────
const patchSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  location: z.string().trim().max(140).nullable().optional(),
  emoji: z.string().trim().max(8).nullable().optional(),
  whenText: z.string().trim().max(80).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
});
router.patch("/fellow-plans/:id", requireBeta, async (req, res): Promise<void> => {
  const me = getUserId(req)!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Invalid plan." }); return; }
  const [existing] = await db.select().from(fellowPlansTable).where(eq(fellowPlansTable.id, id));
  if (!existing || existing.userId !== me) { res.status(404).json({ error: "Plan not found" }); return; }
  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.title !== undefined) update.title = d.title;
  if (d.note !== undefined) update.note = d.note || null;
  if (d.location !== undefined) update.location = d.location || null;
  if (d.emoji !== undefined) update.emoji = d.emoji || null;
  if (d.whenText !== undefined) update.whenText = d.whenText || null;
  if (d.startsAt !== undefined) update.startsAt = d.startsAt ? new Date(d.startsAt) : null;
  if (Object.keys(update).length === 0) { res.json({ plan: serializePlan(existing) }); return; }
  const [row] = await db.update(fellowPlansTable).set(update).where(eq(fellowPlansTable.id, id)).returning();
  res.json({ plan: serializePlan(row) });
});

// ─── GET /api/fellow-plans — the feed (my plans + my fellows' plans) ──────────
router.get("/fellow-plans", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }

  const fellowIds = await getFellowUserIds(me);
  const hostIds = Array.from(new Set([me, ...fellowIds]));

  // Open plans by me or a fellow. Keep recently-past dated plans for a short
  // grace window; undated ("Saturday morning") plans expire after 14 days so
  // the feed doesn't accumulate stale invites.
  const plans = await db.select().from(fellowPlansTable).where(and(
    inArray(fellowPlansTable.userId, hostIds),
    eq(fellowPlansTable.status, "open"),
    or(
      and(sql`${fellowPlansTable.startsAt} IS NULL`, sql`${fellowPlansTable.createdAt} > now() - interval '14 days'`),
      sql`${fellowPlansTable.startsAt} > now() - interval '6 hours'`,
    ),
  )).orderBy(sql`(${fellowPlansTable.startsAt} IS NULL) ASC, ${fellowPlansTable.startsAt} ASC NULLS LAST, ${fellowPlansTable.createdAt} DESC`);

  // Respect each host's per-fellow "share my plans" choice: a fellow's plan is
  // hidden from me if THAT host turned sharePlans off toward me. My own plans
  // always show. Default (no row) = shared, so this never hides anything unless
  // a host explicitly scoped me out (e.g. "not in the same place").
  if (fellowIds.length > 0) {
    const hiddenRows = await db.select({ ownerId: fellowPrefsTable.ownerId })
      .from(fellowPrefsTable)
      .where(and(
        inArray(fellowPrefsTable.ownerId, fellowIds),
        eq(fellowPrefsTable.fellowUserId, me),
        eq(fellowPrefsTable.sharePlans, false),
      ));
    if (hiddenRows.length > 0) {
      const hideHosts = new Set(hiddenRows.map((r) => r.ownerId));
      for (let i = plans.length - 1; i >= 0; i--) {
        if (plans[i].userId !== me && hideHosts.has(plans[i].userId)) plans.splice(i, 1);
      }
    }
  }

  if (plans.length === 0) { res.json({ plans: [] }); return; }

  const planIds = plans.map(p => p.id);
  const hostUserIds = Array.from(new Set(plans.map(p => p.userId)));

  const [hosts, rsvps] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(usersTable).where(inArray(usersTable.id, hostUserIds)),
    db.select({
      planId: fellowPlanRsvpsTable.planId,
      userId: fellowPlanRsvpsTable.userId,
      status: fellowPlanRsvpsTable.status,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
    }).from(fellowPlanRsvpsTable)
      .innerJoin(usersTable, eq(usersTable.id, fellowPlanRsvpsTable.userId))
      .where(inArray(fellowPlanRsvpsTable.planId, planIds)),
  ]);

  const hostMap = new Map(hosts.map(h => [h.id, h]));
  const byPlan = new Map<number, typeof rsvps>();
  for (const r of rsvps) {
    const arr = byPlan.get(r.planId) ?? [];
    arr.push(r);
    byPlan.set(r.planId, arr);
  }

  const out = plans.map(p => {
    const rs = byPlan.get(p.id) ?? [];
    const coming = rs.filter(r => r.status === "coming");
    const maybe = rs.filter(r => r.status === "maybe");
    const host = hostMap.get(p.userId);
    const mine = p.userId === me;
    const comingPreview: Brief[] = coming.slice(0, 6).map(r => ({ userId: r.userId, name: briefName(r.name), avatarUrl: r.avatarUrl }));
    return {
      ...serializePlan(p),
      isMine: mine,
      host: { userId: p.userId, name: briefName(host?.name ?? null), avatarUrl: host?.avatarUrl ?? null } as Brief,
      comingCount: coming.length,
      maybeCount: maybe.length,
      comingPreview,
      myRsvp: rs.find(r => r.userId === me)?.status ?? null,
    };
  });

  res.json({ plans: out });
});

// ─── PUT /api/fellow-plans/:id/rsvp — say you'll come (or clear) ──────────────
const rsvpSchema = z.object({ status: z.enum(["coming", "maybe"]).nullable() });
router.put("/fellow-plans/:id/rsvp", rateLimit({
  name: "fellow_plan_rsvp",
  max: 60,
  windowMs: 60 * 60 * 1000,
  keyFn: byUser,
  message: "Slow down a moment, then try again.",
}), async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const planId = Number(req.params.id);
  if (!Number.isInteger(planId)) { res.status(400).json({ error: "Bad plan id" }); return; }
  const parsed = rsvpSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Bad status" }); return; }
  const next = parsed.data.status;

  const [plan] = await db.select().from(fellowPlansTable).where(eq(fellowPlansTable.id, planId));
  if (!plan || plan.status !== "open") { res.status(404).json({ error: "Plan not found" }); return; }
  if (plan.userId === me) { res.status(400).json({ error: "You're hosting this plan." }); return; }
  if (!(await areFellows(me, plan.userId))) { res.status(403).json({ error: "Not your fellow's plan." }); return; }

  // Was I already 'coming'? Used to fire the host notification only on a fresh
  // commit, not on every toggle/refresh.
  const [existing] = await db.select({ status: fellowPlanRsvpsTable.status })
    .from(fellowPlanRsvpsTable)
    .where(and(eq(fellowPlanRsvpsTable.planId, planId), eq(fellowPlanRsvpsTable.userId, me)));

  if (next === null) {
    await db.delete(fellowPlanRsvpsTable).where(and(
      eq(fellowPlanRsvpsTable.planId, planId), eq(fellowPlanRsvpsTable.userId, me),
    ));
    res.json({ ok: true, myRsvp: null });
    return;
  }

  await db.insert(fellowPlanRsvpsTable).values({ planId, userId: me, status: next })
    .onConflictDoUpdate({
      target: [fellowPlanRsvpsTable.planId, fellowPlanRsvpsTable.userId],
      set: { status: next, updatedAt: new Date() },
    });

  // Notify the host the first time someone commits to coming.
  if (next === "coming" && existing?.status !== "coming") {
    void (async () => {
      try {
        const [meRow] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, me));
        await sendPushToUser(plan.userId, {
          title: `${briefName(meRow?.name ?? null)} is coming`,
          body: `${plan.emoji ? plan.emoji + " " : ""}${plan.title}`.trim(),
          path: "/people",
          threadId: "fellow-plan-rsvp",
        });
      } catch { /* best-effort */ }
    })();
  }

  res.json({ ok: true, myRsvp: next });
});

// ─── DELETE /api/fellow-plans/:id — host cancels their plan ───────────────────
router.delete("/fellow-plans/:id", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const planId = Number(req.params.id);
  if (!Number.isInteger(planId)) { res.status(400).json({ error: "Bad plan id" }); return; }
  const [plan] = await db.select().from(fellowPlansTable).where(eq(fellowPlansTable.id, planId));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (plan.userId !== me) { res.status(403).json({ error: "Not your plan." }); return; }
  await db.delete(fellowPlansTable).where(eq(fellowPlansTable.id, planId));
  res.json({ ok: true });
});

// ─── Shareable plan link ─────────────────────────────────────────────────────
// POST /fellow-plans/:id/share-link — host-only. Mints (lazily) a public token
// and returns the /plans/:token URL for the share sheet (e.g. texting a fellow).
router.post("/fellow-plans/:id/share-link", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [plan] = await db.select().from(fellowPlansTable).where(eq(fellowPlansTable.id, id));
  if (!plan || plan.userId !== me) { res.status(404).json({ error: "Plan not found" }); return; }
  let token = plan.shareToken ?? null;
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
    await db.update(fellowPlansTable).set({ shareToken: token }).where(eq(fellowPlansTable.id, id));
  }
  const base = process.env.PUBLIC_APP_ORIGIN || "https://withphoebe.app";
  res.json({ token, url: `${base}/plans/${token}` });
});

// GET /fellow-plans/share/:token — PUBLIC (pre-auth) plan card for the landing
// page. Returns only safe, shareable fields — no emails, no RSVP roster, just
// the host's name/avatar + a count. A signed-in fellow RSVPs via PUT
// /fellow-plans/:id/rsvp using the `id` returned here.
router.get("/fellow-plans/share/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{32}$/i.test(token)) { res.status(404).json({ error: "Invalid link" }); return; }
  const [plan] = await db.select().from(fellowPlansTable).where(eq(fellowPlansTable.shareToken, token));
  if (!plan || plan.status !== "open") { res.status(404).json({ error: "Plan not found" }); return; }
  const [host] = await db.select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(eq(usersTable.id, plan.userId));
  const coming = await db.select({ id: fellowPlanRsvpsTable.id })
    .from(fellowPlanRsvpsTable)
    .where(and(eq(fellowPlanRsvpsTable.planId, plan.id), eq(fellowPlanRsvpsTable.status, "coming")));
  // Is the (maybe signed-in) viewer a fellow of the host → can they RSVP here?
  const me = getUserId(req);
  let viewerCanRsvp = false;
  let viewerIsHost = false;
  if (me) {
    viewerIsHost = me === plan.userId;
    if (!viewerIsHost) {
      const fellowIds = await getFellowUserIds(me);
      viewerCanRsvp = fellowIds.includes(plan.userId);
    }
  }
  res.json({
    plan: {
      ...serializePlan(plan),
      host: { name: host?.name ?? "A fellow", avatarUrl: host?.avatarUrl ?? null },
      comingCount: coming.length,
    },
    viewerIsHost,
    viewerCanRsvp,
  });
});

export default router;
