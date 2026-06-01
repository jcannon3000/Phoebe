import { google } from "googleapis";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { INVITES_FROM_HEADER, getInvitesRefreshToken } from "./invitesAccount";
import type { FeedDigest } from "./feedDigest";

// ── Unsubscribe (non-essential email opt-out) ────────────────────────────────
// Bulk emails (newsletters, announcements, the weekly digest, prayer-invite
// prompts) carry an Unsubscribe link + a List-Unsubscribe header, and are
// suppressed for any recipient whose users.email_enabled is false. The link
// is authenticated by a stateless HMAC of the user id (no DB token to store
// or expire), so it works from a logged-out inbox and from Gmail/Apple Mail's
// one-click List-Unsubscribe-Post. Transactional mail (password resets, magic
// links) never calls the gate and never carries the footer.
const APP_BASE_URL = (process.env["APP_BASE_URL"] ?? "https://withphoebe.app").replace(/\/$/, "");
const UNSUB_SECRET =
  process.env["EMAIL_UNSUB_SECRET"] || process.env["SESSION_SECRET"] || "dev-unsub-secret-change-me";

export function emailUnsubToken(userId: number): string {
  return createHmac("sha256", UNSUB_SECRET).update(`email-unsub:${userId}`).digest("base64url");
}

export function verifyEmailUnsubToken(userId: number, token: string): boolean {
  if (!Number.isFinite(userId) || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(emailUnsubToken(userId));
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export function unsubscribeUrl(userId: number): string {
  return `${APP_BASE_URL}/api/email/unsubscribe?u=${userId}&t=${emailUnsubToken(userId)}`;
}

// Resolve a recipient email to its account (case-insensitive). Returns the
// user id + whether bulk email is suppressed for them. Non-users (arbitrary
// addresses) → null (send, but no unsubscribe footer — there's no account to
// unsubscribe). A DB hiccup also returns null so a send path never crashes on
// the lookup; the worst case is one email without a footer link.
async function resolveBulkRecipient(to: string): Promise<{ userId: number; suppressed: boolean } | null> {
  const email = (to ?? "").trim().toLowerCase();
  if (!email) return null;
  try {
    const [u] = await db
      .select({ id: usersTable.id, emailEnabled: usersTable.emailEnabled })
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email}`)
      .limit(1);
    if (!u) return null;
    return { userId: u.id, suppressed: u.emailEnabled === false };
  } catch (err) {
    console.error("[email] resolveBulkRecipient failed:", err);
    return null;
  }
}

// Footer for bulk/non-essential email. With a userId we append a one-click
// Unsubscribe link; for non-user recipients we keep the plain membership line.
function bulkFooterHtml(unsubUrl: string | null): string {
  const unsub = unsubUrl
    ? ` <a href="${unsubUrl}" style="color:#6b6460;text-decoration:underline;">Unsubscribe</a> from these emails.`
    : "";
  return `<p style="margin:8px 0 0;font-size:12px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">You're receiving this because you're a member of Phoebe.${unsub}</p>`;
}
function bulkFooterText(unsubUrl: string | null): string {
  return `You're receiving this because you're a member of Phoebe.${unsubUrl ? `\nUnsubscribe: ${unsubUrl}` : ""}`;
}

// RFC 8058 one-click unsubscribe headers — set on every bulk email so Gmail /
// Apple Mail show their native "Unsubscribe" affordance (and so bulk-sender
// reputation requirements are met). Empty when there's no per-user link.
function listUnsubHeaders(unsubUrl: string | null): Record<string, string> {
  if (!unsubUrl) return {};
  return {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// Escape a string before interpolating it into email HTML. Names,
// group names, and admin-chosen prompts are all user-controlled; an
// unescaped <img onerror> in any of them would be stored XSS that
// fans out to every recipient's inbox.
export function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"],
    process.env["GOOGLE_CLIENT_SECRET"],
    process.env["GOOGLE_REDIRECT_URI"]
  );
}

let cachedAccessToken: string | null = null;
let cachedTokenExpiry: number | null = null;

export async function getGmailClient() {
  const refreshToken = getInvitesRefreshToken();
  if (!refreshToken) {
    console.warn("No Google refresh token set — email sending disabled");
    return null;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: cachedAccessToken,
    refresh_token: refreshToken,
    expiry_date: cachedTokenExpiry,
  });

  oauth2Client.on("tokens", (tokens) => {
    if (tokens.access_token) cachedAccessToken = tokens.access_token;
    if (tokens.expiry_date) cachedTokenExpiry = tokens.expiry_date;
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

// Shared extractor for Gmail / OAuth errors. Pulls the actionable bits
// (HTTP status, Gmail reason code, OAuth error/description) into a flat
// shape so the silent-fail send paths can log something useful in
// Railway logs without recreating the same try/catch boilerplate in
// every helper. See sendNewsletterEmailDiagnostic for the same shape
// in a return-value form (used by the newsletter preview toast).
export function parseGmailError(err: unknown): {
  code: number | undefined;
  reason: string | undefined;          // Gmail-side reason code (e.g. "quotaExceeded")
  message: string | undefined;          // human-readable message
  oauthError: string | undefined;       // OAuth error code (e.g. "invalid_grant")
  oauthDescription: string | undefined; // OAuth error description (most actionable)
  short: string;                        // one-line summary for log lines
} {
  const e = err as {
    code?: number;
    status?: number;
    message?: string;
    response?: {
      status?: number;
      data?: { error?: string; error_description?: string } | unknown;
    };
    errors?: Array<{ reason?: string; message?: string }>;
  };
  const code = e?.code ?? e?.status ?? e?.response?.status;
  const reason = e?.errors?.[0]?.reason;
  const data = e?.response?.data as { error?: string; error_description?: string } | undefined;
  const oauthError = data?.error;
  const oauthDescription = data?.error_description;
  const message = oauthDescription || e?.errors?.[0]?.message || e?.message;
  const parts: string[] = [];
  if (code != null) parts.push(`code ${code}`);
  if (reason) parts.push(reason);
  else if (oauthError) parts.push(oauthError);
  if (message && message !== oauthError) parts.push(message);
  return {
    code,
    reason,
    message,
    oauthError,
    oauthDescription,
    short: parts.length > 0 ? parts.join(" · ") : "no further detail",
  };
}

// Cheap health probe — verifies the Gmail OAuth chain is intact without
// actually sending anything. Returns the connected mailbox's address on
// success (sanity check that the refresh token belongs to the right
// account), or the parsed error reason on failure. Used by the
// /api/admin/email-health endpoint so an admin can diagnose "emails not
// arriving" without grepping Railway logs.
export async function checkEmailHealth(): Promise<
  | { ok: true; profileEmail: string; refreshTokenSource: "INVITES_GOOGLE_REFRESH_TOKEN" | "SCHEDULER_GOOGLE_REFRESH_TOKEN" }
  | { ok: false; stage: "refresh_token_missing" | "gmail_client" | "profile_fetch"; reason: string }
> {
  // Step 1: do we even have a refresh token?
  const hasInvites = !!process.env["INVITES_GOOGLE_REFRESH_TOKEN"];
  const hasScheduler = !!process.env["SCHEDULER_GOOGLE_REFRESH_TOKEN"];
  if (!hasInvites && !hasScheduler) {
    return {
      ok: false,
      stage: "refresh_token_missing",
      reason:
        "Neither INVITES_GOOGLE_REFRESH_TOKEN nor SCHEDULER_GOOGLE_REFRESH_TOKEN is set. Run /api/auth/scheduler/setup to mint a fresh token, then set it on Railway.",
    };
  }
  const refreshTokenSource = hasInvites
    ? "INVITES_GOOGLE_REFRESH_TOKEN"
    : "SCHEDULER_GOOGLE_REFRESH_TOKEN";

  // Step 2: can we build a Gmail client (i.e. is GOOGLE_CLIENT_ID /
  // GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI also present)?
  let gmail: Awaited<ReturnType<typeof getGmailClient>>;
  try {
    gmail = await getGmailClient();
  } catch (err) {
    return {
      ok: false,
      stage: "gmail_client",
      reason: parseGmailError(err).short,
    };
  }
  if (!gmail) {
    return {
      ok: false,
      stage: "gmail_client",
      reason: "getGmailClient() returned null. Refresh token present but client construction failed.",
    };
  }

  // Step 3: round-trip a `users.getProfile` call — cheapest endpoint
  // that exercises the full auth chain. If the refresh token has been
  // revoked, this is where the failure surfaces ("invalid_grant").
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    const profileEmail = profile.data.emailAddress ?? "(unknown)";
    return { ok: true, profileEmail, refreshTokenSource };
  } catch (err) {
    return {
      ok: false,
      stage: "profile_fetch",
      reason: parseGmailError(err).short,
    };
  }
}

export function encodeMimeMessage(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}): string {
  const { to, subject, html, text, headers } = options;
  const boundary = "PhoebeBoundary";
  // Extra top-level headers (e.g. List-Unsubscribe). Newlines stripped so a
  // header value can't inject additional headers / break the MIME structure.
  const extraHeaders = headers
    ? Object.entries(headers).map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]+/g, " ")}`)
    : [];
  const message = [
    `To: ${to}`,
    `From: ${INVITES_FROM_HEADER}`,
    `Subject: ${subject}`,
    ...extraHeaders,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  return Buffer.from(message).toString("base64url");
}

// ── Markdown → email HTML ────────────────────────────────────────────────────
// A deliberately small renderer for newsletter bodies. Supports headings
// (# ## ###), bold, italic, links, bullet/numbered lists, paragraphs, and
// CTA pill buttons. A line on its own of the form
//   [[Button label]](https://example.com)
// becomes a green call-to-action pill. The input is HTML-escaped first,
// so the only markup that survives is what this function emits — no
// stored XSS even though the body is admin free-text. Every style is
// inlined since email clients drop <style> blocks.

// A line that is solely a CTA pill: [[label]](https://url)
const CTA_PILL_RE = /^\[\[([^\]]+)\]\]\((https?:\/\/[^)\s]+)\)$/;

