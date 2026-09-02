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
// "gratitude" and "examen" are the optional daily practices a user can add
// from the Customize flow — completing one earns an extra Daily-progress
// checkmark (see lib/practiceCompletion.ts on the client + useRhythmState).
// NOTE: this set is the GATE. A practice the client can log but this doesn't
// name gets a 400, which the client surfaces as "Couldn't save that" — that is
// exactly what shipping Visio Divina without "visio" here did, on every single
// completion. Adding a practice on the client means adding it here too.
const SECTIONS = new Set(["turn", "learn_pray", "learn", "pray", "worship", "bless", "go", "rest", "weekly_review", "examen", "listening", "reading", "podcasts", "walk", "prayer-list", "visio", "icons", "spirituals", "lectio"]);
/**
 * A user's OWN practice, as `custom:<anchorId>`.
 *
 * Custom-anchor completions were device-local only — the anchor DEFINITIONS
 * synced (users.custom_anchors) but the days you kept them never left the
 * phone, so clearing a cache or moving to a new device silently lost them, and
 * nothing server-side could see them. They ride this table now, alongside every
 * other practice, rather than earning a table of their own: the shape is
 * identical (one row per user per practice per local day) and the unique index
 * already makes a repeat tap idempotent.
 *
 * The id half is opaque to the server — it's the client's own anchor id — so
 * it's bounded and character-restricted rather than enumerated.
 */
const CUSTOM_SECTION = /^custom:[A-Za-z0-9_-]{1,64}$/;
function isValidSection(s: string): boolean {
  return SECTIONS.has(s) || CUSTOM_SECTION.test(s);
}
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
  if (!isValidSection(section) || !YMD.test(localDate) || !YMD.test(weekStart)) {
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
  if (!isValidSection(section) || !YMD.test(localDate)) {
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
