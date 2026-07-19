import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, waitlistTable, betaUsersTable, usersTable } from "@workspace/db";
import { z } from "zod/v4";
import { rateLimit, getClientIp } from "../lib/rate-limit";

const router: IRouter = Router();

function getUser(req: any): { id: number; email?: string } | null {
  return req.user ? (req.user as { id: number; email?: string }) : null;
}

// Admin gate — mirrors the pattern in groups.ts (isBetaAdmin). Lives here
// so waitlist.ts isn't coupled to that file.
async function isBetaAdmin(userId: number): Promise<boolean> {
  try {
    const [u] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, userId));
    if (!u) return false;
    const [beta] = await db.select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch {
    return false;
  }
}

// ── Public submission ───────────────────────────────────────────────────────
// POST /api/waitlist — public endpoint, no auth required.
// Idempotent on email: re-submitting the same email returns ok without
// creating a duplicate row, so a refresh after submitting doesn't error.
router.post("/waitlist", rateLimit({ name: "waitlist_signup", max: 20, windowMs: 60 * 60 * 1000, keyFn: (req) => getClientIp(req), message: "Too many requests. Please try again later." }), async (req, res): Promise<void> => {
  const schema = z.object({
    email: z.string().email().max(254),
    name: z.string().min(1).max(120),
    reason: z.string().max(500).optional(),
    source: z.string().max(60).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please share a valid name and email." });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name.trim();
  const reason = parsed.data.reason?.trim() || null;
  const source = parsed.data.source?.trim() || "homepage";

  try {
    // Privacy (audit #16): this endpoint is unauthenticated, so the response
    // MUST NOT reveal whether the email already has an account, is already on
    // the waitlist, or is brand new — otherwise it becomes an account/email
    // existence oracle for a religious app. All three branches below return
    // the SAME generic { ok: true } shape and 200 status; only the
    // server-side write behavior differs.

    // If they already have a Phoebe account, don't add them to the waitlist.
    const [existingUser] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.email, email));
    if (existingUser) {
      res.json({ ok: true });
      return;
    }

    const [existing] = await db.select({ id: waitlistTable.id })
      .from(waitlistTable).where(eq(waitlistTable.email, email));
    if (existing) {
      res.json({ ok: true });
      return;
    }
    await db.insert(waitlistTable).values({ email, name, reason, source });

    // Fire-and-forget admin notification. Skipped silently if no admin
    // recipient is configured. We don't await — the user shouldn't wait
    // on Gmail to acknowledge before getting their success state.
    notifyAdminOfWaitlistSignup({ email, name, reason, source }).catch(err =>
      console.error("[waitlist] admin notification failed:", err),
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[waitlist] insert failed:", err);
    res.status(500).json({ error: "Couldn't save your spot. Please try again." });
  }
});

async function notifyAdminOfWaitlistSignup(_entry: {
  email: string; name: string; reason: string | null; source: string;
}): Promise<void> { return; }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Admin-only ──────────────────────────────────────────────────────────────
// GET /api/waitlist — list all entries, newest first
router.get("/waitlist", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(user.id))) {
    res.status(403).json({ error: "Admin access required" }); return;
  }
  const entries = await db.select()
    .from(waitlistTable)
    .orderBy(desc(waitlistTable.createdAt));
  res.json({ entries });
});

// POST /api/waitlist/:id/promote — add the entry to beta_users and remove
// it from the waitlist. Single transaction so a partial promote can't
// happen.
router.post("/waitlist/:id/promote", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(user.id))) {
    res.status(403).json({ error: "Admin access required" }); return;
  }
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [entry] = await db.select().from(waitlistTable).where(eq(waitlistTable.id, id));
  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }

  // Idempotent on beta_users (email is unique). If they're already a beta
  // user we just remove the waitlist entry.
  try {
    const [existingBeta] = await db.select({ id: betaUsersTable.id })
      .from(betaUsersTable).where(eq(betaUsersTable.email, entry.email));
    if (!existingBeta) {
      await db.insert(betaUsersTable).values({
        email: entry.email,
        name: entry.name,
        addedByUserId: user.id,
        isAdmin: false,
      });
    }
    await db.delete(waitlistTable).where(eq(waitlistTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[waitlist] promote failed:", err);
    res.status(500).json({ error: "Couldn't promote. Please try again." });
  }
});

// DELETE /api/waitlist/:id — drop an entry without promoting (e.g. spam)
router.delete("/waitlist/:id", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(user.id))) {
    res.status(403).json({ error: "Admin access required" }); return;
  }
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(waitlistTable).where(eq(waitlistTable.id, id));
  res.json({ ok: true });
});

export default router;