// Inline formatting applied within a single line/list item. Assumes the
// input has already been HTML-escaped.
function renderInlineMarkdown(text: string): string {
  let s = text;
  // Links: [label](url) — url is constrained to http(s) to avoid
  // javascript: URIs sneaking past the escape.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_m, label, url) => `<a href="${url}" style="color:#4a7c59;text-decoration:underline;">${label}</a>`);
  // Bold first (consumes **…**), then italic on the remaining single *.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  return s;
}

export function renderMarkdownToEmailHtml(md: string): string {
  const lines = escapeHtml(md).replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") { i++; continue; }

    const cta = CTA_PILL_RE.exec(line.trim());
    if (cta) {
      const label = renderInlineMarkdown(cta[1]!);
      const url = cta[2]!;
      blocks.push(
        `<table cellpadding="0" cellspacing="0" style="margin:6px 0 24px;"><tr>` +
        `<td style="border-radius:10px;background:#4a7c59;">` +
        `<a href="${url}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:-0.2px;">${label} &rarr;</a>` +
        `</td></tr></table>`,
      );
      i++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const size = level === 1 ? 20 : level === 2 ? 17 : 15;
      blocks.push(`<h${level} style="margin:24px 0 10px;font-size:${size}px;font-weight:600;color:#2d2a26;line-height:1.3;">${renderInlineMarkdown(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push(`<li style="margin:0 0 6px;">${renderInlineMarkdown((lines[i] ?? "").replace(/^[-*]\s+/, ""))}</li>`);
        i++;
      }
      blocks.push(`<ul style="margin:0 0 18px;padding-left:22px;font-size:15px;color:#3a3632;line-height:1.7;">${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        items.push(`<li style="margin:0 0 6px;">${renderInlineMarkdown((lines[i] ?? "").replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      blocks.push(`<ol style="margin:0 0 18px;padding-left:22px;font-size:15px;color:#3a3632;line-height:1.7;">${items.join("")}</ol>`);
      continue;
    }

    // Paragraph — accumulate consecutive non-blank, non-block lines.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^#{1,3}\s+/.test(lines[i] ?? "") &&
      !/^[-*]\s+/.test(lines[i] ?? "") &&
      !/^\d+\.\s+/.test(lines[i] ?? "") &&
      !CTA_PILL_RE.test((lines[i] ?? "").trim())
    ) {
      paraLines.push(lines[i] ?? "");
      i++;
    }
    blocks.push(`<p style="margin:0 0 18px;font-size:15px;color:#3a3632;line-height:1.7;">${paraLines.map(renderInlineMarkdown).join("<br>")}</p>`);
  }
  return blocks.join("\n");
}

// Newsletter-style email — an admin-composed message rendered from
// markdown into the standard Phoebe email card.
export async function sendNewsletterEmail(opts: {
  to: string;
  subject: string;
  bodyMarkdown: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("Gmail client unavailable — skipping newsletter email");
    return false;
  }

  // Respect the recipient's email opt-out; build their unsubscribe link.
  const gate = await resolveBulkRecipient(opts.to);
  if (gate?.suppressed) { console.log("[email] newsletter skipped (unsubscribed):", opts.to); return false; }
  const unsubUrl = gate ? unsubscribeUrl(gate.userId) : null;

  const bodyHtml = renderMarkdownToEmailHtml(opts.bodyMarkdown);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:40px 36px;">
          <tr>
            <td>
              <div style="margin-bottom:28px;">
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🌱 Phoebe</span>
              </div>
              <h1 style="margin:0 0 24px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">${escapeHtml(opts.subject)}</h1>
              ${bodyHtml}
              ${bulkFooterHtml(unsubUrl)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = [
    opts.subject,
    "",
    opts.bodyMarkdown,
    "",
    "---",
    bulkFooterText(unsubUrl),
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject: opts.subject, html, text, headers: listUnsubHeaders(unsubUrl) });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    const parsed = parseGmailError(err);
    console.error("[email] sendNewsletterEmail FAILED", { to: opts.to, subject: opts.subject, ...parsed });
    return false;
  }
}

// Diagnostic-friendly newsletter send. Same template as
// sendNewsletterEmail above, but instead of swallowing failures to
// boolean it returns the Gmail error reason so the preview route can
// surface "invalid_grant" / "quotaExceeded" / etc. straight into the
// admin's toast without making them dig through Railway logs.
export async function sendNewsletterEmailDiagnostic(opts: {
  to: string;
  subject: string;
  bodyMarkdown: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const gmail = await getGmailClient();
  if (!gmail) {
    return {
      ok: false,
      reason:
        "Gmail client unavailable — INVITES_GOOGLE_REFRESH_TOKEN env var missing or unreadable on the server.",
    };
  }

  // Diagnostic send: resolve the unsubscribe link so the preview shows the
  // real footer, but don't suppress — the admin explicitly asked to see it.
  const gate = await resolveBulkRecipient(opts.to);
  const unsubUrl = gate ? unsubscribeUrl(gate.userId) : null;

  const bodyHtml = renderMarkdownToEmailHtml(opts.bodyMarkdown);
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:40px 36px;">
          <tr>
            <td>
              <div style="margin-bottom:28px;">
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🌱 Phoebe</span>
              </div>
              <h1 style="margin:0 0 24px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">${escapeHtml(opts.subject)}</h1>
              ${bodyHtml}
              ${bulkFooterHtml(unsubUrl)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
  const text = [
    opts.subject,
    "",
    opts.bodyMarkdown,
    "",
    "---",
    bulkFooterText(unsubUrl),
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject: opts.subject, html, text, headers: listUnsubHeaders(unsubUrl) });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return { ok: true };
  } catch (err) {
    const parsed = parseGmailError(err);
    console.error("[email] sendNewsletterEmailDiagnostic FAILED", { to: opts.to, subject: opts.subject, ...parsed });
    // Toast copy = the same one-line summary the parser produces.
    return { ok: false, reason: parsed.short || "Gmail send failed (no further detail)" };
  }
}

export async function sendAnnouncementEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) return false;

  const gate = await resolveBulkRecipient(opts.to);
  if (gate?.suppressed) { console.log("[email] announcement skipped (unsubscribed):", opts.to); return false; }
  const unsubUrl = gate ? unsubscribeUrl(gate.userId) : null;

  const safeBody = opts.body
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:40px 36px;">
          <tr>
            <td>
              <div style="margin-bottom:28px;">
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🌱 Phoebe</span>
              </div>
              <h1 style="margin:0 0 24px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">${escapeHtml(opts.subject)}</h1>
              <p style="margin:0 0 28px;font-size:15px;color:#3a3632;line-height:1.7;">${safeBody}</p>
              ${bulkFooterHtml(unsubUrl)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = [
    opts.subject,
    "",
    opts.body,
    "",
    "---",
    bulkFooterText(unsubUrl),
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject: opts.subject, html, text, headers: listUnsubHeaders(unsubUrl) });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    const parsed = parseGmailError(err);
    console.error("[email] sendAnnouncementEmail FAILED", { to: opts.to, ...parsed });
    return false;
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("Gmail client unavailable — skipping password reset email");
    return false;
  }

  const subject = "Reset your Phoebe password";
  const safeName = (opts.name ?? "").trim() || "there";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:40px 36px;">
          <tr>
            <td>
              <div style="margin-bottom:28px;">
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🌱 Phoebe</span>
              </div>
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">
                Reset your password
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.6;">
                Hi ${safeName}, click below to choose a new password. This link expires in 1 hour.
              </p>
              <a href="${opts.resetUrl}" style="display:inline-block;background:#4a7c59;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
                Reset password →
              </a>
              <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
                If you didn't request a password reset, you can ignore this email — your password won't change.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = [
    `Hi ${safeName},`,
    "",
    "Click this link to choose a new password (expires in 1 hour):",
    opts.resetUrl,
    "",
    "If you didn't request a password reset, you can ignore this email — your password won't change.",
    "",
    "— Phoebe",
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    const parsed = parseGmailError(err);
    console.error("[email] sendPasswordResetEmail FAILED", { to: opts.to, ...parsed });
    return false;
  }
}

// "How can we pray for you?" community prompt — sent alongside the
// push when a group admin invites members to share something the
// community can carry. Single CTA links to the in-app submission
// page. Per-user daily dedup is enforced at the call site (users.
// last_prayer_invite_email_date) so a member in multiple groups only
// gets one of these per day even if every admin fires the same day.
export async function sendPrayerInviteEmail(opts: {
  to: string;
  recipientName: string;
  adminName: string;
  groupName: string;
  shareUrl: string;
  /** The admin-chosen question — a preset or a custom one. Falls back
   *  to "How can we pray for you?" when absent. Used as the subject
   *  line + the email's headline so the email asks the same question
   *  the push and the share-prayer slide do. */
  prompt?: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("Gmail client unavailable — skipping prayer-invite email");
    return false;
  }

  const gate = await resolveBulkRecipient(opts.to);
  if (gate?.suppressed) { console.log("[email] prayer-invite skipped (unsubscribed):", opts.to); return false; }
  const unsubUrl = gate ? unsubscribeUrl(gate.userId) : null;

  const firstName = (opts.recipientName ?? "").trim().split(/\s+/)[0] || "friend";
  const adminFirst = (opts.adminName ?? "").trim().split(/\s+/)[0] || "Someone";
  const prompt = (opts.prompt ?? "").trim() || "How can we pray for you?";
  const subject = prompt;
  // HTML-escaped copies for the body. The prompt is admin free-text
  // and the names / group name are user-controlled — all must be
  // escaped before interpolation or it's stored XSS to every inbox.
  const eFirstName = escapeHtml(firstName);
  const eAdminFirst = escapeHtml(adminFirst);
  const ePrompt = escapeHtml(prompt);
  const eGroupName = escapeHtml(opts.groupName ?? "");
  const eShareUrl = escapeHtml(opts.shareUrl ?? "");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:40px 36px;">
          <tr>
            <td>
              <div style="margin-bottom:28px;">
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🌱 Phoebe</span>
              </div>
              <p style="margin:0 0 6px;font-size:15px;color:#6b6460;line-height:1.6;">
                Hi ${eFirstName},
              </p>
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">
                ${ePrompt}
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#3a3632;line-height:1.7;">
                ${eAdminFirst} from <strong>${eGroupName}</strong> is asking. Share what's on your heart, and your community will hold it in prayer.
              </p>
              <a href="${eShareUrl}" style="display:inline-block;background:#4a7c59;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
                Share with your community →
              </a>
              <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
                Nothing is too small to be held together.
              </p>
              ${unsubUrl ? `<p style="margin:10px 0 0;font-size:12px;color:#9a9390;line-height:1.6;"><a href="${unsubUrl}" style="color:#6b6460;text-decoration:underline;">Unsubscribe</a> from these emails.</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = [
    `Hi ${firstName},`,
    "",
    `${adminFirst} from ${opts.groupName} is asking — is there something in your life this week your community can be with you in prayer about?`,
    "",
    "Share with your community:",
    opts.shareUrl,
    "",
    "— Phoebe",
    ...(unsubUrl ? ["", `Unsubscribe from these emails: ${unsubUrl}`] : []),
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject, html, text, headers: listUnsubHeaders(unsubUrl) });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    const parsed = parseGmailError(err);
    console.error("[email] sendPrayerInviteEmail FAILED", { to: opts.to, ...parsed });
    return false;
  }
}

// Weekly prayer-feed digest — fired Tuesday evening (user TZ) by the
// runWeeklyDigestSender scheduler. Lists the new intercessions on
// each subscriber's feeds since the previous digest, with action-type
// intercessions called out separately. CTA leads to the slideshow at
// /prayer-mode?queue=feed-digest.
export async function sendWeeklyDigestEmail(opts: {
  to: string;
  recipientName: string;
  digest: FeedDigest;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("Gmail client unavailable — skipping weekly digest email");
    return false;
  }

  const gate = await resolveBulkRecipient(opts.to);
  if (gate?.suppressed) { console.log("[email] weekly digest skipped (unsubscribed):", opts.to); return false; }
  const unsubUrl = gate ? unsubscribeUrl(gate.userId) : null;

  const { digest } = opts;
  const n = digest.entries.length;
  const actions = digest.actionEntries;
  if (n === 0) return false; // safety — sender should already skip empty weeks

  const firstName = (opts.recipientName ?? "").trim().split(/\s+/)[0] || "friend";
  const headline = n === 1
    ? "1 new on your feeds this week"
    : `${n} new on your feeds this week`;
  const subject = n === 1
    ? "1 new intercession to pray this week"
    : `${n} new intercessions to pray this week`;

  const appBaseUrl = (process.env.APP_BASE_URL ?? "https://withphoebe.app").replace(/\/$/, "");
  const slideshowUrl = `${appBaseUrl}/prayer-mode?queue=feed-digest`;
  const settingsUrl = `${appBaseUrl}/settings`;

  const eFirstName = escapeHtml(firstName);
  const eSlideshow = escapeHtml(slideshowUrl);
  const eSettings = escapeHtml(settingsUrl);
  const eHeadline = escapeHtml(headline);

  // Action call-out — only renders when at least one of the new items
  // is an action. Each card carries the title, feed badge, and a
  // direct "Take action →" link (the same one the slideshow shows).
  const actionsHtml = actions.length === 0
    ? ""
    : `
              <div style="background:#f5f1e8;border:1px solid #e8d8a8;border-radius:12px;padding:18px 18px 14px;margin-bottom:24px;">
                <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#8a6a1a;text-transform:uppercase;letter-spacing:1px;">
                  📣 Take action this week
                </p>
                ${actions.map((a) => `
                <div style="margin-bottom:14px;">
                  <p style="margin:0 0 2px;font-size:15px;font-weight:600;color:#2d2a26;">${escapeHtml(a.title)}</p>
                  <p style="margin:0 0 6px;font-size:12px;color:#9a8a4a;">on ${escapeHtml(a.feedTitle)}</p>
                  ${a.learnMoreUrl ? `<a href="${escapeHtml(a.learnMoreUrl)}" style="font-size:13px;font-weight:600;color:#4a7c59;text-decoration:none;">Take action →</a>` : ""}
                </div>`).join("")}
              </div>
    `;

  // Up to 5 entries previewed in the body; the slideshow has the rest.
  const PREVIEW_LIMIT = 5;
  const previewed = digest.entries.slice(0, PREVIEW_LIMIT);
  const moreCount = Math.max(0, n - PREVIEW_LIMIT);
  const listHtml = `
              <div style="margin-bottom:24px;">
                ${previewed.map((e) => `
                <div style="border-top:1px solid #f0ece6;padding:12px 0;">
                  <p style="margin:0 0 3px;font-size:11px;color:#9a9390;text-transform:uppercase;letter-spacing:0.6px;">
                    ${e.feedCoverEmoji ? escapeHtml(e.feedCoverEmoji) + " " : ""}${escapeHtml(e.feedTitle)}
                  </p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#2d2a26;">${escapeHtml(e.title)}</p>
                </div>`).join("")}
                ${moreCount > 0 ? `<p style="margin:14px 0 0;font-size:13px;color:#6b6460;font-style:italic;">+${moreCount} more in the slideshow.</p>` : ""}
              </div>
  `;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:40px 36px;">
          <tr>
            <td>
              <div style="margin-bottom:28px;">
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🌱 Phoebe</span>
              </div>
              <p style="margin:0 0 6px;font-size:15px;color:#6b6460;line-height:1.6;">
                Hi ${eFirstName},
              </p>
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">
                ${eHeadline}
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#3a3632;line-height:1.7;">
                Here's what your feeds are carrying. Pray them in one sitting or one at a time — your community is praying alongside you.
              </p>${actionsHtml}${listHtml}
              <a href="${eSlideshow}" style="display:inline-block;background:#4a7c59;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
                Pray them all together →
              </a>
              <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
                You're getting this because you subscribe to prayer feeds on Phoebe.
                <a href="${eSettings}" style="color:#6b6460;text-decoration:underline;">Update your weekly preferences</a>.${unsubUrl ? ` <a href="${unsubUrl}" style="color:#6b6460;text-decoration:underline;">Unsubscribe</a> from all emails.` : ""}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  // Plain-text fallback.
  const lines: string[] = [`Hi ${firstName},`, "", headline + ".", ""];
  if (actions.length > 0) {
    lines.push("Take action this week:");
    for (const a of actions) {
      lines.push(`  • ${a.title} (on ${a.feedTitle})`);
      if (a.learnMoreUrl) lines.push(`    ${a.learnMoreUrl}`);
    }
    lines.push("");
  }
  lines.push("New intercessions:");
  for (const e of previewed) {
    lines.push(`  • ${e.title} (on ${e.feedTitle})`);
  }
  if (moreCount > 0) lines.push(`  …and ${moreCount} more.`);
  lines.push("");
  lines.push("Pray them all together:");
  lines.push(`  ${slideshowUrl}`);
  lines.push("");
  lines.push("— Phoebe");
  lines.push("");
  lines.push(`Update your weekly preferences: ${settingsUrl}`);
  if (unsubUrl) { lines.push(""); lines.push(`Unsubscribe from all emails: ${unsubUrl}`); }
  const text = lines.join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject, html, text, headers: listUnsubHeaders(unsubUrl) });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    const parsed = parseGmailError(err);
    console.error("[email] sendWeeklyDigestEmail FAILED", { to: opts.to, ...parsed });
    return false;
  }
}
