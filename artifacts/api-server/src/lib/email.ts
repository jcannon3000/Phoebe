import { google } from "googleapis";
import { INVITES_FROM_HEADER, getInvitesRefreshToken } from "./invitesAccount";

// Send emails via Gmail API authenticated as invites@withphoebe.app (the
// dedicated Google Workspace mailbox). Falls back to the legacy scheduler
// account (eleanorscheduler@gmail.com) if the new refresh token hasn't
// been set yet, so deployments don't break during rollout.

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
    console.warn("No Google refresh token set (INVITES_GOOGLE_REFRESH_TOKEN or SCHEDULER_GOOGLE_REFRESH_TOKEN) — email sending disabled");
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

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) return false;
  try {
    const raw = encodeMimeMessage(options);
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
  }
}

export async function sendMagicLinkEmail(
  to: string,
  magicLink: string,
  isNewUser: boolean
): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("Gmail client unavailable — skipping magic link email");
    return false;
  }

  const subject = isNewUser ? "Welcome to Phoebe — sign in" : "Your Phoebe sign-in link";

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
              <!-- Logo -->
              <div style="margin-bottom:28px;">
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🌱 Phoebe</span>
              </div>

              <!-- Headline -->
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">
                ${isNewUser ? "Welcome — here's your sign-in link" : "Here's your sign-in link"}
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.6;">
                Click below to sign in to Phoebe. This link expires in 1 hour.
              </p>

              <!-- Button -->
              <a href="${magicLink}" style="display:inline-block;background:#4a7c59;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
                Sign in to Phoebe →
              </a>

              <!-- Note -->
              <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
                ${isNewUser
                  ? `Calendar invites from Phoebe will be sent to <strong>${to}</strong>.`
                  : `Signing in as <strong>${to}</strong>.`
                }
                If you didn't request this, you can ignore it.
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
    isNewUser ? "Welcome to Phoebe!" : "Your Phoebe sign-in link",
    "",
    "Click this link to sign in (expires in 1 hour):",
    magicLink,
    "",
    isNewUser
      ? `Calendar invites from Phoebe will be sent to ${to}.`
      : `Signing in as ${to}.`,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to, subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send magic link email:", err);
    return false;
  }
}
