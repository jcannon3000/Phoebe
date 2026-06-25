import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  gatherTable,
  gatherOptionTable,
  gatherResponseTable,
  gatherResponseOptionTable,
  gatherInviteeTable,
  usersTable,
  practiceCompletionTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { sendPushToUser, sendPushToUsers } from "../lib/pushSender";
import { rateLimit, perUserRateLimit, getClientIp } from "../lib/rate-limit";
import { sendGatherEmail } from "../lib/gatherEmail";

// ── Gather — propose a get-together, collect availability, converge, confirm ──
//
//   POST   /api/gather                      — create (auth)
//   GET    /api/gather/mine                 — the caller's gatherings (auth)
//   GET    /api/gather/mine/events          — upcoming confirmed → event cards (auth)
//   GET    /api/gather/by-token/:token      — respond-page data (PUBLIC, token-gated)
//   POST   /api/gather/:token/respond       — submit/edit a response (PUBLIC, rate-limited)
//   GET    /api/gather/:id/manage           — organizer dashboard (auth, organizer-only)
//   POST   /api/gather/:id/confirm          — confirm a time (auth, organizer)
//   POST   /api/gather/:id/nudge            — remind non-responders (auth, organizer)
//   PATCH  /api/gather/:id                  — edit / cancel (auth, organizer)
//
// The share token grants RESPONSE access only — never edit/confirm/contact info.
// Guests stay guests (no account is ever created). Respondents see counts, never
// others' emails; only the organizer sees names + contact.

const router: IRouter = Router();

const APP_BASE_URL = (process.env["APP_BASE_URL"] ?? "https://withphoebe.app").replace(/\/$/, "");
const AVAIL = new Set(["yes", "maybe", "no"]);

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}
function genToken(bytes = 18): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "Someone";
}
function fmtWhen(dt: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "America/New_York",
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(dt);
  } catch { return dt.toISOString(); }
}
function ymdInTz(tz: string, d = new Date()): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/New_York" }).format(d); }
  catch { return new Intl.DateTimeFormat("en-CA").format(d); }
}
function sundayOf(ymd: string): string {
  const [y, m, dd] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}

// Credit the weekly Worship & gather completion (which also feeds Turn) for the
// given members — each in their own timezone's week.
async function creditWorship(userIds: number[]): Promise<void> {
  const ids = [...new Set(userIds.filter((n) => Number.isFinite(n)))];
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: usersTable.id, timezone: usersTable.timezone })
    .from(usersTable)
    .where(inArray(usersTable.id, ids));
  for (const u of rows) {
    const localDate = ymdInTz(u.timezone || "America/New_York");
    await db.insert(practiceCompletionTable)
      .values({ userId: u.id, section: "worship", localDate, weekStart: sundayOf(localDate) })
      .onConflictDoNothing();
  }
}

