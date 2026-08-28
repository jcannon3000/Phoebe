import { Router, type IRouter, type Request, type Response } from "express";
import { db, novenasTable, novenaDaysTable, novenaProgressTable } from "@workspace/db";
import { and, eq, asc, isNull, inArray, desc } from "drizzle-orm";
import { getPsalm } from "../lib/scriptureService";

// ── Novenas — a library of nine-day (dayCount) prayer novenas, ridden one
//    day at a time in the daily routine. At most one ACTIVE novena per user
//    (see the partial unique index in migrate.ts) — starting a second one
//    while another is active requires confirmSwitch:true, so the client can
//    show a "stop this one and start that one?" prompt first.
//
//    currentDay advances ONLY on POST .../complete, never by the calendar —
//    a missed day just leaves currentDay where it was. lastCompletedLocalDate
//    is how "already prayed today" resets each morning: the client compares
//    it to its own today (YYYY-MM-DD, its own timezone), same convention as
//    practice_completion's localDate.
//
//   GET  /api/novenas                      — the library (id, title, saint, sourceNote, dayCount)
//   GET  /api/me/novena                    — the caller's active novena + today's day content
//   POST /api/novenas/:id/start            — { confirmSwitch? } begin (or switch to) a novena
//   POST /api/me/novena/complete           — { localDate } mark today's day done, advances currentDay
//   POST /api/me/novena/stop               — abandon the active novena, no replacement

const router: IRouter = Router();
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

// TEMPORARY debug endpoint — dumps every raw novena_progress row for the
// caller, so a live disagreement between GET /novenas and GET /me/novena
// can be diagnosed from actual data instead of re-reading the route code
// for the tenth time. Safe to delete once the novena flow is confirmed
// solid — it's read-only and scoped to req.user, no cross-user leakage.
router.get("/me/novena/debug", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const allRows = await db
    .select()
    .from(novenaProgressTable)
    .where(eq(novenaProgressTable.userId, userId))
    .orderBy(desc(novenaProgressTable.id));
  const activeRows = allRows.filter((r) => r.status === "active");
  res.json({
    userId,
    totalRows: allRows.length,
    activeRowCount: activeRows.length,
    allRows,
    warning: activeRows.length > 1 ? "MORE THAN ONE ACTIVE ROW — this is the bug." : null,
  });
});

router.get("/novenas", async (req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      id: novenasTable.id,
      title: novenasTable.title,
      saint: novenasTable.saint,
      sourceNote: novenasTable.sourceNote,
      history: novenasTable.history,
      intention: novenasTable.intention,
      dayCount: novenasTable.dayCount,
    })
    .from(novenasTable)
    .where(isNull(novenasTable.archivedAt))
    .orderBy(asc(novenasTable.sortOrder), asc(novenasTable.title));

  // For a signed-in user, fold in per-novena "is this the active one" and
  // "when did I last finish it" — shown on the library cards so a returning
  // user can see their history at a glance, not just start/continue.
  const userId = uid(req);
  let currentNovenaId: number | null = null;
  const lastCompletedByNovena = new Map<number, string>();
  if (userId !== null && rows.length > 0) {
    const novenaIds = rows.map((r) => r.id);
    const progressRows = await db
      .select({
        id: novenaProgressTable.id,
        novenaId: novenaProgressTable.novenaId,
        status: novenaProgressTable.status,
        completedAt: novenaProgressTable.completedAt,
      })
      .from(novenaProgressTable)
      .where(and(eq(novenaProgressTable.userId, userId), inArray(novenaProgressTable.novenaId, novenaIds)))
      // completedAt is null for every active row (a tie), so without a
      // tie-break this picked whichever active row the DB happened to
      // return last — GET /me/novena orders by id desc, so match that
      // here too, or the two endpoints can disagree about which novena
      // is "current" if more than one active row ever exists at once.
      .orderBy(desc(novenaProgressTable.completedAt), desc(novenaProgressTable.id));

    for (const p of progressRows) {
      // Rows are ordered most-recent-first — take the FIRST active row we
      // see and stop overwriting; the previous version kept overwriting on
      // every active row, so with ties (every active row has completedAt
      // null) it silently landed on the OLDEST one instead of the newest.
      if (p.status === "active" && currentNovenaId === null) currentNovenaId = p.novenaId;
      if (p.status === "completed" && p.completedAt && !lastCompletedByNovena.has(p.novenaId)) {
        lastCompletedByNovena.set(p.novenaId, p.completedAt.toISOString());
      }
    }
  }

  res.json({
    novenas: rows.map((r) => ({
      ...r,
      isCurrent: r.id === currentNovenaId,
      lastCompletedAt: lastCompletedByNovena.get(r.id) ?? null,
    })),
  });
});

