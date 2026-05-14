import { google } from "googleapis";
import { INVITES_FROM_HEADER, getInvitesRefreshToken } from "./invitesAccount";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"],
    process.env["GOOGLE_CLIENT_SECRET"],
    process.env["GOOGLE_REDIRECT_URI"]
  );
}

let cachedAccessToken: string | null = null;
let cachedTokenExpiry: number | null = null;

async function getGmailClient() {
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

function encodeMimeMessage(options: {
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
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("Gmail client unavailable — skipping prayer-invite email");
    return false;
  }

  const firstName = (opts.recipientName ?? "").trim().split(/\s+/)[0] || "friend";
  const adminFirst = (opts.adminName ?? "").trim().split(/\s+/)[0] || "Someone";
  const subject = "How can we pray for you?";

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
                Hi ${firstName} — how can we pray for you?
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#3a3632;line-height:1.7;">
                ${adminFirst} from <strong>${opts.groupName}</strong> is asking: is there something in your life this week your community can be with you in prayer about?
              </p>
              <a href="${opts.shareUrl}" style="display:inline-block;background:#4a7c59;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
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
