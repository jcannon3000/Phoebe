// Prescribed routines — a community admin / clergy designs a daily rhythm for
// someone (through the customizer in "prescribe" mode), which captures the
// routine as a portable spec and mints a token link. The recipient opens
// /routine/:token, sees what it contains, and on accept has it applied to
// their account.
//
// What "apply" writes: office prefs, home layout, contemplation goal / silence
// ladder, and the per-device rule-config. It NEVER touches the recipient's
// prayers, fellows, journals, or any other personal content.
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  prescribedRoutinesTable,
  usersTable,
  groupsTable,
  groupMembersTable,
} from "@workspace/db";
import { sanitizeSpec, applyRoutineSpecToUser } from "../lib/routineSpec";
import { isSuperAdminUser } from "../lib/superAdmin";

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "hidden_admin";
}

// Resolve the group for `slug` and confirm `userId` is an admin of it.
async function adminOfGroup(slug: string, userId: number) {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, slug));
  if (!group) return null;
  const [member] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.userId, userId)));
  if (!member || !member.joinedAt || !isAdminRole(member.role)) return null;
  return group;
}

// (sanitizeSpec / cleanHomeLayout / apply live in ../lib/routineSpec — shared
// with creator-season joins so the two accept paths can't drift.)

// ── POST /api/prescribed-routines — create ───────────────────────────────────
// With `groupSlug`: the clergy flow — must be an admin of that community.
// WITHOUT `groupSlug`: an app-wide PRESET rule — super admins only. Same
// spec/label/token shape either way; the row just has no group attached.
router.post("/prescribed-routines", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = (req.body ?? {}) as { groupSlug?: unknown; spec?: unknown; label?: unknown };
  let groupId: number | null = null;
  if (typeof body.groupSlug === "string" && body.groupSlug) {
    const group = await adminOfGroup(body.groupSlug, me);
    if (!group) { res.status(403).json({ error: "Admin access required" }); return; }
    groupId = group.id;
  } else {
    if (!(await isSuperAdminUser(me))) { res.status(403).json({ error: "Admin access required" }); return; }
  }
  const spec = sanitizeSpec(body.spec);
  if (!spec) { res.status(400).json({ error: "Invalid routine spec" }); return; }
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
  const token = crypto.randomBytes(16).toString("hex");
  try {
    await db.insert(prescribedRoutinesTable).values({
      token, groupId, createdByUserId: me, label, spec,
    });
    res.json({ token, url: `https://withphoebe.app/routine/${token}` });
  } catch (err) {
    console.error("[prescribed-routines] create failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/prescribed-routines/:token — public landing data ────────────────
router.get("/prescribed-routines/:token", async (req, res): Promise<void> => {
  const token = req.params.token;
  if (!/^[a-f0-9]{32}$/i.test(token)) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const [row] = await db.select({
      label: prescribedRoutinesTable.label,
      spec: prescribedRoutinesTable.spec,
      groupId: prescribedRoutinesTable.groupId,
      createdByUserId: prescribedRoutinesTable.createdByUserId,
    }).from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.token, token)).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    // Presets have no group — groupName stays null and the landing page just
    // shows the creator / "A rhythm for you".
    const [group] = row.groupId != null
      ? await db.select({ name: groupsTable.name }).from(groupsTable).where(eq(groupsTable.id, row.groupId)).limit(1)
      : [undefined];
    const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.createdByUserId)).limit(1);
    res.json({
      label: row.label,
      groupName: group?.name ?? null,
      createdByName: creator?.name ?? null,
      spec: row.spec,
    });
  } catch (err) {
    console.error("[prescribed-routines] get failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/prescribed-routines/:token/accept — apply to my account ────────
router.post("/prescribed-routines/:token/accept", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = req.params.token;
  if (!/^[a-f0-9]{32}$/i.test(token)) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const [row] = await db.select({ id: prescribedRoutinesTable.id, spec: prescribedRoutinesTable.spec })
      .from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.token, token)).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const spec = sanitizeSpec(row.spec);
    if (!spec) { res.status(422).json({ error: "Routine is no longer valid" }); return; }
    await applyRoutineSpecToUser(me, spec);
    await db.update(prescribedRoutinesTable)
      .set({ acceptCount: sql`${prescribedRoutinesTable.acceptCount} + 1` })
      .where(eq(prescribedRoutinesTable.id, row.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[prescribed-routines] accept failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