router.get("/me/novena", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  // The partial unique index (migrate.ts) should guarantee at most one
  // active row per user, but ORDER BY + LIMIT 1 here (matching GET /novenas
  // below) means that even if that ever drifts, both endpoints agree on
  // which row wins — the most recently started one — instead of picking
  // arbitrary, possibly DIFFERENT rows and disagreeing with each other.
  const [progress] = await db
    .select()
    .from(novenaProgressTable)
    .where(and(eq(novenaProgressTable.userId, userId), eq(novenaProgressTable.status, "active")))
    .orderBy(desc(novenaProgressTable.id))
    .limit(1);

  if (!progress) { res.json({ active: null }); return; }

  const [novena] = await db.select().from(novenasTable).where(eq(novenasTable.id, progress.novenaId)).limit(1);
  if (!novena) { res.json({ active: null }); return; }

  // currentDay advances the moment a day is marked complete (see .../complete
  // below) — so re-opening the reading page later THAT SAME day would
  // otherwise jump straight to the next, unread day's content while it's
  // simultaneously flagged "done" (lastCompletedLocalDate === today). Show
  // the day just completed instead, until a new local day actually arrives.
  // The finished-novena case (status flips to "completed", currentDay pinned
  // at dayCount) is exempt — that's genuinely the last day, not a lookahead.
  const localDate = typeof req.query.localDate === "string" ? req.query.localDate : null;
  const doneToday = !!localDate && progress.lastCompletedLocalDate === localDate;
  const displayDayNumber = (doneToday && progress.status === "active" && progress.currentDay > 1)
    ? progress.currentDay - 1
    : progress.currentDay;

  const [day] = await db
    .select()
    .from(novenaDaysTable)
    .where(and(eq(novenaDaysTable.novenaId, novena.id), eq(novenaDaysTable.dayNumber, displayDayNumber)))
    .limit(1);

  // A day tied to a psalmNumber gets the actual BCP Psalter text (verified,
  // already in bcp_texts) spliced in ahead of the day's own body, rather than
  // re-transcribing psalm text by hand into seed data.
  let dayBody = day?.body ?? "";
  if (day?.psalmNumber) {
    const psalmText = await getPsalm(day.psalmNumber);
    dayBody = `Psalm ${day.psalmNumber}\n\n${psalmText}\n\n${dayBody}`;
  }

  res.json({
    active: {
      novenaId: novena.id,
      title: novena.title,
      saint: novena.saint,
      dayCount: novena.dayCount,
      currentDay: progress.currentDay,
      displayDayNumber,
      lastCompletedLocalDate: progress.lastCompletedLocalDate,
      replacesSlot: progress.replacesSlot as "morning" | "evening" | null,
      day: day ? { title: day.title, body: dayBody } : null,
    },
  });
});

