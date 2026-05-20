import { google } from "googleapis";
import { INVITES_FROM_HEADER, getInvitesRefreshToken } from "./invitesAccount";
import type { FeedDigest } from "./feedDigest";

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

export function encodeMimeMessage(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): string {
  const { to, subject, html, text } = options;
  const boundary = "PhoebeBoundary";
  const message = [
    `To: ${to}`,
    `From: ${INVITES_FROM_HEADER}`,
    `Subject: ${subject}`,
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
              <p style="margin:8px 0 0;font-size:12px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
                You're receiving this because you're a member of Phoebe.
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
    opts.subject,
    "",
    opts.bodyMarkdown,
    "",
    "---",
    "You're receiving this because you're a member of Phoebe.",
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject: opts.subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send newsletter email:", err);
    return false;
  }
}

export async function sendAnnouncementEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) return false;

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
              <h1 style="margin:0 0 24px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">${opts.subject}</h1>
              <p style="margin:0 0 28px;font-size:15px;color:#3a3632;line-height:1.7;">${safeBody}</p>
              <p style="margin:0;font-size:12px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
                You're receiving this because you're a member of Phoebe.
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
    opts.subject,
    "",
    opts.body,
    "",
    "---",
    "You're receiving this because you're a member of Phoebe.",
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject: opts.subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send announcement email:", err);
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
    console.error("Failed to send password reset email:", err);
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
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send prayer-invite email:", err);
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
                <a href="${eSettings}" style="color:#6b6460;text-decoration:underline;">Update your weekly preferences</a>.
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
  const text = lines.join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send weekly digest email:", err);
    return false;
  }
}
