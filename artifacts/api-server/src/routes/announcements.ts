import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { isSuperAdminUser } from "../lib/superAdmin";
import { sendPushToUsers } from "../lib/pushSender";

/**
 * ANNOUNCEMENTS — a note from the owner that sits at the top of everyone's home,
 * and (when the owner chooses) goes out as a push notification too.
 *
 * Owner (2026-10-08): "I want to be able to put an announcement on phoebe,
 * maybe like the begin here card, and have it send a notification about it."
 *
 * One announcement is live at a time: the newest that has not been retired and
 * has not expired. Writing a new one replaces the old on every home. The push is
 * a CHOICE made on the admin page (a checkbox, then a confirm) — nothing here
 * ever sends on its own, and it goes out once: push_sent_at is set before the
 * fan-out starts, so a double-click or a retry cannot send it twice.
 *
 * Audience of the push: every user with a device token or a web-push
 * subscription, signed in or not (a phone without an account is an anonymous
 * device user and is reachable ONLY by push). sendPushToUser still honours each
 * person's master notifications switch.
 */

const router: IRouter = Router();

type Row = {
  id: number;
  title: string;
  body: string;
  link_path: string | null;
  link_label: string | null;
  created_at: string;
  expires_at: string | null;
  retired_at: string | null;
  push_sent_at: string | null;
  push_count: number | null;
};

const shape = (r: Row) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  linkPath: r.link_path,
  linkLabel: r.link_label,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  retiredAt: r.retired_at,
  pushSentAt: r.push_sent_at,
  pushCount: r.push_count,
});

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

async function requireAdmin(req: Request, res: Response): Promise<number | null> {
  const userId = uid(req);
  if (userId == null) { res.status(401).json({ error: "unauthorized" }); return null; }
  if (!(await isSuperAdminUser(userId))) { res.status(403).json({ error: "forbidden" }); return null; }
  return userId;
}

/** In-app paths only: "/something", never "//host" or a scheme. */
function cleanPath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const p = v.trim();
  if (!p) return null;
  return /^\/(?!\/)[^\s]*$/.test(p) ? p.slice(0, 300) : null;
}

// GET /api/announcements/active — public; the same for every viewer.
router.get("/announcements/active", async (_req: Request, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "public, max-age=60");
  try {
    const r = await db.execute(sql`
      SELECT * FROM announcements
      WHERE retired_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC, id DESC LIMIT 1`);
    const row = (r.rows as Row[])[0];
    res.json({ announcement: row ? shape(row) : null });
  } catch (err) {
    console.warn("[announcements] read failed:", err);
    res.json({ announcement: null });
  }
});

// GET /api/admin/announcements — super admin; recent history.
router.get("/admin/announcements", async (req: Request, res: Response): Promise<void> => {
  if ((await requireAdmin(req, res)) == null) return;
  const r = await db.execute(sql`SELECT * FROM announcements ORDER BY created_at DESC, id DESC LIMIT 30`);
  res.setHeader("Cache-Control", "no-store");
  res.json({ announcements: (r.rows as Row[]).map(shape) });
});

// GET /api/admin/announcements/audience — how many people a push would reach.
router.get("/admin/announcements/audience", async (req: Request, res: Response): Promise<void> => {
  if ((await requireAdmin(req, res)) == null) return;
  res.setHeader("Cache-Control", "no-store");
  res.json({ count: (await pushAudience()).length });
});

async function pushAudience(): Promise<number[]> {
  const r = await db.execute(sql`
    SELECT user_id FROM device_tokens
    UNION
    SELECT user_id FROM web_push_subscriptions`);
  return (r.rows as Array<{ user_id: number }>).map((x) => x.user_id);
}

// POST /api/admin/announcements { title, body, linkPath?, linkLabel?, expiresInDays?, push? }
router.post("/admin/announcements", async (req: Request, res: Response): Promise<void> => {
  const userId = await requireAdmin(req, res);
  if (userId == null) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 80) : "";
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 400) : "";
  if (!title || !body) { res.status(400).json({ error: "A title and a message are both needed." }); return; }
  const linkPath = cleanPath(b.linkPath);
  if (typeof b.linkPath === "string" && b.linkPath.trim() && !linkPath) {
    res.status(400).json({ error: "The link must be a path inside Phoebe, like /rosary." }); return;
  }
  const linkLabel = linkPath && typeof b.linkLabel === "string" && b.linkLabel.trim() ? b.linkLabel.trim().slice(0, 30) : linkPath ? "Open" : null;
  const days = typeof b.expiresInDays === "number" && b.expiresInDays > 0 ? Math.min(Math.floor(b.expiresInDays), 365) : null;
  const wantPush = b.push === true;

  const ins = await db.execute(sql`
    INSERT INTO announcements (title, body, link_path, link_label, expires_at, created_by)
    VALUES (${title}, ${body}, ${linkPath}, ${linkLabel},
            ${days ? sql`NOW() + make_interval(days => ${days})` : sql`NULL`}, ${userId})
    RETURNING *`);
  let row = (ins.rows as Row[])[0];

  if (wantPush) {
    // Claim the send BEFORE fanning out: a second request finds push_sent_at set.
    const claimed = await db.execute(sql`
      UPDATE announcements SET push_sent_at = NOW() WHERE id = ${row.id} AND push_sent_at IS NULL RETURNING *`);
    if ((claimed.rows as Row[]).length) {
      const audience = await pushAudience();
      await db.execute(sql`UPDATE announcements SET push_count = ${audience.length} WHERE id = ${row.id}`);
      void sendPushToUsers(audience, {
        title,
        body,
        path: linkPath ?? "/dashboard",
        threadId: "announcement",
        collapseId: `announcement-${row.id}`,
      }).catch((err) => console.warn("[announcements] push fan-out failed:", err));
      row = { ...(claimed.rows as Row[])[0], push_count: audience.length };
    }
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ announcement: shape(row) });
});

// POST /api/admin/announcements/:id/retire — takes it off every home.
router.post("/admin/announcements/:id/retire", async (req: Request, res: Response): Promise<void> => {
  if ((await requireAdmin(req, res)) == null) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.execute(sql`UPDATE announcements SET retired_at = NOW() WHERE id = ${id} AND retired_at IS NULL`);
  res.json({ ok: true });
});

export default router;
