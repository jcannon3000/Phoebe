import { getGmailClient, encodeMimeMessage, escapeHtml } from "./email";

// ── Letter emails ────────────────────────────────────────────────────────────
//
// Phoebe sends two letter emails:
//
//   1. sendInvitationEmail — the FIRST letter to a recipient who has
//      never been on Phoebe. Their email exists only as the recipient
//      of a fresh correspondence. The email is the only thing telling
//      them a friend wrote to them, so it's framed like real mail
//      arriving on a stoop: warm, brief, no marketing voice. The CTA
//      goes to /i/:token, where they can read the letter without
//      signing up.
//
//   2. sendNewLetterEmail — every subsequent letter to a joined
//      recipient (or to a still-pending recipient on later letters,
//      though current call sites only fire it for joined members).
//
// sendReminderEmail is kept as a no-op for now; the matching push
// reminders (day-3 / day-7) already carry that load.
//
// Both functions return Promise<boolean> so fire-and-forget call sites
// can `.catch()` log without crashing. Templates inline all CSS — many
// email clients drop <style> blocks. Anything user-supplied (names,
// correspondence title, custom prompt) is escaped before HTML
// interpolation; an unescaped <img onerror> in someone's display name
// is stored XSS that fans out to every recipient's inbox.

function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "your friend";
}

// ── Invitation email ─────────────────────────────────────────────────────────
// Fired by routes/phoebe.ts when the first letter to a non-Phoebe
// recipient is created. The link goes to /i/:token (LetterInvitePage),
// which shows the letter itself plus a "Write back" CTA.
export async function sendInvitationEmail(opts: {
  to: string;
  creatorName: string;
  correspondenceName: string;
  inviteUrl: string;
  // Widened to plain string so all three live values ("one_to_one",
  // "small_group", and the newer "group" used by /phoebe routes) can
  // pass through without a discriminated-union mismatch. Anything that
  // isn't exactly "one_to_one" is treated as a group correspondence.
  type?: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("Gmail client unavailable — skipping letter invitation email");
    return false;
  }

  const isGroup = opts.type !== undefined && opts.type !== "one_to_one";
  const creator = (opts.creatorName ?? "").trim() || "A friend";
  const creatorFirst = firstName(opts.creatorName);
  const subject = isGroup
    ? `${creatorFirst} added you to a letter group`
    : `${creatorFirst} wrote you a letter`;

  const eCreator = escapeHtml(creator);
  const eCorrespondence = escapeHtml(opts.correspondenceName ?? "");
  const eInviteUrl = escapeHtml(opts.inviteUrl);
  const heroLine = isGroup
    ? `${eCreator} added you to <strong>${eCorrespondence}</strong> on Phoebe — a small letter circle for the people who matter.`
    : `${eCreator} wrote you a letter through Phoebe — and asked us to deliver it.`;
  const subline = isGroup
    ? "Their first letter is waiting for you."
    : "It's waiting for you here.";

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
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">📮 Phoebe</span>
              </div>
              <h1 style="margin:0 0 14px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">
                ${subject}
              </h1>
              <p style="margin:0 0 18px;font-size:15px;color:#3a3632;line-height:1.7;">
                ${heroLine}
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#3a3632;line-height:1.7;">
                ${subline}
              </p>
              <a href="${eInviteUrl}" style="display:inline-block;background:#4a7c59;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
                Read your letter →
              </a>
              <p style="margin:32px 0 6px;font-size:12px;font-weight:600;color:#6b6460;letter-spacing:0.06em;text-transform:uppercase;">
                About Phoebe Letters
              </p>
              <p style="margin:0;font-size:13px;color:#6b6460;line-height:1.65;">
                A slow way of keeping up with the people who matter — about one letter every couple of weeks. No feeds. No notifications begging for attention. Just a real exchange, when there&rsquo;s something worth saying.
              </p>
              <p style="margin:14px 0 0;font-size:13px;color:#6b6460;line-height:1.65;">
                You don&rsquo;t need an account to read this letter. If you&rsquo;d like to write back, we&rsquo;ll set one up just for that.
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
    subject,
    "",
    `${creator} wrote you a letter through Phoebe.`,
    "",
    "Read it here:",
    opts.inviteUrl,
    "",
    "---",
    "About Phoebe Letters:",
    "A slow way of keeping up with the people who matter — about one letter every couple of weeks. No feeds, no notifications. Just a real exchange, when there's something worth saying. You don't need an account to read this letter; if you'd like to write back, we'll set one up just for that.",
    "",
    "— Phoebe",
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send letter invitation email:", err);
    return false;
  }
}

// ── New-letter email ─────────────────────────────────────────────────────────
// Fired for every letter to a joined recipient (and to non-joined
// recipients on letters after the first, when they still have a valid
// invite token in the URL). Brief — the in-app page does the heavy
// lifting. The push notification covers most cases; this email is the
// fallback for users who have push disabled or who live in their inbox.
export async function sendNewLetterEmail(opts: {
  to: string;
  authorName: string;
  correspondenceName: string;
  correspondenceUrl: string;
  // See sendInvitationEmail's `type` for why this is widened.
  type?: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("Gmail client unavailable — skipping new-letter email");
    return false;
  }

  const isGroup = opts.type !== undefined && opts.type !== "one_to_one";
  const authorFirst = firstName(opts.authorName);
  const subject = isGroup
    ? `A new letter in ${opts.correspondenceName}`
    : `${authorFirst} wrote you`;

  const eAuthor = escapeHtml((opts.authorName ?? "").trim() || "Someone");
  const eCorrespondence = escapeHtml(opts.correspondenceName ?? "");
  const eUrl = escapeHtml(opts.correspondenceUrl);
  const heroLine = isGroup
    ? `A new letter just arrived in <strong>${eCorrespondence}</strong>.`
    : `${eAuthor} wrote you another letter.`;

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
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">📮 Phoebe</span>
              </div>
              <h1 style="margin:0 0 14px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">
                ${subject}
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#3a3632;line-height:1.7;">
                ${heroLine}
              </p>
              <a href="${eUrl}" style="display:inline-block;background:#4a7c59;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
                Open your letter →
              </a>
              <p style="margin:28px 0 0;font-size:12px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
                You&rsquo;re receiving this because someone wrote you a letter on Phoebe.
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
    subject,
    "",
    `${opts.authorName} wrote you another letter.`,
    "",
    "Open it:",
    opts.correspondenceUrl,
    "",
    "— Phoebe",
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send new-letter email:", err);
    return false;
  }
}

// ── Reminder email ───────────────────────────────────────────────────────────
// Kept as a stub for now. The day-3 / day-7 push reminders (see
// letterWindowSender + pushSender) already nudge writers whose window
// is open; an email layer on top is desirable later but isn't blocking
// the current flow. Returning false leaves the call sites' .catch()
// happy.
export async function sendReminderEmail(_opts: unknown): Promise<boolean> {
  return false;
}