// ── Create ────────────────────────────────────────────────────────────────
router.post("/gather", perUserRateLimit("gather_create", { max: 10, windowMs: 60 * 60 * 1000, message: "Too many invites created. Please try again later." }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const body = (req.body ?? {}) as {
    title?: unknown; note?: unknown; place?: unknown;
    options?: Array<{ datetime?: unknown; label?: unknown }>;
    inviteeUserIds?: unknown; inviteeEmails?: unknown;
  };
  const title = str(body.title, 120);
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const rawOptions = Array.isArray(body.options) ? body.options : [];
  const options = rawOptions
    .map((o) => ({ datetime: typeof o?.datetime === "string" ? new Date(o.datetime) : null, label: str(o?.label, 60) }))
    .filter((o): o is { datetime: Date; label: string | null } => o.datetime !== null && !isNaN(o.datetime.getTime()));
  if (options.length < 2) { res.status(400).json({ error: "at least 2 valid time options required" }); return; }

  const [gather] = await db.insert(gatherTable).values({
    organizerUserId: userId,
    title,
    note: str(body.note, 500),
    place: str(body.place, 160),
    status: "open",
    shareToken: genToken(),
  }).returning();

  await db.insert(gatherOptionTable).values(
    options.slice(0, 12).map((o) => ({ gatherId: gather!.id, datetime: o.datetime, label: o.label })),
  );

  // Optional invite list — members (push them the link) + guest emails.
  const inviteeUserIds = Array.isArray(body.inviteeUserIds)
    ? body.inviteeUserIds.filter((n): n is number => typeof n === "number" && n !== userId)
    : [];
  const inviteeEmails = (Array.isArray(body.inviteeEmails)
    ? body.inviteeEmails.map((e) => str(e, 160)).filter((e): e is string => !!e)
    : []
  ).slice(0, 20); // cap the recipient list — one request must not email thousands
  const inviteeRows = [
    ...inviteeUserIds.map((u) => ({ gatherId: gather!.id, userId: u, email: null })),
    ...inviteeEmails.map((e) => ({ gatherId: gather!.id, userId: null, email: e })),
  ];
  if (inviteeRows.length > 0) await db.insert(gatherInviteeTable).values(inviteeRows);

  const [me] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  const organizer = firstName(me?.name);
  const link = `${APP_BASE_URL}/gather/${gather!.shareToken}`;
  if (inviteeUserIds.length > 0) {
    void sendPushToUsers(inviteeUserIds, {
      title: `${organizer} wants to get together`,
      body: `Help pick a time for "${title}"`,
      path: `/gather/${gather!.shareToken}`,
      threadId: "gather", collapseId: `gather-invite-${gather!.id}`,
    });
  }
  for (const email of inviteeEmails) {
    void sendGatherEmail({
      to: email,
      subject: `${organizer} invited you: ${title}`,
      heading: `When can you make it?`,
      intro: `${organizer} is planning "${title}" and would love your availability.`,
      // Carry the invitee's email in their link so the respond page pre-fills
      // it and their response is matched back to this invite — otherwise a
      // guest who responds without re-typing their email is counted a
      // non-responder and re-nudged.
      ctaLabel: "Mark your availability", ctaUrl: `${link}?e=${encodeURIComponent(email)}`,
    });
  }

  res.json({ id: gather!.id, shareToken: gather!.shareToken });
});

// ── The caller's own gatherings (re-entry) ──────────────────────────────────
router.get("/gather/mine", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const rows = await db
    .select({ id: gatherTable.id, title: gatherTable.title, status: gatherTable.status, shareToken: gatherTable.shareToken, createdAt: gatherTable.createdAt })
    .from(gatherTable)
    .where(eq(gatherTable.organizerUserId, userId));
  res.json({ gatherings: rows });
});

// ── Confirmed upcoming → event cards on the home/weekly page ─────────────────
router.get("/gather/mine/events", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  // Gatherings the caller organized OR responded to, confirmed, with the
  // confirmed option still upcoming.
  const organized = await db.select({ id: gatherTable.id }).from(gatherTable)
    .where(and(eq(gatherTable.organizerUserId, userId), eq(gatherTable.status, "confirmed")));
  const responded = await db.select({ gatherId: gatherResponseTable.gatherId }).from(gatherResponseTable)
    .where(eq(gatherResponseTable.respondentUserId, userId));
  const ids = [...new Set([...organized.map((g) => g.id), ...responded.map((r) => r.gatherId)])];
  if (ids.length === 0) { res.json({ events: [] }); return; }
  const gathers = await db.select().from(gatherTable)
    .where(and(inArray(gatherTable.id, ids), eq(gatherTable.status, "confirmed")));
  const optIds = gathers.map((g) => g.confirmedOptionId).filter((n): n is number => typeof n === "number");
  const opts = optIds.length > 0
    ? await db.select().from(gatherOptionTable).where(inArray(gatherOptionTable.id, optIds))
    : [];
  const optById = new Map(opts.map((o) => [o.id, o]));
  const now = Date.now();
  const events = gathers
    .map((g) => {
      const opt = g.confirmedOptionId ? optById.get(g.confirmedOptionId) : undefined;
      if (!opt) return null;
      return { id: g.id, name: g.title, place: g.place, nextMeetupDate: opt.datetime, shareToken: g.shareToken, organizer: g.organizerUserId === userId };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null && new Date(e.nextMeetupDate).getTime() > now - 12 * 3600_000);
  res.json({ events });
});

