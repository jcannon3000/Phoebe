// Parsing an inbound email into something postable — the pure half of
// routes/inbound-email.ts, split out so it can be tested without a database.
//
// Every function here is a pure string transform. The route does the
// authorisation and the writing; this decides what the message SAYS.

/** The bare address out of "Name <a@b.c>", lowercased. */
export function bareAddress(v: unknown): string {
  const s = String(v ?? "");
  const m = /<([^>]+)>/.exec(s);
  return (m ? m[1]! : s).trim().toLowerCase();
}

/**
 * Read the message out of whatever shape the provider posts.
 *
 * Postmark sends From/Subject/TextBody/HtmlBody/ToFull; SendGrid sends
 * from/subject/text/html/to; Mailgun sends sender/subject/body-plain. Reading
 * all three costs a few lines and means the choice of provider is a config
 * decision rather than a code change.
 */
export function readMessage(body: Record<string, unknown>) {
  const recipients: string[] = [];
  const pushAll = (v: unknown) => {
    if (typeof v === "string") for (const part of v.split(",")) recipients.push(bareAddress(part));
    else if (Array.isArray(v)) for (const r of v) recipients.push(bareAddress((r as { Email?: string })?.Email ?? r));
  };
  pushAll(body["To"]); pushAll(body["to"]); pushAll(body["recipient"]);
  pushAll(body["ToFull"]); pushAll(body["OriginalRecipient"]);

  return {
    from: bareAddress(body["From"] ?? body["from"] ?? body["sender"]),
    recipients: recipients.filter(Boolean),
    subject: String(body["Subject"] ?? body["subject"] ?? "").trim(),
    text: String(body["TextBody"] ?? body["text"] ?? body["body-plain"] ?? "").trim(),
    html: String(body["HtmlBody"] ?? body["html"] ?? body["body-html"] ?? ""),
  };
}

/**
 * A newsletter's "View this email in your browser" link, when it has one.
 *
 * Preferred over the email's own body: these are heavy HTML documents built
 * for an inbox, and the publisher's hosted version is the thing they actually
 * designed. When there isn't one the text body is used instead, so a plain
 * message from a rector still works.
 */
export function viewOnlineUrl(html: string): string | null {
  if (!html) return null;
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const label = m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (/view (this )?(email|message)|view (it )?online|view as webpage|web version|browser/.test(label)) {
      const href = m[1]!;
      if (/^https?:\/\//i.test(href)) return href;
    }
  }
  return null;
}

/** HTML → readable text, for the case where there is no hosted version. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#8217;|&rsquo;/gi, "’").replace(/&#8220;|&ldquo;/gi, "“").replace(/&#8221;|&rdquo;/gi, "”")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

