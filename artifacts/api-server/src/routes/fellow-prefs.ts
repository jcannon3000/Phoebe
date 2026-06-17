// Per-fellow sharing settings — the owner's one-way prefs toward each fellow:
//   • samePlace  — subjective "lives in the same place as me"
//   • sharePlans — whether my fellow_plans are visible to this fellow (default on)
// "Share daily progress" is NOT here — that's Walking together (walk_pairings),
// a mutual opt-in driven by /api/walk.
import { Router, type IRouter } from "express";
import { eq, and, or } from "drizzle-orm";
import { db, fellowPrefsTable, fellowsTable, usersTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}
async function areFellows(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: fellowsTable.id }).from(fellowsTable).where(or(
    and(eq(fellowsTable.userId, a), eq(fellowsTable.fellowUserId, b)),
    and(eq(fellowsTable.userId, b), eq(fellowsTable.fellowUserId, a)),
  )).limit(1);
  return rows.length > 0;
}

// GET /api/fellow-prefs — my settings for every fellow, keyed by fellowUserId.
// Missing entries default to { samePlace:false, sharePlans:true }.
router.get("/fellow-prefs", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select({
    fellowUserId: fellowPrefsTable.fellowUserId,
    samePlace: fellowPrefsTable.samePlace,
    sharePlans: fellowPrefsTable.sharePlans,
  }).from(fellowPrefsTable).where(eq(fellowPrefsTable.ownerId, me));
  const prefs: Record<number, { samePlace: boolean; sharePlans: boolean }> = {};
  for (const r of rows) prefs[r.fellowUserId] = { samePlace: r.samePlace, sharePlans: r.sharePlans };
  res.json({ prefs });
});

// PATCH /api/fellow-prefs/:fellowUserId { samePlace?, sharePlans? } — upsert.
const bodySchema = z.object({
  samePlace: z.boolean().optional(),
  sharePlans: z.boolean().optional(),
}).refine((b) => b.samePlace !== undefined || b.sharePlans !== undefined, { message: "nothing to update" });

router.patch("/fellow-prefs/:fellowUserId", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const fellowUserId = parseInt(String(req.params.fellowUserId), 10);
  if (!Number.isInteger(fellowUserId) || fellowUserId === me) { res.status(400).json({ error: "Invalid fellow" }); return; }
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  if (!(await areFellows(me, fellowUserId))) { res.status(403).json({ error: "Not a fellow" }); return; }

  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, fellowUserId));
  if (!target) { res.status(404).json({ error: "Not found" }); return; }

  const { samePlace, sharePlans } = parsed.data;
  const [existing] = await db.select().from(fellowPrefsTable)
    .where(and(eq(fellowPrefsTable.ownerId, me), eq(fellowPrefsTable.fellowUserId, fellowUserId)));
  if (existing) {
    await db.update(fellowPrefsTable).set({
      ...(samePlace !== undefined ? { samePlace } : {}),
      ...(sharePlans !== undefined ? { sharePlans } : {}),
      updatedAt: new Date(),
    }).where(eq(fellowPrefsTable.id, existing.id));
  } else {
    await db.insert(fellowPrefsTable).values({
      ownerId: me,
      fellowUserId,
      samePlace: samePlace ?? false,
      sharePlans: sharePlans ?? true,
    });
  }
  res.json({
    ok: true,
    samePlace: samePlace ?? existing?.samePlace ?? false,
    sharePlans: sharePlans ?? existing?.sharePlans ?? true,
  });
});

export default router;
