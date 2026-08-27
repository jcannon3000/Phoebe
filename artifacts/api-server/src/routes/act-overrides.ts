/**
 * The admin art-library's curation state — see lib/db schema act_overrides.
 *
 * READ is public: the overrides are moderation state every device needs
 * before showing artwork (Visio is guest-allowed, and a DELETED work must be
 * gone for guests too). They contain nothing personal — a list of ACT record
 * ids with two booleans. WRITE is super-admin only.
 */
import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, actOverridesTable } from "@workspace/db";
import { isSuperAdminUser } from "../lib/superAdmin";

const router: IRouter = Router();

type SessionUser = { id: number; email: string };
function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

// GET /api/act-overrides — every override, tiny and cacheable.
router.get("/act-overrides", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({ actId: actOverridesTable.actId, hidden: actOverridesTable.hidden, isIcon: actOverridesTable.isIcon })
      .from(actOverridesTable);
    res.json({ overrides: rows });
  } catch {
    // A fresh env whose migration hasn't run yet — no overrides is a valid
    // answer, and artwork must keep rendering.
    res.json({ overrides: [] });
  }
});

// PUT /api/admin/act-overrides { actId, hidden?, isIcon? } — upsert one.
// Omitted fields keep their stored value; isIcon: null clears the toggle
// back to "wherever the harvest put it".
router.put("/admin/act-overrides", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "not_authenticated" }); return; }
  if (!(await isSuperAdminUser(session.id))) { res.status(403).json({ error: "forbidden" }); return; }
  const actId = Number(req.body?.actId);
  if (!Number.isInteger(actId) || actId <= 0) { res.status(400).json({ error: "bad_act_id" }); return; }
  const patch: { hidden?: boolean; isIcon?: boolean | null } = {};
  if (typeof req.body?.hidden === "boolean") patch.hidden = req.body.hidden;
  if (typeof req.body?.isIcon === "boolean" || req.body?.isIcon === null) patch.isIcon = req.body.isIcon;
  if (Object.keys(patch).length === 0) { res.status(400).json({ error: "nothing_to_set" }); return; }
  await db
    .insert(actOverridesTable)
    .values({ actId, hidden: patch.hidden ?? false, isIcon: patch.isIcon === undefined ? null : patch.isIcon, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: actOverridesTable.actId,
      set: {
        ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
        ...(patch.isIcon !== undefined ? { isIcon: patch.isIcon } : {}),
        updatedAt: new Date(),
      },
    });
  const [row] = await db
    .select({ actId: actOverridesTable.actId, hidden: actOverridesTable.hidden, isIcon: actOverridesTable.isIcon })
    .from(actOverridesTable)
    .where(sql`${actOverridesTable.actId} = ${actId}`);
  res.json({ override: row });
});

export default router;