// ── Respond-page data (PUBLIC, token-gated) ─────────────────────────────────
router.get("/gather/by-token/:token", async (req: Request, res: Response): Promise<void> => {
  const token = String(req.params.token ?? "");
  const [gather] = await db.select().from(gatherTable).where(eq(gatherTable.shareToken, token));
  if (!gather) { res.status(404).json({ error: "not_found" }); return; }

  const options = await db.select().from(gatherOptionTable).where(eq(gatherOptionTable.gatherId, gather.id));
  const responses = await db.select().from(gatherResponseTable).where(eq(gatherResponseTable.gatherId, gather.id));
  const respIds = responses.map((r) => r.id);
  const ros = respIds.length > 0
    ? await db.select().from(gatherResponseOptionTable).where(inArray(gatherResponseOptionTable.responseId, respIds))
    : [];

  // Per-option "yes" counts only — never names/emails on the public page.
  const yesByOption = new Map<number, number>();
  for (const ro of ros) if (ro.availability === "yes") yesByOption.set(ro.optionId, (yesByOption.get(ro.optionId) ?? 0) + 1);

  // The viewer's own response — member via req.user, guest via ?rt=token.
  const userId = uid(req);
  const rt = typeof req.query.rt === "string" ? req.query.rt : null;
  const mine = responses.find((r) =>
    (userId !== null && r.respondentUserId === userId) || (rt !== null && r.responseToken === rt));
  const myAvail: Record<number, string> = {};
  if (mine) for (const ro of ros) if (ro.responseId === mine.id) myAvail[ro.optionId] = ro.availability;

  const [organizer] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, gather.organizerUserId));
  const confirmedOption = gather.confirmedOptionId ? options.find((o) => o.id === gather.confirmedOptionId) : null;

  res.json({
    gather: { id: gather.id, title: gather.title, note: gather.note, place: gather.place, status: gather.status },
    organizerName: firstName(organizer?.name),
    options: options.map((o) => ({ id: o.id, datetime: o.datetime, label: o.label, yesCount: yesByOption.get(o.id) ?? 0 })),
    responseCount: responses.length,
    confirmedOption: confirmedOption ? { id: confirmedOption.id, datetime: confirmedOption.datetime, label: confirmedOption.label } : null,
    myResponse: mine
      ? { responseToken: mine.responseToken, guestName: mine.guestName, suggestedTime: mine.suggestedTime, availability: myAvail, isMember: mine.respondentUserId !== null }
      : null,
  });
});

