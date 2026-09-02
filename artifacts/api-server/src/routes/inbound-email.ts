// Inbound email → a group post.
//
// Owner, on a parish that sends its newsletter through Constant Contact and
// never posts it online: "is there any way we can bring that into Phoebe?"
//
// This is that way, and it is deliberately NOT a Constant Contact integration.
// Every list vendor has an API; a parish that moves from Constant Contact to
// Flocknote would break an integration built against one of them, and a rector
// sending from plain Gmail would never have worked at all. An email ADDRESS on
// their existing list works for all of it, and asks the parish for nothing
// beyond adding one subscriber.
//
// ── What has to exist outside this file ──────────────────────────────────────
// This endpoint is the easy half. For mail to actually arrive somebody has to:
//   1. point MX records for a subdomain (in.withphoebe.app) at an inbound
//      provider — Postmark, SendGrid and Mailgun all do inbound parsing;
//   2. point that provider's inbound webhook at POST /api/inbound/email;
//   3. set INBOUND_EMAIL_SECRET and send it as the `x-inbound-secret` HEADER.
//      A `?secret=` query parameter is still accepted for a provider that
//      cannot set headers, but prefer the header: query strings are written
//      to Railway's HTTP logs, to pino-http's logged URL and to any proxy
//      access log along the way, so a long-lived shared secret in one is
//      copied into log storage on every single delivery.
//   4. configure the provider to POST JSON (Postmark) or form-urlencoded
//      (Mailgun). SendGrid's Inbound Parse defaults to multipart/form-data,
//      which nothing in this app parses — see the content-type check below.
// Until then this route is inert rather than broken: it answers 503 and says
// so, which is a truer thing for it to do than to 404.

import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, groupsTable, groupMembersTable, groupPostsTable, vcsDailyTable } from "@workspace/db";
import { readMessage, viewOnlineUrl, htmlToText, senderPassedAuth } from "../lib/inboundEmailParse";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SECRET = process.env["INBOUND_EMAIL_SECRET"] ?? "";
/** The domain the addresses live on. Only used to parse, never to send. */
const INBOUND_DOMAIN = (process.env["INBOUND_EMAIL_DOMAIN"] ?? "in.withphoebe.app").toLowerCase();

/**
 * THE VCS ADDRESS — one fixed mailbox, not a per-group one.
 *
 * The Visual Commentary on Scripture's "Bible and Art Daily" is an app-wide
 * reflection source available to every user, not a parish's newsletter, so it
 * does not carry a group token. It is matched on the local part alone.
 *
 * Because it has no token, the SENDER CHECK below is the only thing standing
 * between this mailbox and anyone who learns the address — and what they would
 * be injecting is a URL that Phoebe then sends readers to. So it is gated on
 * the sending DOMAIN plus the provider's own SPF/DKIM verdict, never on the
 * From: header alone.
 */
const VCS_LOCAL = (process.env["VCS_INBOUND_LOCAL"] ?? "vcs").toLowerCase();
const VCS_SENDER_DOMAIN = (process.env["VCS_SENDER_DOMAIN"] ?? "thevcs.org").toLowerCase();

/**
 * The commentary link inside a VCS newsletter.
 *
 * Takes the first thevcs.org link that is not obviously furniture. The
 * exclusions matter: a newsletter's first link is nearly always "view online"
 * or a logo pointing at the homepage, and unsubscribe/preferences links sit in
 * every one of them. Sending a reader to an unsubscribe URL would be worse
 * than sending them nowhere.
 */
