import { Router, type IRouter } from "express";
import { db, blessIntentionTable, blessWeekTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";

// ── Bless — the weekly "bless your community" intention cycle ──────────────
//
// Set a few concrete ways to serve others each week, tick them off, review at
// week's end, carry over or release, set next week. Strictly the author's own;
// every query scopes to the session user. The client supplies week_start
// (Sunday, in its own timezone).
//
//   GET    /api/bless?weekStart=YYYY-MM-DD  — this week's intentions + review
//   POST   /api/bless                       — add { weekStart, text, type?, recipient?, reminderTime?, carriedFrom? }
//   PATCH  /api/bless/:id                    — edit fields / toggle { done }
//   DELETE /api/bless/:id                    — remove an intention
//   POST   /api/bless/review                 — mark the week reviewed { weekStart }

const router: IRouter = Router();

type IntentionInput = {
  text?: unknown; type?: unknown; recipient?: unknown;
  reminderTime?: unknown; weekStart?: unknown; carriedFrom?: unknown; done?: unknown;
};

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function weekStr(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

router.get("/bless", async (req, res): Promise<void> => {
  const user = req.user as { id: number } | undefined;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const weekStart = weekStr(req.query.weekStart);
  if (!weekStart) { res.status(400).json({ error: "weekStart required (YYYY-MM-DD)" }); return; }

  const intentions = await db
    .select()
    .from(blessIntentionTable)
    .where(and(eq(blessIntentionTable.userId, user.id), eq(blessIntentionTable.weekStart, weekStart)))
    .orderBy(desc(blessIntentionTable.createdAt));
  const [wk] = await db
    .select({ reviewedAt: blessWeekTable.reviewedAt })
    .from(blessWeekTable)
    .where(and(eq(blessWeekTable.userId, user.id), eq(blessWeekTable.weekStart, weekStart)));
  res.json({ intentions, reviewedAt: wk?.reviewedAt ?? null });
});

router.post("/bless", async (req, res): Promise<void> => {
  const user = req.user as { id: number } | undefined;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const b = (req.body ?? {}) as IntentionInput;
  const weekStart = weekStr(b.weekStart);
  const text = str(b.text, 280);
  if (!weekStart) { res.status(400).json({ error: "weekStart required" }); return; }
  if (!text) { res.status(400).json({ error: "text required" }); return; }
  const carriedFrom = typeof b.carriedFrom === "number" ? b.carriedFrom : null;
  // Carry-over is idempotent: if this source intention was already carried into
  // this week, return the existing row instead of inserting a duplicate — a
  // double-tap or a re-review must not stack copies into next week.
  if (carriedFrom !== null) {
    const [existing] = await db.select().from(blessIntentionTable).where(and(
      eq(blessIntentionTable.userId, user.id),
      eq(blessIntentionTable.weekStart, weekStart),
      eq(blessIntentionTable.carriedFrom, carriedFrom),
    ));
    if (existing) { res.json({ intention: existing }); return; }
  }
  const [row] = await db.insert(blessIntentionTable).values({
    userId: user.id,
    weekStart,
    text,
    type: str(b.type, 20),
    recipient: str(b.recipient, 120),
    reminderTime: str(b.reminderTime, 5),
    carriedFrom,
  }).returning();
  res.json({ intention: row });
});

router.patch("/bless/:id", async (req, res): Promise<void> => {
  const user = req.user as { id: number } | undefined;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = parseInt(req.params.id ?? "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const b = (req.body ?? {}) as IntentionInput;
  const patch: Record<string, unknown> = {};
  if (typeof b.text === "string") { const t = str(b.text, 280); if (t) patch.text = t; }
  if ("type" in b) patch.type = str(b.type, 20);
  if ("recipient" in b) patch.recipient = str(b.recipient, 120);
  if ("reminderTime" in b) { patch.reminderTime = str(b.reminderTime, 5); patch.reminderFiredDate = null; }
  if ("done" in b) patch.doneAt = b.done ? new Date() : null;
  if (Object.keys(patch).length === 0) { res.json({ ok: true }); return; }
  const [row] = await db.update(blessIntentionTable).set(patch)
    .where(and(eq(blessIntentionTable.id, id), eq(blessIntentionTable.userId, user.id)))
    .returning();
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ intention: row });
});

router.delete("/bless/:id", async (req, res): Promise<void> => {
  const user = req.user as { id: number } | undefined;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = parseInt(req.params.id ?? "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.delete(blessIntentionTable)
    .where(and(eq(blessIntentionTable.id, id), eq(blessIntentionTable.userId, user.id)));
  res.json({ ok: true });
});

router.post("/bless/review", async (req, res): Promise<void> => {
  const user = req.user as { id: number } | undefined;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const weekStart = weekStr((req.body as { weekStart?: unknown } | undefined)?.weekStart);
  if (!weekStart) { res.status(400).json({ error: "weekStart required" }); return; }
  await db.insert(blessWeekTable)
    .values({ userId: user.id, weekStart, reviewedAt: new Date() })
    .onConflictDoUpdate({
      target: [blessWeekTable.userId, blessWeekTable.weekStart],
      set: { reviewedAt: new Date() },
    });
  res.json({ ok: true });
});

export default router;