// ── Submit / edit a response (PUBLIC, rate-limited, token-gated) ────────────
router.post(
  "/gather/:token/respond",
  rateLimit({ name: "gather_respond", max: 40, windowMs: 60 * 60 * 1000, keyFn: (req) => getClientIp(req), message: "Too many responses. Please slow down a moment." }),
  async (req: Request, res: Response): Promise<void> => {
    const token = String(req.params.token ?? "");
    const [gather] = await db.select().from(gatherTable).where(eq(gatherTable.shareToken, token));
    if (!gather) { res.status(404).json({ error: "not_found" }); return; }
    if (gather.status !== "open") { res.status(400).json({ error: "closed" }); return; }

    const body = (req.body ?? {}) as {
      availability?: Record<string, unknown>; suggestedTime?: unknown;
      guestName?: unknown; guestEmail?: unknown; responseToken?: unknown;
    };
    const options = await db.select({ id: gatherOptionTable.id }).from(gatherOptionTable).where(eq(gatherOptionTable.gatherId, gather.id));
    const validOptionIds = new Set(options.map((o) => o.id));
    const avail: Array<{ optionId: number; availability: string }> = [];
    for (const [k, v] of Object.entries(body.availability ?? {})) {
      const optionId = parseInt(k, 10);
      if (validOptionIds.has(optionId) && typeof v === "string" && AVAIL.has(v)) avail.push({ optionId, availability: v });
    }
    const suggestedTime = str(body.suggestedTime, 200);
    if (avail.length === 0 && !suggestedTime) { res.status(400).json({ error: "no availability provided" }); return; }

    const userId = uid(req);
    const rt = str(body.responseToken, 64);

    // Locate an existing response: a member's row, or the row that owns rt.
    let existing = userId !== null
      ? (await db.select().from(gatherResponseTable).where(and(eq(gatherResponseTable.gatherId, gather.id), eq(gatherResponseTable.respondentUserId, userId))))[0]
      : rt
        ? (await db.select().from(gatherResponseTable).where(and(eq(gatherResponseTable.gatherId, gather.id), eq(gatherResponseTable.responseToken, rt))))[0]
        : undefined;

    const isNew = !existing;
    let responseToken: string;
    let responseId: number;
    let responderName: string;

    if (existing) {
      responseId = existing.id;
      responseToken = existing.responseToken;
      const guestName = userId !== null ? existing.guestName : (str(body.guestName, 80) ?? existing.guestName);
      await db.update(gatherResponseTable)
        .set({ suggestedTime, guestName, guestEmail: userId !== null ? existing.guestEmail : (str(body.guestEmail, 160) ?? existing.guestEmail) })
        .where(eq(gatherResponseTable.id, responseId));
      await db.delete(gatherResponseOptionTable).where(eq(gatherResponseOptionTable.responseId, responseId));
      responderName = userId !== null ? "" : firstName(guestName);
    } else {
      const guestName = userId !== null ? null : str(body.guestName, 80);
      if (userId === null && !guestName) { res.status(400).json({ error: "name required" }); return; }
      responseToken = genToken();
      const [created] = await db.insert(gatherResponseTable).values({
        gatherId: gather.id,
        respondentUserId: userId,
        guestName,
        guestEmail: userId !== null ? null : str(body.guestEmail, 160),
        suggestedTime,
        responseToken,
      }).returning();
      responseId = created!.id;
      responderName = firstName(guestName);
    }

    if (avail.length > 0) {
      await db.insert(gatherResponseOptionTable).values(avail.map((a) => ({ responseId, optionId: a.optionId, availability: a.availability })));
    }

    // Notify the organizer on each NEW response (collapsed so it never spams).
    if (isNew) {
      if (userId !== null) {
        const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
        responderName = firstName(u?.name);
      }
      void sendPushToUser(gather.organizerUserId, {
        title: `New reply for "${gather.title}"`,
        body: `${responderName} marked their availability`,
        path: `/gather/${gather.id}/manage`,
        threadId: "gather", collapseId: `gather-resp-${gather.id}`,
      });
    }

    res.json({ responseToken });
  },
);

