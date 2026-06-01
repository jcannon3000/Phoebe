import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { emailUnsubToken, verifyEmailUnsubToken } from "../lib/email";

// ── Email unsubscribe ────────────────────────────────────────────────────────
// Public, token-authenticated endpoints behind the "Unsubscribe" link + the
// List-Unsubscribe header on every bulk email. No session required (the link
// is opened from an inbox, often logged out) — a stateless HMAC of the user id
// (see lib/email.ts) is the credential. Setting email_enabled=false suppresses
// all non-essential mail server-side (the gate in lib/email.ts); transactional
// mail (password resets) is never affected.

const router = Router();
const APP_BASE_URL = (process.env["APP_BASE_URL"] ?? "https://withphoebe.app").replace(/\/$/, "");

// Minimal standalone confirmation page — no app shell (hit from an email
// client). Only env / server-derived values are interpolated; nothing
// user-controlled reaches the HTML.
function page(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} · Phoebe</title></head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:48px 16px;"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:36px 32px;text-align:center;">
      <tr><td>
        <div style="margin-bottom:20px;"><span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🌱 Phoebe</span></div>
        ${bodyHtml}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// Verify the signed link → the user id, or null if invalid.
function verifiedUserId(req: Request): number | null {
  const userId = parseInt(String(req.query.u ?? ""), 10);
  const token = String(req.query.t ?? "");
  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (!verifyEmailUnsubToken(userId, token)) return null;
  return userId;
}

async function setEmailEnabled(userId: number, enabled: boolean): Promise<void> {
  await db
    .update(usersTable)
    .set({ emailEnabled: enabled } as Record<string, unknown>)
    .where(eq(usersTable.id, userId));
}

// One-click unsubscribe (RFC 8058 List-Unsubscribe-Post). The mail client
// POSTs here on explicit user action; the signed token authenticates. Always
// 200 on a valid token so the client shows success.
router.post("/email/unsubscribe", async (req: Request, res: Response): Promise<void> => {
  const userId = verifiedUserId(req);
  if (userId == null) { res.status(400).send("Invalid unsubscribe link."); return; }
  try { await setEmailEnabled(userId, false); } catch (err) { console.error("[email-unsub] POST failed:", err); }
  res.status(200).send("Unsubscribed.");
});

// Human click (GET). Unsubscribes by default; ?resub=1 re-subscribes. Renders
// a confirmation with the reverse action so a mis-click (or a mail-client link
// prefetch) is one tap to undo.
router.get("/email/unsubscribe", async (req: Request, res: Response): Promise<void> => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const userId = verifiedUserId(req);
  if (userId == null) {
    res.status(400).send(page("Link not valid",
      `<p style="font-size:15px;color:#3a3632;line-height:1.6;margin:0;">This unsubscribe link isn't valid or has expired. You can manage emails anytime in <a href="${APP_BASE_URL}/settings" style="color:#4a7c59;">your settings</a>.</p>`));
    return;
  }
  const resub = String(req.query.resub ?? "") === "1";
  try { await setEmailEnabled(userId, resub); } catch (err) { console.error("[email-unsub] GET failed:", err); }

  if (resub) {
    res.send(page("Resubscribed",
      `<h1 style="font-size:20px;color:#2d2a26;margin:0 0 12px;">You're resubscribed</h1>
       <p style="font-size:15px;color:#3a3632;line-height:1.6;margin:0 0 20px;">You'll receive Phoebe's occasional emails again.</p>
       <a href="${APP_BASE_URL}/settings" style="display:inline-block;background:#4a7c59;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;">Manage email settings</a>`));
    return;
  }
  // Rebuild the resubscribe link from a freshly-computed token (never echo
  // the raw query param back into the HTML).
  const resubUrl = `${APP_BASE_URL}/api/email/unsubscribe?u=${userId}&t=${emailUnsubToken(userId)}&resub=1`;
  res.send(page("Unsubscribed",
    `<h1 style="font-size:20px;color:#2d2a26;margin:0 0 12px;">You've been unsubscribed</h1>
     <p style="font-size:15px;color:#3a3632;line-height:1.6;margin:0 0 20px;">You won't get newsletters, the weekly prayer-feed digest, or other non-essential emails from Phoebe. Account and security emails (like password resets) will still arrive.</p>
     <a href="${resubUrl}" style="display:inline-block;background:#4a7c59;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;">Resubscribe</a>`));
});

export default router;
