import { Router, type IRouter, type RequestHandler } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, fellowsTable, usersTable, betaUsersTable, pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function getUser(req: any): { id: number; email?: string } | null {
  return req.user ? (req.user as { id: number; email?: string }) : null;
}

// Fellows is a beta-gated feature. Every endpoint in this router rejects
// non-beta callers with 403 so a stale UI build (or a curl) can't reach
// it. Beta status comes from the same `beta_users` table the dashboard
// uses for its `useBetaStatus` hook.
const requireBeta: RequestHandler = async (req, res, next) => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [beta] = await db.select({ email: betaUsersTable.email })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (!beta) {
      res.status(403).json({ error: "Fellows is currently a beta-only feature." });
      return;
    }
    next();
  } catch {
    // beta_users table missing or other infra issue — fail closed.
    res.status(403).json({ error: "Fellows is currently a beta-only feature." });
  }
};


// GET /api/fellows — list my fellows (with names for display)
router.get("/fellows", requireBeta, async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db
      .select({
        id: fellowsTable.id,
        userId: fellowsTable.fellowUserId,
        name: usersTable.name,
        email: usersTable.email,
        avatarUrl: usersTable.avatarUrl,
        note: fellowsTable.note,
        createdAt: fellowsTable.createdAt,
      })
      .from(fellowsTable)
      .innerJoin(usersTable, eq(usersTable.id, fellowsTable.fellowUserId))
      .where(eq(fellowsTable.userId, user.id));

    // Also fetch pending outbound invites so UI can show "Invited" label
    const outbound = await pool.query(
      `SELECT fi.id, fi.recipient_email, fi.status, fi.created_at,
              u.name AS recipient_name, u.id AS recipient_user_id
       FROM fellow_invites fi
       LEFT JOIN users u ON u.id = fi.recipient_id
       WHERE fi.sender_id = $1 AND fi.status = 'pending'
       ORDER BY fi.created_at DESC`,
      [user.id],
    );

    const pendingInvites = outbound.rows.map((r: any) => ({
      id: r.id,
      recipientEmail: r.recipient_email,
      recipientName: r.recipient_name || r.recipient_email.split("@")[0],
      recipientUserId: r.recipient_user_id,
      status: r.status,
      createdAt: r.created_at,
    }));

    res.json({ fellows: rows, pendingInvites });
  } catch (err) {
    console.error("GET /api/fellows error:", err);
    res.json({ fellows: [], pendingInvites: [] });
  }
});

// GET /api/fellows/invites — get incoming pending invites for current user
router.get("/fellows/invites", requireBeta, async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const result = await pool.query(
      `SELECT fi.id, fi.sender_id, fi.created_at,
              u.name AS sender_name, u.email AS sender_email
       FROM fellow_invites fi
       JOIN users u ON u.id = fi.sender_id
       WHERE fi.recipient_id = $1 AND fi.status = 'pending'
       ORDER BY fi.created_at DESC`,
      [user.id],
    );

    // For each invite, check for mutual practices/groups
    const invites = await Promise.all(
      result.rows.map(async (r: any) => {
        const mutual = await pool.query(
          `SELECT sm.name FROM shared_moments sm
           JOIN moment_user_tokens mut1 ON mut1.moment_id = sm.id
           JOIN moment_user_tokens mut2 ON mut2.moment_id = sm.id
           WHERE mut1.user_id = $1 AND mut2.user_id = $2
           LIMIT 3`,
          [user.id, r.sender_id],
        );
        return {
          id: r.id,
          senderId: r.sender_id,
          senderName: r.sender_name || r.sender_email.split("@")[0],
          senderEmail: r.sender_email,
          createdAt: r.created_at,
          mutualPractices: mutual.rows.map((m: any) => m.name),
        };
      }),
    );

    res.json({ invites, count: invites.length });
  } catch (err) {
    console.error("GET /api/fellows/invites error:", err);
    res.json({ invites: [], count: 0 });
  }
});

// GET /api/fellows/invites/count — lightweight count for sidebar badge
router.get("/fellows/invites/count", requireBeta, async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.json({ count: 0 }); return; }

    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM fellow_invites
       WHERE recipient_id = $1 AND status = 'pending'`,
      [user.id],
    );

    res.json({ count: result.rows[0]?.count ?? 0 });
  } catch (err) {
    console.error("GET /api/fellows/invites/count error:", err);
    res.json({ count: 0 });
  }
});

// POST /api/fellows — send a fellow invite (or add directly if mutual)
router.post("/fellows", requireBeta, async (req, res): Promise<void> => {
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

    let targetEmail: string;
    let targetUserId: number | null = null;

    if (parsed.data.userId) {
      const [target] = await db.select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, parsed.data.userId));
      if (!target) { res.status(404).json({ error: "User not found" }); return; }
      targetEmail = target.email;
      targetUserId = target.id;
    } else {
      targetEmail = parsed.data.email!.toLowerCase();
      const [target] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, targetEmail));
      if (target) targetUserId = target.id;
    }

    if (targetUserId === user.id) { res.status(400).json({ error: "Cannot add yourself" }); return; }

    // Create a pending invite
    await pool.query(
      `INSERT INTO fellow_invites (sender_id, recipient_id, recipient_email, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT DO NOTHING`,
      [user.id, targetUserId, targetEmail],
    );

    res.json({ ok: true, invited: true, recipientEmail: targetEmail });
  } catch (err) {
    console.error("POST /api/fellows error:", err);
    res.status(500).json({ error: "Failed to send invite" });
  }
});

// POST /api/fellows/invites/:id/accept — accept an incoming invite
router.post("/fellows/invites/:id/accept", requireBeta, async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const inviteId = parseInt(req.params.id as string, 10);
    if (isNaN(inviteId)) { res.status(400).json({ error: "Invalid invite ID" }); return; }

    // Get the invite
    const inviteResult = await pool.query(
      `SELECT id, sender_id, recipient_id FROM fellow_invites
       WHERE id = $1 AND recipient_id = $2 AND status = 'pending'`,
      [inviteId, user.id],
    );

    if (inviteResult.rows.length === 0) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    const invite = inviteResult.rows[0];

    // Mark invite as accepted
    await pool.query(
      `UPDATE fellow_invites SET status = 'accepted' WHERE id = $1`,
      [inviteId],
    );

    // Create mutual fellows relationship (both directions)
    await db.insert(fellowsTable)
      .values({ userId: user.id, fellowUserId: invite.sender_id })
      .onConflictDoNothing();
    await db.insert(fellowsTable)
      .values({ userId: invite.sender_id, fellowUserId: user.id })
      .onConflictDoNothing();

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/fellows/invites/:id/accept error:", err);
    res.status(500).json({ error: "Failed to accept invite" });
  }
});

// POST /api/fellows/invites/:id/dismiss — dismiss (not now) an invite
router.post("/fellows/invites/:id/dismiss", requireBeta, async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const inviteId = parseInt(req.params.id as string, 10);
    if (isNaN(inviteId)) { res.status(400).json({ error: "Invalid invite ID" }); return; }

    // Just return ok — invite stays pending, badge count remains.
    // We can optionally track a "dismissed_at" later if needed.
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/fellows/invites/:id/dismiss error:", err);
    res.status(500).json({ error: "Failed to dismiss invite" });
  }
});

// DELETE /api/fellows/:userId — remove a fellow
router.delete("/fellows/:userId", requireBeta, async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const fellowUserId = parseInt(req.params.userId as string, 10);
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