// ── Organizer dashboard (auth, organizer-only) ──────────────────────────────
router.get("/gather/:id/manage", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const [gather] = await db.select().from(gatherTable).where(eq(gatherTable.id, id));
  if (!gather) { res.status(404).json({ error: "not_found" }); return; }
  if (gather.organizerUserId !== userId) { res.status(403).json({ error: "not_organizer" }); return; }

  const options = await db.select().from(gatherOptionTable).where(eq(gatherOptionTable.gatherId, id));
  const responses = await db.select().from(gatherResponseTable).where(eq(gatherResponseTable.gatherId, id));
  const respIds = responses.map((r) => r.id);
  const ros = respIds.length > 0
    ? await db.select().from(gatherResponseOptionTable).where(inArray(gatherResponseOptionTable.responseId, respIds))
    : [];
  // Member names.
  const memberIds = responses.map((r) => r.respondentUserId).filter((n): n is number => typeof n === "number");
  const members = memberIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, memberIds))
    : [];
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const nameOf = (r: typeof responses[number]) => r.respondentUserId !== null ? (memberName.get(r.respondentUserId) ?? "Member") : (r.guestName ?? "Guest");

  const byOption = options.map((o) => {
    const here = ros.filter((ro) => ro.optionId === o.id);
    const pick = (a: string) => here.filter((ro) => ro.availability === a)
      .map((ro) => responses.find((r) => r.id === ro.responseId)).filter(Boolean)
      .map((r) => nameOf(r!));
    return { id: o.id, datetime: o.datetime, label: o.label, yes: pick("yes"), maybe: pick("maybe"), no: pick("no") };
  });

  const invitees = await db.select().from(gatherInviteeTable).where(eq(gatherInviteeTable.gatherId, id));
  const respondedUserIds = new Set(responses.map((r) => r.respondentUserId).filter(Boolean));
  const respondedEmails = new Set(responses.map((r) => (r.guestEmail ?? "").toLowerCase()).filter(Boolean));
  const nonResponders = invitees.filter((i) =>
    (i.userId && !respondedUserIds.has(i.userId)) || (i.email && !respondedEmails.has(i.email.toLowerCase()))).length;

  res.json({
    gather: { id: gather.id, title: gather.title, note: gather.note, place: gather.place, status: gather.status, shareToken: gather.shareToken, confirmedOptionId: gather.confirmedOptionId },
    shareUrl: `${APP_BASE_URL}/gather/${gather.shareToken}`,
    options: byOption,
    responses: responses.map((r) => ({ name: nameOf(r), email: r.respondentUserId !== null ? null : r.guestEmail, suggestedTime: r.suggestedTime })),
    suggestedTimes: responses.map((r) => r.suggestedTime).filter((s): s is string => !!s),
    inviteeCount: invitees.length,
    nonResponderCount: nonResponders,
  });
});

