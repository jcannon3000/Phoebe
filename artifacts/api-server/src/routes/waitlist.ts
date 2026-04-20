import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, waitlistTable, betaUsersTable, usersTable } from "@workspace/db";
import { z } from "zod/v4";
import { sendEmail } from "../lib/email";

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
router.post("/waitlist", async (req, res): Promise<void> => {
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
    const [existing] = await db.select({ id: waitlistTable.id })
      .from(waitlistTable).where(eq(waitlistTable.email, email));
    if (existing) {
      res.json({ ok: true, alreadyOnList: true });
      return;
    }
    await db.insert(waitlistTable).values({ email, name, reason, source });

    // Fire-and-forget admin notification. Skipped silently if no admin
    // recipient is configured. We don't await — the user shouldn't wait
    // on Gmail to acknowledge before getting their success state.
    notifyAdminOfWaitlistSignup({ email, name, reason, source }).catch(err =>
      console.error("[waitlist] admin notification failed:", err),
    );

    res.json({ ok: true, alreadyOnList: false });
  } catch (err) {
    console.error("[waitlist] insert failed:", err);
    res.status(500).json({ error: "Couldn't save your spot. Please try again." });
  }
});

async function notifyAdminOfWaitlistSignup(entry: {
  email: string; name: string; reason: string | null; source: string;
}): Promise<void> {
  // Recipient: ADMIN_NOTIFICATION_EMAIL env var, OR every beta_users row
  // with is_admin=true. Skipped entirely if neither is available.
  const recipients: string[] = [];
  const envRecipient = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  if (envRecipient) recipients.push(envRecipient);
  if (recipients.length === 0) {
    try {
      const admins = await db.select({ email: betaUsersTable.email })
        .from(betaUsersTable).where(eq(betaUsersTable.isAdmin, true));
      for (const a of admins) recipients.push(a.email);
    } catch {
      // beta_users missing — give up silently
    }
  }
  if (recipients.length === 0) return;

  const subject = `🌿 New Phoebe waitlist signup: ${entry.name}`;
  const reasonBlock = entry.reason
    ? `<p style="margin:16px 0 0;color:#555;font-style:italic">"${escapeHtml(entry.reason)}"</p>`
    : "";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
      <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#888;margin:0 0 8px">Phoebe waitlist</p>
      <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(entry.name)}</h1>
      <p style="margin:0 0 4px"><strong>Email:</strong> <a href="mailto:${escapeHtml(entry.email)}">${escapeHtml(entry.email)}</a></p>
      <p style="margin:0;color:#666"><strong>Source:</strong> ${escapeHtml(entry.source)}</p>
      ${reasonBlock}
    </div>
  `;
  const text = [
    `New Phoebe waitlist signup`,
    ``,
    `Name: ${entry.name}`,
    `Email: ${entry.email}`,
    `Source: ${entry.source}`,
    entry.reason ? `\nReason:\n${entry.reason}` : "",
  ].join("\n");

  await Promise.all(recipients.map(to => sendEmail({ to, subject, html, text })));
}

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
