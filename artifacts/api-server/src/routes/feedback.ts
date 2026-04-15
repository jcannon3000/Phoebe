import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, feedbackTable, betaUsersTable, usersTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

type SessionUser = { id: number; email: string; name: string };

function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

async function isBetaAdmin(userId: number): Promise<boolean> {
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return false;
  try {
    const [beta] = await db.select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch {
    return false;
  }
}

// POST /api/feedback — submit feedback (any authenticated user)
router.post("/feedback", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const schema = z.object({ message: z.string().min(1).max(5000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Message is required" }); return; }

    const [row] = await db.insert(feedbackTable).values({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      message: parsed.data.message,
    }).returning({ id: feedbackTable.id });

    res.json({ ok: true, id: row.id });
  } catch (err) {
    console.error("POST /api/feedback error:", err);
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

// GET /api/feedback — list all feedback (admin only)
router.get("/feedback", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const rows = await db.select({
      id: feedbackTable.id,
      userName: feedbackTable.userName,
      userEmail: feedbackTable.userEmail,
      message: feedbackTable.message,
      createdAt: feedbackTable.createdAt,
    }).from(feedbackTable).orderBy(desc(feedbackTable.createdAt));

    res.json({ feedback: rows });
  } catch (err) {
    console.error("GET /api/feedback error:", err);
    res.status(500).json({ error: "Failed to load feedback" });
  }
});

export default router;