// ── Confirm a time (auth, organizer) ────────────────────────────────────────
router.post("/gather/:id/confirm", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = parseInt(String(req.params.id), 10);
  const optionId = parseInt(String((req.body ?? {}).optionId), 10);
  const [gather] = await db.select().from(gatherTable).where(eq(gatherTable.id, id));
  if (!gather) { res.status(404).json({ error: "not_found" }); return; }
  if (gather.organizerUserId !== userId) { res.status(403).json({ error: "not_organizer" }); return; }
  const [option] = await db.select().from(gatherOptionTable).where(and(eq(gatherOptionTable.id, optionId), eq(gatherOptionTable.gatherId, id)));
  if (!option) { res.status(400).json({ error: "bad option" }); return; }

  await db.update(gatherTable).set({ status: "confirmed", confirmedOptionId: optionId }).where(eq(gatherTable.id, id));

  const [organizer] = await db.select({ name: usersTable.name, timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
  const tz = organizer?.timezone || "America/New_York";
  const whenStr = fmtWhen(option.datetime, tz);
  const detailLines = [`🗓 ${whenStr}`, gather.place ? `📍 ${gather.place}` : ""].filter(Boolean);

  const responses = await db.select().from(gatherResponseTable).where(eq(gatherResponseTable.gatherId, id));
  // Members → push; guests with email → email.
  const memberIds = responses.map((r) => r.respondentUserId).filter((n): n is number => typeof n === "number");
  if (memberIds.length > 0) {
    void sendPushToUsers(memberIds, {
      title: `"${gather.title}" is set`,
      body: detailLines.join(" · "),
      path: `/gather/${gather.shareToken}`,
      threadId: "gather", collapseId: `gather-confirm-${id}`,
    });
  }
  for (const r of responses) {
    if (r.respondentUserId === null && r.guestEmail) {
      void sendGatherEmail({
        to: r.guestEmail,
        subject: `"${gather.title}" is confirmed`,
        heading: `It's set — ${gather.title}`,
        intro: `${firstName(organizer?.name)} confirmed a time. Hope you can make it!`,
        detailLines,
        ctaLabel: "See the details", ctaUrl: `${APP_BASE_URL}/gather/${gather.shareToken}`,
      });
    }
  }

  // Credit Worship & gather (+ Turn) for the organizer + members who said yes
  // to the confirmed option.
  const ros = responses.length > 0
    ? await db.select().from(gatherResponseOptionTable).where(inArray(gatherResponseOptionTable.responseId, responses.map((r) => r.id)))
    : [];
  const yesResponseIds = new Set(ros.filter((ro) => ro.optionId === optionId && ro.availability === "yes").map((ro) => ro.responseId));
  const yesMemberIds = responses.filter((r) => r.respondentUserId !== null && yesResponseIds.has(r.id)).map((r) => r.respondentUserId as number);
  await creditWorship([userId, ...yesMemberIds]);

  res.json({ ok: true });
});

// ── Nudge non-responders (auth, organizer) ──────────────────────────────────
router.post("/gather/:id/nudge", perUserRateLimit("gather_nudge", { max: 20, windowMs: 60 * 60 * 1000, message: "Too many reminders sent. Please wait a bit." }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = parseInt(String(req.params.id), 10);
  const [gather] = await db.select().from(gatherTable).where(eq(gatherTable.id, id));
  if (!gather) { res.status(404).json({ error: "not_found" }); return; }
  if (gather.organizerUserId !== userId) { res.status(403).json({ error: "not_organizer" }); return; }

  const invitees = await db.select().from(gatherInviteeTable).where(eq(gatherInviteeTable.gatherId, id));
  const responses = await db.select({ respondentUserId: gatherResponseTable.respondentUserId, guestEmail: gatherResponseTable.guestEmail }).from(gatherResponseTable).where(eq(gatherResponseTable.gatherId, id));
  const respondedUserIds = new Set(responses.map((r) => r.respondentUserId).filter(Boolean));
  const respondedEmails = new Set(responses.map((r) => (r.guestEmail ?? "").toLowerCase()).filter(Boolean));

  const nudgeMemberIds = invitees.filter((i) => i.userId && !respondedUserIds.has(i.userId)).map((i) => i.userId as number);
  const nudgeEmails = invitees.filter((i) => !i.userId && i.email && !respondedEmails.has(i.email.toLowerCase())).map((i) => i.email as string);

  const [organizer] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  const link = `${APP_BASE_URL}/gather/${gather.shareToken}`;
  if (nudgeMemberIds.length > 0) {
    void sendPushToUsers(nudgeMemberIds, {
      title: `${firstName(organizer?.name)} is waiting on you`,
      body: `Pick your times for "${gather.title}"`,
      path: `/gather/${gather.shareToken}`,
      threadId: "gather", collapseId: `gather-nudge-${id}`,
    });
  }
  for (const email of nudgeEmails) {
    void sendGatherEmail({
      to: email,
      subject: `Reminder: ${gather.title}`,
      heading: `When can you make it?`,
      intro: `${firstName(organizer?.name)} is still hoping to hear your availability for "${gather.title}".`,
      ctaLabel: "Mark your availability", ctaUrl: link,
    });
  }
  if (nudgeMemberIds.length + nudgeEmails.length > 0) {
    await db.update(gatherInviteeTable).set({ notifiedAt: new Date() }).where(eq(gatherInviteeTable.gatherId, id));
  }

  res.json({ nudged: nudgeMemberIds.length + nudgeEmails.length });
});

// ── Edit / cancel (auth, organizer) ─────────────────────────────────────────
router.patch("/gather/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = parseInt(String(req.params.id), 10);
  const [gather] = await db.select().from(gatherTable).where(eq(gatherTable.id, id));
  if (!gather) { res.status(404).json({ error: "not_found" }); return; }
  if (gather.organizerUserId !== userId) { res.status(403).json({ error: "not_organizer" }); return; }

  const body = (req.body ?? {}) as { title?: unknown; note?: unknown; place?: unknown; status?: unknown };
  const patch: Record<string, unknown> = {};
  if ("title" in body) { const t = str(body.title, 120); if (t) patch.title = t; }
  if ("note" in body) patch.note = str(body.note, 500);
  if ("place" in body) patch.place = str(body.place, 160);
  if (body.status === "cancelled") patch.status = "cancelled";
  // TODO(beta): editing the time options after responses exist (re-anchoring
  // responses) is out of scope — re-create the gathering instead.
  if (Object.keys(patch).length === 0) { res.json({ ok: true }); return; }
  await db.update(gatherTable).set(patch).where(eq(gatherTable.id, id));
  res.json({ ok: true });
});

export default router;
