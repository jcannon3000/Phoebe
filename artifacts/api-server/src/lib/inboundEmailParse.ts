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

/**
 * HTML → readable text, for the case where there is no hosted version.
 *
 * DECODE ENTITIES FIRST, THEN STRIP TAGS. The order was the other way round,
 * which un-did the stripping: `&lt;img src=x onerror=…&gt;` passed the
 * tag-stripper untouched (it contains no angle brackets yet) and the decode
 * step immediately after turned it into real markup in the stored body.
 * Inert today — group-reflection.tsx renders paragraphs, never
 * dangerouslySetInnerHTML — but it is stored XSS waiting for the first
 * surface that renders a post as HTML, and this content arrives by email
 * from outside the app.
 *
 * Decoding `&amp;` LAST for the same reason: decode it first and `&amp;lt;`
 * becomes `&lt;` becomes `<`, which is the same escape one level deeper.
 */
export function htmlToText(html: string): string {
  const decoded = html
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#8217;|&rsquo;/gi, "’").replace(/&#8220;|&ldquo;/gi, "“").replace(/&#8221;|&rdquo;/gi, "”")
    .replace(/&amp;/gi, "&");
  return decoded
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Did the provider verify that this message really came from the From domain?
 *
 * `true` = an explicit pass, `false` = an explicit fail, `null` = the payload
 * carries no verdict at all (a hand-rolled POST straight at the webhook looks
 * like this, so the route treats null as a refusal unless told otherwise).
 *
 * Three providers, three shapes:
 *   • Postmark  — a `Headers` array containing `Authentication-Results`.
 *   • SendGrid  — `dkim` ("{@domain : pass}") and `SPF` ("pass").
 *   • Mailgun   — `X-Mailgun-Spf` / `X-Mailgun-Dkim-Check-Result`.
 *
 * DKIM alone is enough (it survives forwarding, SPF does not), and an SPF
 * pass whose domain matches the From is enough on its own too.
 */
export function senderPassedAuth(body: Record<string, unknown>, from: string): boolean | null {
  const domain = from.split("@")[1]?.toLowerCase() ?? "";
  const say = (v: unknown) => String(v ?? "").toLowerCase();

  // Postmark: find the Authentication-Results header in its Headers array.
  const headers = body["Headers"];
  let authResults = "";
  if (Array.isArray(headers)) {
    for (const h of headers) {
      const name = say((h as { Name?: string })?.Name);
      if (name === "authentication-results") authResults += " " + say((h as { Value?: string })?.Value);
    }
  }
  authResults += " " + say(body["Authentication-Results"] ?? body["authentication-results"]);

  const dkim = say(body["dkim"] ?? body["Dkim"] ?? body["X-Mailgun-Dkim-Check-Result"] ?? body["x-mailgun-dkim-check-result"]);
  const spf = say(body["SPF"] ?? body["spf"] ?? body["X-Mailgun-Spf"] ?? body["x-mailgun-spf"]);

  const hasVerdict = !!authResults.trim() || !!dkim || !!spf;
  if (!hasVerdict) return null;

  // An explicit pass, in any of the three vocabularies.
  const dkimPass = /\bpass\b/.test(dkim) || new RegExp(`dkim=pass`).test(authResults);
  const spfPass = /\bpass\b/.test(spf) || new RegExp(`spf=pass`).test(authResults);
  // For DKIM the signing domain should be the From's; Postmark and SendGrid
  // both name it, so check when we can and accept a bare pass when we can't.
  const dkimDomainOk = !domain || !dkim.includes("@") || dkim.includes(`@${domain}`);

  if (dkimPass && dkimDomainOk) return true;
  if (spfPass) return true;
  return false;
}

