import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, fellowsTable, usersTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function getUser(req: any): { id: number } | null {
  return req.user ? (req.user as { id: number }) : null;
}

// GET /api/fellows — list my fellows (with names for display)
router.get("/fellows", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db
      .select({
        id: fellowsTable.id,
        userId: fellowsTable.fellowUserId,
        name: usersTable.name,
        email: usersTable.email,
        note: fellowsTable.note,
        createdAt: fellowsTable.createdAt,
      })
      .from(fellowsTable)
      .innerJoin(usersTable, eq(usersTable.id, fellowsTable.fellowUserId))
      .where(eq(fellowsTable.userId, user.id));

    res.json({ fellows: rows });
  } catch (err) {
    console.error("GET /api/fellows error:", err);
    res.json({ fellows: [] });
  }
});

// POST /api/fellows — add a fellow by email (or userId)
router.post("/fellows", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const schema = z.object({
      email: z.string().email().optional(),
      userId: z.number().int().optional(),
      note: z.string().max(200).optional(),
    }).refine(d => d.email || d.userId, { message: "email or userId required" });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

    let fellowUserId: number;

    if (parsed.data.userId) {
      fellowUserId = parsed.data.userId;
    } else {
      const [target] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, parsed.data.email!.toLowerCase()));
      if (!target) { res.status(404).json({ error: "User not found on Phoebe" }); return; }
      fellowUserId = target.id;
    }

    if (fellowUserId === user.id) { res.status(400).json({ error: "Cannot add yourself" }); return; }

    await db.insert(fellowsTable)
      .values({ userId: user.id, fellowUserId, note: parsed.data.note ?? null })
      .onConflictDoNothing();

    res.json({ ok: true, fellowUserId });
  } catch (err) {
    console.error("POST /api/fellows error:", err);
    res.status(500).json({ error: "Failed to add fellow" });
  }
});

// DELETE /api/fellows/:userId — remove a fellow
router.delete("/fellows/:userId", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const fellowUserId = parseInt(req.params.userId, 10);
    if (isNaN(fellowUserId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

    await db
      .delete(fellowsTable)
      .where(and(eq(fellowsTable.userId, user.id), eq(fellowsTable.fellowUserId, fellowUserId)));

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/fellows/:userId error:", err);
    res.status(500).json({ error: "Failed to remove fellow" });
  }
});

export default router;
