import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { desc, eq, inArray } from "drizzle-orm";
import { db, contentReportsTable, usersTable, betaUsersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { perUserRateLimit } from "../lib/rate-limit";

// Content reporting endpoint — required by App Store Guideline 1.2 for
// any app with user-generated content. Users can flag a prayer
// request, a "word of comfort" comment, or a letter; we record the
// report and the operator (us) reviews and acts within 24 hours.
//
// We don't surface the moderation queue in the app itself yet —
// reports land in the `content_reports` table and we drain them via
// SQL. That's fine for App Review: Apple wants the *reporting* path
// to exist, plus a commitment to act, not an admin UI.
//
// To extend (e.g. add 'community_intention'): add the new kind to the
// enum below and to the matching front-end ReportButton callsite.

const router: IRouter = Router();

// Primary surface today is `user` — reporting a person from their
// profile flags everything they've contributed. Per-content kinds
// (prayer_request / prayer_word / letter) are accepted by the schema
// for forward compatibility, in case we want a per-row Report later.
const REPORT_KINDS = ["user", "prayer_request", "prayer_word", "letter"] as const;

// Audit finding #22a: any authenticated user (incl. anonymous device
// users) could POST unbounded reports, flooding the moderation queue.
// Cap per-user (falling back to IP) at ~20/hour — plenty for a real
// person flagging content, but it blunts automated spam.
router.post("/reports", perUserRateLimit("reports_create", {
  max: 20,
  windowMs: 60 * 60 * 1000,
}), async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const schema = z.object({
    kind: z.enum(REPORT_KINDS),
    targetId: z.number().int().positive(),
    reason: z.string().trim().max(2000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { kind, targetId, reason } = parsed.data;

  try {
    const [row] = await db
      .insert(contentReportsTable)
      .values({
        reporterUserId: sessionUserId,
        kind,
        targetId,
        reason: reason ?? null,
      })
      .returning({ id: contentReportsTable.id });

    // Visible log so a fresh report shows up in Railway tail without
    // having to query the DB. The 24h SLA we promise to App Review is
    // the operator (us) reading these and acting; centralizing them
    // here keeps that loop tight.
    logger.warn(
      { reportId: row.id, reporterUserId: sessionUserId, kind, targetId, reasonLen: (reason ?? "").length },
      "[reports] new content report",
    );

    res.json({ ok: true, id: row.id });
  } catch (err) {
    logger.error({ err }, "[reports] failed to insert content report");
    res.status(500).json({ error: "Couldn't save report. Please try again." });
  }
});

// Same admin gate the feedback route uses — beta_users.is_admin = true.
async function isBetaAdmin(userId: number): Promise<boolean> {
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return false;
  try {
    const [beta] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch {
    return false;
  }
}

// GET /api/reports — admin-only moderation queue. Returns every
// content report joined with the reporter's name + email and (when
// kind='user') the reported user's name + email so the admin can
// triage at a glance without a second round-trip.
router.get("/reports", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await isBetaAdmin(sessionUserId))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const rows = await db
    .select({
      id: contentReportsTable.id,
      kind: contentReportsTable.kind,
      targetId: contentReportsTable.targetId,
      reason: contentReportsTable.reason,
      status: contentReportsTable.status,
      createdAt: contentReportsTable.createdAt,
      reviewedAt: contentReportsTable.reviewedAt,
      reporterUserId: contentReportsTable.reporterUserId,
      reporterName: usersTable.name,
      reporterEmail: usersTable.email,
    })
    .from(contentReportsTable)
    .leftJoin(usersTable, eq(usersTable.id, contentReportsTable.reporterUserId))
    .orderBy(desc(contentReportsTable.createdAt));

  // Enrich kind='user' rows with the reported user's name + email.
  const userTargetIds = rows
    .filter(r => r.kind === "user")
    .map(r => r.targetId);
  const targetUserMap = new Map<number, { name: string; email: string }>();
  if (userTargetIds.length > 0) {
    const targets = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, userTargetIds));
    for (const t of targets) {
      targetUserMap.set(t.id, { name: t.name, email: t.email });
    }
  }

  res.json({
    reports: rows.map(r => ({
      ...r,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      target:
        r.kind === "user"
          ? targetUserMap.get(r.targetId) ?? null
          : null,
    })),
  });
});

// PATCH /api/reports/:id — admin marks a report reviewed (or dismissed).
// Status = 'reviewed' | 'dismissed'. Reviewed_at is stamped server-side.
router.patch("/reports/:id", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await isBetaAdmin(sessionUserId))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const schema = z.object({ status: z.enum(["reviewed", "dismissed", "open"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status } = parsed.data;
  await db
    .update(contentReportsTable)
    .set({
      status,
      reviewedAt: status === "open" ? null : new Date(),
    })
    .where(eq(contentReportsTable.id, id));
  res.json({ ok: true });
});

export default router;
