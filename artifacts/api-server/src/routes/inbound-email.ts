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
//   3. set INBOUND_EMAIL_SECRET, and include it as ?secret= on the webhook URL.
// Until then this route is inert rather than broken: it answers 503 and says
// so, which is a truer thing for it to do than to 404.

import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, groupsTable, groupMembersTable, groupReflectionsTable } from "@workspace/db";
import { readMessage, viewOnlineUrl, htmlToText } from "../lib/inboundEmailParse";

const router: IRouter = Router();

const SECRET = process.env["INBOUND_EMAIL_SECRET"] ?? "";
/** The domain the addresses live on. Only used to parse, never to send. */
const INBOUND_DOMAIN = (process.env["INBOUND_EMAIL_DOMAIN"] ?? "in.withphoebe.app").toLowerCase();

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
  if (!secretOk(req.query["secret"] ?? req.headers["x-inbound-secret"])) {
    res.status(401).json({ error: "bad_secret" });
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

  const title = (msg.subject || "A note from your group").slice(0, 140);
  const hosted = viewOnlineUrl(msg.html);
  const text = msg.text || htmlToText(msg.html);
  if (!hosted && !text) { res.json({ ok: false, reason: "empty_message" }); return; }

  const now = new Date();
  await db.insert(groupReflectionsTable).values({
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
