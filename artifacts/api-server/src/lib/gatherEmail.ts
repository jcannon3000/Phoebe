import { getGmailClient, encodeMimeMessage, escapeHtml } from "./email";

// Transactional email for the Gather flow — sent to GUESTS (who have no
// account, so no push) when a gathering is confirmed or when the organizer
// nudges them. 1:1 transactional (an invite the guest opted into by
// responding/being invited), so no bulk-unsubscribe footer. Reuses the Gmail
// send chain from email.ts. Best-effort: returns false (never throws) when
// Gmail is unavailable.

export async function sendGatherEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  detailLines?: string[]; // e.g. ["🗓 Mon, Jun 8 · 12:30 PM", "📍 The café"]
  ctaLabel: string;
  ctaUrl: string;
}): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("[gatherEmail] Gmail client unavailable — skipping:", opts.to);
    return false;
  }

  const detailsHtml = (opts.detailLines ?? []).length > 0
    ? `<div style="background:#f5f1e8;border:1px solid #e8e2d9;border-radius:12px;padding:14px 16px;margin:0 0 24px;">${opts.detailLines!
        .map((l) => `<p style="margin:0 0 4px;font-size:15px;color:#2d2a26;line-height:1.5;">${escapeHtml(l)}</p>`)
        .join("")}</div>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:40px 36px;">
        <tr><td>
          <div style="margin-bottom:28px;"><span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🌱 Phoebe</span></div>
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">${escapeHtml(opts.heading)}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#3a3632;line-height:1.7;">${escapeHtml(opts.intro)}</p>
          ${detailsHtml}
          <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#4a7c59;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">${escapeHtml(opts.ctaLabel)} &rarr;</a>
          <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">You're receiving this because you were invited to this get-together on Phoebe.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const text = [
    opts.heading,
    "",
    opts.intro,
    "",
    ...(opts.detailLines ?? []),
    "",
    `${opts.ctaLabel}: ${opts.ctaUrl}`,
    "",
    "— Phoebe",
  ].join("\n");

  try {
    const raw = encodeMimeMessage({ to: opts.to, subject: opts.subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("[gatherEmail] send FAILED:", opts.to, err);
    return false;
  }
}
