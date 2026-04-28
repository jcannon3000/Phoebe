import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db, contentReportsTable } from "@workspace/db";
import { logger } from "../lib/logger";

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

router.post("/reports", async (req, res): Promise<void> => {
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

export default router;