router.post("/novenas/:id/start", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const novenaId = Number(req.params.id);
  if (!Number.isInteger(novenaId)) { res.status(400).json({ error: "bad_request" }); return; }

  const [novena] = await db.select().from(novenasTable).where(eq(novenasTable.id, novenaId)).limit(1);
  if (!novena) { res.status(404).json({ error: "not_found" }); return; }

  const [existing] = await db
    .select()
    .from(novenaProgressTable)
    .where(and(eq(novenaProgressTable.userId, userId), eq(novenaProgressTable.status, "active")))
    .limit(1);

  if (existing && existing.novenaId === novenaId) {
    // Already on this one — no-op, just report where they are.
    res.json({ ok: true, currentDay: existing.currentDay });
    return;
  }

  const confirmSwitch = req.body?.confirmSwitch === true;
  if (existing && !confirmSwitch) {
    const [currentNovena] = await db.select().from(novenasTable).where(eq(novenasTable.id, existing.novenaId)).limit(1);
    res.status(409).json({ error: "active_exists", current: currentNovena ? { novenaId: currentNovena.id, title: currentNovena.title } : null });
    return;
  }

  const replacesSlotRaw = req.body?.replacesSlot;
  const replacesSlot = replacesSlotRaw === "morning" || replacesSlotRaw === "evening" ? replacesSlotRaw : null;

  // Transactional — a double-tap (or any two concurrent requests) racing
  // between the abandon and the insert could otherwise both pass the
  // "existing" check above and each insert their own active row, leaving
  // two — the exact ambiguity GET /me/novena and GET /novenas above just
  // got hardened against, but better to make it impossible here too.
  try {
    await db.transaction(async (tx) => {
      if (existing) {
        await tx.update(novenaProgressTable).set({ status: "abandoned" }).where(eq(novenaProgressTable.id, existing.id));
      }
      await tx.insert(novenaProgressTable).values({ userId, novenaId, currentDay: 1, replacesSlot });
    });
  } catch (err: unknown) {
    // The partial unique index (one active row per user) rejecting a
    // genuine race is the one case worth a clear response instead of a
    // bare 500 — the client can just retry.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("uniq_novena_progress_active_per_user")) {
      res.status(409).json({ error: "active_exists" });
      return;
    }
    throw err;
  }

  res.json({ ok: true, currentDay: 1, replacesSlot });
});

router.post("/me/novena/complete", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const localDate = String(req.body?.localDate ?? "");
  if (!YMD.test(localDate)) { res.status(400).json({ error: "bad_request" }); return; }

  const [progress] = await db
    .select()
    .from(novenaProgressTable)
    .where(and(eq(novenaProgressTable.userId, userId), eq(novenaProgressTable.status, "active")))
    .limit(1);
  if (!progress) { res.status(404).json({ error: "no_active_novena" }); return; }

  // Idempotent — a repeat tap the same local day doesn't advance twice.
  if (progress.lastCompletedLocalDate === localDate) {
    res.json({ ok: true, currentDay: progress.currentDay, completed: progress.status === "completed" });
    return;
  }

  const [novena] = await db.select().from(novenasTable).where(eq(novenasTable.id, progress.novenaId)).limit(1);
  const dayCount = novena?.dayCount ?? 9;
  const nextDay = progress.currentDay + 1;
  const finished = nextDay > dayCount;

  await db
    .update(novenaProgressTable)
    .set({
      currentDay: finished ? progress.currentDay : nextDay,
      lastCompletedLocalDate: localDate,
      ...(finished ? { status: "completed", completedAt: new Date() } : {}),
    })
    .where(eq(novenaProgressTable.id, progress.id));

  res.json({ ok: true, currentDay: finished ? progress.currentDay : nextDay, completed: finished });
});

/** The undo half of /me/novena/complete — takes back TODAY's completion
 *  only, stepping currentDay back with it, so the ✓ on the novena card can
 *  unlog like every other card. A completed-status novena is not reopened
 *  (finishing the whole novena is a bigger act than a same-day mis-tap). */
router.post("/me/novena/uncomplete", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const localDate = String(req.body?.localDate ?? "");
  if (!YMD.test(localDate)) { res.status(400).json({ error: "bad_request" }); return; }
  const [progress] = await db
    .select()
    .from(novenaProgressTable)
    .where(and(eq(novenaProgressTable.userId, userId), eq(novenaProgressTable.status, "active")))
    .limit(1);
  if (!progress) { res.status(404).json({ error: "no_active_novena" }); return; }
  if (progress.lastCompletedLocalDate !== localDate) { res.json({ ok: true, currentDay: progress.currentDay }); return; }
  const prevDay = Math.max(1, progress.currentDay - 1);
  await db
    .update(novenaProgressTable)
    .set({ currentDay: prevDay, lastCompletedLocalDate: null })
    .where(eq(novenaProgressTable.id, progress.id));
  res.json({ ok: true, currentDay: prevDay });
});

router.post("/me/novena/stop", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  await db
    .update(novenaProgressTable)
    .set({ status: "abandoned" })
    .where(and(eq(novenaProgressTable.userId, userId), eq(novenaProgressTable.status, "active")));

  res.json({ ok: true });
});

export default router;
