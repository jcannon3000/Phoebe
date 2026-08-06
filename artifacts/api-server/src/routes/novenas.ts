import { Router, type IRouter, type Request, type Response } from "express";
import { db, novenasTable, novenaDaysTable, novenaProgressTable } from "@workspace/db";
import { and, eq, asc, isNull } from "drizzle-orm";

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

router.get("/novenas", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      id: novenasTable.id,
      title: novenasTable.title,
      saint: novenasTable.saint,
      sourceNote: novenasTable.sourceNote,
      dayCount: novenasTable.dayCount,
    })
    .from(novenasTable)
    .where(isNull(novenasTable.archivedAt))
    .orderBy(asc(novenasTable.title));

  res.json({ novenas: rows });
});

router.get("/me/novena", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const [progress] = await db
    .select()
    .from(novenaProgressTable)
    .where(and(eq(novenaProgressTable.userId, userId), eq(novenaProgressTable.status, "active")))
    .limit(1);

  if (!progress) { res.json({ active: null }); return; }

  const [novena] = await db.select().from(novenasTable).where(eq(novenasTable.id, progress.novenaId)).limit(1);
  if (!novena) { res.json({ active: null }); return; }

  const [day] = await db
    .select()
    .from(novenaDaysTable)
    .where(and(eq(novenaDaysTable.novenaId, novena.id), eq(novenaDaysTable.dayNumber, progress.currentDay)))
    .limit(1);

  res.json({
    active: {
      novenaId: novena.id,
      title: novena.title,
      saint: novena.saint,
      dayCount: novena.dayCount,
      currentDay: progress.currentDay,
      lastCompletedLocalDate: progress.lastCompletedLocalDate,
      replacesSlot: progress.replacesSlot as "morning" | "evening" | null,
      day: day ? { title: day.title, body: day.body } : null,
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

  if (existing) {
    await db.update(novenaProgressTable).set({ status: "abandoned" }).where(eq(novenaProgressTable.id, existing.id));
  }
  await db.insert(novenaProgressTable).values({ userId, novenaId, currentDay: 1, replacesSlot });

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
