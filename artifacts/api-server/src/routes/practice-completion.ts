import { Router, type IRouter, type Request, type Response } from "express";
import { db, practiceCompletionTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";

// ── Practice completion store (Way of Love beta home) ──────────────────────
//
//   GET    /api/practice-completion?since=YYYY-MM-DD  — the caller's rows
//   POST   /api/practice-completion { section, localDate, weekStart } — mark
//   DELETE /api/practice-completion { section, localDate }            — unmark
//
// A dumb per-user store. The client computes done-today / done-this-week /
// weeks-kept from these rows (+ its timezone, the rule-of-life commitments,
// and the office history). `section` is one of the six Way of Love sections.

const router: IRouter = Router();

// "learn" and "pray" are the split daily practices (their own detail pages);
// "learn_pray" remains for the combined home section.
// "weekly_review" is the Sunday weekly-examen marker — not a practice, but a
// completion row so it (a) records that the week was reviewed and (b) credits
// Turn for the day like any other engagement.
// "gratitude", "examen", and "guided-prayer" are the optional daily practices
// a user can add from the Customize flow — completing one earns an extra
// Daily-progress checkmark (see lib/practiceCompletion.ts on the client +
// useRhythmState).
const SECTIONS = new Set(["turn", "learn_pray", "learn", "pray", "worship", "bless", "go", "rest", "weekly_review", "examen", "guided-prayer", "listening", "reading", "podcasts", "walk", "prayer-list"]);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

router.get("/practice-completion", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const sinceRaw = req.query.since;
  const since = typeof sinceRaw === "string" && YMD.test(sinceRaw) ? sinceRaw : null;

  const rows = await db
    .select({
      section: practiceCompletionTable.section,
      localDate: practiceCompletionTable.localDate,
      weekStart: practiceCompletionTable.weekStart,
    })
    .from(practiceCompletionTable)
    .where(
      since
        ? and(eq(practiceCompletionTable.userId, userId), gte(practiceCompletionTable.weekStart, since))
        : eq(practiceCompletionTable.userId, userId),
    );

  res.json({ completions: rows });
});

router.post("/practice-completion", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const section = String(req.body?.section ?? "");
  const localDate = String(req.body?.localDate ?? "");
  const weekStart = String(req.body?.weekStart ?? "");
  if (!SECTIONS.has(section) || !YMD.test(localDate) || !YMD.test(weekStart)) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  // Idempotent — the unique index on (user_id, section, local_date) makes a
  // repeat tap a no-op rather than a duplicate.
  await db
    .insert(practiceCompletionTable)
    .values({ userId, section, localDate, weekStart })
    .onConflictDoNothing();

  res.json({ ok: true });
});

router.delete("/practice-completion", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const section = String(req.body?.section ?? "");
  const localDate = String(req.body?.localDate ?? "");
  if (!SECTIONS.has(section) || !YMD.test(localDate)) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  await db
    .delete(practiceCompletionTable)
    .where(
      and(
        eq(practiceCompletionTable.userId, userId),
        eq(practiceCompletionTable.section, section),
        eq(practiceCompletionTable.localDate, localDate),
      ),
    );

  res.json({ ok: true });
});

export default router;
