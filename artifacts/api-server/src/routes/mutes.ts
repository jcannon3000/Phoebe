import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, userMutesTable, usersTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function getUser(req: any): { id: number } | null {
  return req.user ? (req.user as { id: number }) : null;
}

// GET /api/mutes — list users I have muted (with names for display)
router.get("/mutes", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db
      .select({
        userId: userMutesTable.mutedUserId,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: userMutesTable.createdAt,
      })
      .from(userMutesTable)
      .innerJoin(usersTable, eq(usersTable.id, userMutesTable.mutedUserId))
      .where(eq(userMutesTable.muterId, user.id));

    res.json({ muted: rows });
  } catch (err) {
    console.error("GET /api/mutes error:", err);
    res.json({ muted: [] });
  }
});

// POST /api/mutes/by-email — mute a user by email (idempotent)
router.post("/mutes/by-email", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid email" }); return; }

    const [target] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, parsed.data.email.toLowerCase()));
    if (!target) { res.status(404).json({ error: "User not found" }); return; }
    if (target.id === user.id) { res.status(400).json({ error: "Cannot mute yourself" }); return; }

    await db.insert(userMutesTable)
      .values({ muterId: user.id, mutedUserId: target.id })
      .onConflictDoNothing();

    res.json({ ok: true, userId: target.id });
  } catch (err) {
    console.error("POST /api/mutes/by-email error:", err);
    res.status(500).json({ error: "Failed to mute user" });
  }
});

// POST /api/mutes/:userId — mute a user (idempotent)
router.post("/mutes/:userId", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const mutedUserId = parseInt(req.params.userId, 10);
    if (isNaN(mutedUserId)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    if (mutedUserId === user.id) { res.status(400).json({ error: "Cannot mute yourself" }); return; }

    await db
      .insert(userMutesTable)
      .values({ muterId: user.id, mutedUserId })
      .onConflictDoNothing();

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/mutes/:userId error:", err);
    res.status(500).json({ error: "Failed to mute user" });
  }
});

// DELETE /api/mutes/:userId — unmute a user
router.delete("/mutes/:userId", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const mutedUserId = parseInt(req.params.userId, 10);
    if (isNaN(mutedUserId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

    await db
      .delete(userMutesTable)
      .where(and(eq(userMutesTable.muterId, user.id), eq(userMutesTable.mutedUserId, mutedUserId)));

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/mutes/:userId error:", err);
    res.status(500).json({ error: "Failed to unmute user" });
  }
});

export default router;
