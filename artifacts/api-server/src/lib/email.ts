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

// ─── Calendar invite email (ICS attachment) ─────────────────────────────────
// Fallback path for the daily bell when the Google Calendar API is
// unreachable: we ship a real text/calendar;method=REQUEST MIME part
// that Apple Mail, Gmail, Outlook, etc. recognise as a proper
// calendar invitation. No Google Workspace Calendar API dependency —
// just the same Gmail-send pipe the rest of the product already
// uses. On the receiving end the user taps "Add to calendar" and
// the recurring daily event lands on their device calendar.
//
// `uid` must be stable for the same conceptual event (e.g. the
// user's daily bell) so a re-send is treated as an UPDATE rather
// than a new event. We pass the user ID through as the UID seed.
function buildDailyBellIcs(opts: {
  uid: string;
  summary: string;
  description: string;
  timeZone: string;
  startLocalStr: string; // "YYYY-MM-DDTHH:MM:SS"
  endLocalStr: string;
  attendeeEmail: string;
  organizerEmail: string;
  organizerName: string;
}): string {
  const toIcsLocal = (s: string) => s.replace(/[-:]/g, "").slice(0, 15);
  const dtstart = toIcsLocal(opts.startLocalStr);
  const dtend = toIcsLocal(opts.endLocalStr);
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const escape = (v: string) =>
    v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Phoebe//Daily Bell//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${opts.timeZone}:${dtstart}`,
    `DTEND;TZID=${opts.timeZone}:${dtend}`,
    "RRULE:FREQ=DAILY",
    `SUMMARY:${escape(opts.summary)}`,
    `DESCRIPTION:${escape(opts.description)}`,
    `ORGANIZER;CN=${escape(opts.organizerName)}:mailto:${opts.organizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${opts.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Daily Bell",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function encodeCalendarInviteMessage(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  ics: string;
}): string {
  const { to, subject, html, text, ics } = options;
  const altBoundary = "PhoebeAlt";
  const mixedBoundary = "PhoebeMixed";
  // A tri-part body: text/plain + text/html inside multipart/alternative,
  // then the ics attached as both an inline text/calendar part (so
  // Apple Mail + Gmail render it as an "Add to Calendar" strip) AND
  // as an .ics attachment for clients that require the file.
  const message = [
    `To: ${to}`,
    `From: ${INVITES_FROM_HEADER}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    text,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    html,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/calendar; charset="UTF-8"; method=REQUEST`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    ics,
    ``,
    `--${altBoundary}--`,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: application/ics; name="phoebe-daily-bell.ics"`,
    `Content-Disposition: attachment; filename="phoebe-daily-bell.ics"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(ics).toString("base64"),
    ``,
    `--${mixedBoundary}--`,
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

export async function sendDailyBellIcsInvite(opts: {
  to: string;
  userId: number;
  timeZone: string;
  startLocalStr: string;
  endLocalStr: string;
  summary: string;
  description: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) return false;
  try {
    const ics = buildDailyBellIcs({
      uid: `phoebe-bell-${opts.userId}@withphoebe.app`,
      summary: opts.summary,
      description: opts.description,
      timeZone: opts.timeZone,
      startLocalStr: opts.startLocalStr,
      endLocalStr: opts.endLocalStr,
      attendeeEmail: opts.to,
      organizerEmail: "invites@withphoebe.app",
      organizerName: "Phoebe",
    });
    const subject = "🔔 Your Daily Bell — Phoebe";
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
        <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#888;margin:0 0 8px">Phoebe</p>
        <h1 style="font-size:20px;margin:0 0 12px">Your daily bell is hung.</h1>
        <p style="margin:12px 0;color:#444">Accept this invite so your calendar can remind you each day to pause and pray with your community.</p>
        <p style="margin:20px 0 0;color:#666;font-size:13px">If the invite doesn't open automatically, open the attached <strong>phoebe-daily-bell.ics</strong> to add it to your calendar.</p>
      </div>
    `;
    const text = [
      "Your daily bell is hung.",
      "",
      "Accept this invite so your calendar can remind you each day to pause and pray with your community.",
      "",
      "If the invite doesn't open automatically, open the attached phoebe-daily-bell.ics.",
    ].join("\n");
    const raw = encodeCalendarInviteMessage({ to: opts.to, subject, html, text, ics });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send bell ICS invite:", err);
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