export function vcsCommentaryLink(html: string, text: string): string | null {
  const hay = `${html}\n${text}`;
  const urls = hay.match(/https?:\/\/[^\s"'<>)]+/gi) ?? [];
  const skip = /(unsubscribe|preferences|optout|opt-out|view.?online|viewonline|email.?preferences|privacy|donate|twitter|facebook|instagram|mailchi\.mp\/[^/]*\/?$)/i;
  for (const raw of urls) {
    const u = raw.replace(/[.,;:)\]]+$/, "");
    if (!/^https?:\/\/(www\.)?thevcs\.org\//i.test(u)) continue;
    if (skip.test(u)) continue;
    // The bare index is where we already fall back to; it is not an appointment.
    if (/^https?:\/\/(www\.)?thevcs\.org\/?$/i.test(u)) continue;
    if (/^https?:\/\/(www\.)?thevcs\.org\/bible-and-art-daily\/?$/i.test(u)) continue;
    return u;
  }
  return null;
}

/** `<slug>-<token>@<domain>` — the address a parish adds to its list. */
export function inboundAddressFor(slug: string, token: string | null): string | null {
  return token ? `${slug}-${token}@${INBOUND_DOMAIN}` : null;
}

function secretOk(given: unknown): boolean {
  if (!SECRET) return false;
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

/**
 * POST /api/inbound/email?secret=… — one message from the inbound provider.
 *
 * Always answers 200 once the secret checks out, even when the message is
 * dropped. A provider that gets an error retries, and retrying a message we
 * have deliberately refused just fills their queue; the body says what
 * happened for anyone reading the webhook log.
 */
router.post("/inbound/email", async (req: Request, res: Response): Promise<void> => {
  if (!SECRET) {
    res.status(503).json({ error: "inbound_not_configured", detail: "INBOUND_EMAIL_SECRET is unset" });
    return;
  }
  // Header FIRST — see the note at the top on why a query-string secret ends
  // up in log storage. The query form stays as a fallback, not a default.
  if (!secretOk(req.headers["x-inbound-secret"] ?? req.query["secret"])) {
    res.status(401).json({ error: "bad_secret" });
    return;
  }

  /**
   * A BODY WE CAN ACTUALLY READ.
   *
   * app.ts mounts express.json and express.urlencoded and nothing else, so a
   * multipart/form-data POST — which is what SendGrid's Inbound Parse sends by
   * default — arrives as `{}`. That fell through to "no_sender_or_recipient"
   * with a 200, which tells the provider the delivery SUCCEEDED: no retry, no
   * error, no trace, and a parish's newsletter silently going nowhere for as
   * long as it takes someone to notice. Answering 415 makes the provider
   * retry and log, and names the actual problem.
   */
  const ctype = String(req.headers["content-type"] ?? "");
  if (/multipart\/form-data/i.test(ctype)) {
    logger.warn({ ctype }, "inbound email rejected: multipart body, no parser mounted");
    res.status(415).json({
      error: "unsupported_content_type",
      detail: "Send JSON or form-urlencoded. SendGrid: turn OFF 'POST the raw, full MIME message' and use the JSON payload, or switch to Postmark.",
    });
    return;
  }

  const msg = readMessage((req.body ?? {}) as Record<string, unknown>);
  if (!msg.from || msg.recipients.length === 0) {
    res.json({ ok: false, reason: "no_sender_or_recipient" });
    return;
  }

  // Which group was this addressed to? The token is the secret half, so a
  // guessed slug alone reaches nothing.
  const local = msg.recipients
    .filter((r) => r.endsWith(`@${INBOUND_DOMAIN}`))
    .map((r) => r.slice(0, r.lastIndexOf("@")));
  /**
   * THE VCS DAILY, before the group lookup — it is not a group at all.
   *
   * See routes/vcs.ts: thevcs.org 403s server-side requests, so this mailbox
   * is the only way Phoebe can learn the day's appointed commentary.
   */
  if (local.includes(VCS_LOCAL)) {
    // Domain first, then the provider's cryptographic verdict. `From:` is not
    // authenticated by SMTP, so the domain check alone would let anyone who
    // knows the address point every reader at a URL of their choosing.
    const fromDomain = msg.from.slice(msg.from.lastIndexOf("@") + 1).toLowerCase();
    if (fromDomain !== VCS_SENDER_DOMAIN && !fromDomain.endsWith(`.${VCS_SENDER_DOMAIN}`)) {
      logger.warn({ from: msg.from }, "vcs inbound rejected: wrong sender domain");
      res.json({ ok: false, reason: "vcs_sender_domain" }); return;
    }
    const verdict = senderPassedAuth(req.body as Record<string, unknown>, msg.from);
    const allowUnverified = process.env["INBOUND_ALLOW_UNVERIFIED"] === "1";
    if (verdict !== true && !allowUnverified) {
      logger.warn({ from: msg.from, verdict }, "vcs inbound rejected: unverified sender");
      res.json({ ok: false, reason: "vcs_sender_unverified" }); return;
    }
    const link = vcsCommentaryLink(msg.html, msg.text);
    if (!link) {
      // Do NOT invent one. A wrong link is worse than yesterday's commentary
      // staying up, because the reader has no way to tell it is wrong.
      logger.warn({ subject: msg.subject }, "vcs inbound: no commentary link found");
      res.json({ ok: false, reason: "vcs_no_link" }); return;
    }
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Upsert: providers retry, and a corrected re-send should win rather than
    // collide on the unique index and 500 back at them.
    await db.insert(vcsDailyTable)
      .values({ ymd, url: link, title: msg.subject || null, sourceSubject: msg.subject || null })
      .onConflictDoUpdate({
        target: vcsDailyTable.ymd,
        set: { url: link, title: msg.subject || null, sourceSubject: msg.subject || null },
      });
    logger.info({ ymd, link }, "vcs daily commentary stored");
    res.json({ ok: true, kind: "vcs", ymd, url: link });
    return;
  }

  const token = local.map((l) => l.slice(l.lastIndexOf("-") + 1)).find((t) => t.length >= 8);
  if (!token) { res.json({ ok: false, reason: "no_group_token" }); return; }

  const [group] = await db.select({ id: groupsTable.id, name: groupsTable.name })
    .from(groupsTable)
    .where(eq(groupsTable.inboundToken, token))
    .limit(1);
  if (!group) { res.json({ ok: false, reason: "unknown_group" }); return; }

  /**
   * THE SENDER MUST BE AN ADMIN OF THAT GROUP.
   *
   * An inbound address is a public write endpoint: anyone who learns it could
   * otherwise post to a congregation. The token stops a guess; this stops a
   * leak. Matched on the membership email, which is what the parish already
   * sends from.
   */
  const admins = await db.select({ email: groupMembersTable.email, role: groupMembersTable.role, name: groupMembersTable.name })
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), isNotNull(groupMembersTable.joinedAt)));
  const sender = admins.find((m) =>
    m.email.toLowerCase() === msg.from && (m.role === "admin" || m.role === "hidden_admin"));
  if (!sender) { res.json({ ok: false, reason: "sender_not_an_admin" }); return; }

  /**
   * …AND THE FROM: HEADER MUST HAVE BEEN VERIFIED BY THE PROVIDER.
   *
   * The check above compares a header the sender chose. `From:` is not
   * authenticated by SMTP — anyone can write the rector's address in it — so
   * on its own it establishes only that someone CLAIMS to be an admin. That
   * left a congregation-wide phishing primitive: one email with a forged
   * From, and a link post goes to every member's inbox with the rector's name
   * on the card, opened in a browser by a tap.
   *
   * So we require the provider's own SPF/DKIM/DMARC verdict to say the domain
   * really sent it. Postmark, SendGrid and Mailgun all supply this; the shape
   * differs, `senderPassedAuth` normalises it.
   *
   * STRICT BY DEFAULT: a payload carrying no verdict at all is refused rather
   * than trusted, because "no verdict" is what an attacker posting straight to
   * the webhook produces. A provider that genuinely can't supply one needs
   * INBOUND_ALLOW_UNVERIFIED=1 set deliberately, with the risk understood.
   */
  const authed = senderPassedAuth(req.body as Record<string, unknown>, msg.from);
  if (authed === false || (authed === null && process.env["INBOUND_ALLOW_UNVERIFIED"] !== "1")) {
    logger.warn({ groupId: group.id, from: msg.from, authed }, "inbound email refused: sender not cryptographically verified");
    res.json({ ok: false, reason: "sender_not_verified" }); return;
  }

  const title = (msg.subject || "A note from your group").slice(0, 140);
  const hosted = viewOnlineUrl(msg.html);
  const text = msg.text || htmlToText(msg.html);
  if (!hosted && !text) { res.json({ ok: false, reason: "empty_message" }); return; }

  const now = new Date();
  await db.insert(groupPostsTable).values({
    groupId: group.id,
    authorUserId: null,
    authorName: sender.name ?? null,
    title,
    // A hosted version is a LINK POST — the publisher's own page, opened in
    // the in-app browser. Otherwise the message itself is the post.
    body: hosted ? "" : text.slice(0, 20000),
    url: hosted,
    // A week either way: this is a newsletter, and a newsletter is stale in a
    // way a written reflection isn't.
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    publishedAt: now,
  });

  res.json({ ok: true, group: group.name, kind: hosted ? "link" : "text" });
});

export default router;
