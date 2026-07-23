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
import { rateLimit, perUserRateLimit, getClientIp } from "../lib/rate-limit";
import { getGardenUserIds } from "../lib/garden";

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
// Daily per-user cap on invitee EMAILS sent through gather invites, across ALL
// of a user's gatherings. A backstop on the shared mail sender so one account
// can't blast it even by creating many gatherings. In-memory + single-instance,
// mirroring lib/rate-limit.ts; the window resets 24h after the first send.
// Returns the prefix of `emails` that fits the remaining daily budget.
const GATHER_EMAIL_DAILY_CAP = 60;
const gatherEmailBudget = new Map<number, { count: number; resetAt: number }>();
function takeGatherEmailBudget(userId: number, emails: string[]): string[] {
  if (emails.length === 0) return emails;
  const now = Date.now();
  let b = gatherEmailBudget.get(userId);
  if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + 24 * 60 * 60 * 1000 }; gatherEmailBudget.set(userId, b); }
  const allowed = emails.slice(0, Math.max(0, GATHER_EMAIL_DAILY_CAP - b.count));
  b.count += allowed.length;
  return allowed;
}

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
  // Restrict the push targets to people the organizer is actually connected to
  // (Fellows or group co-members) and cap the count. inviteeUserIds is
  // attacker-controlled; without this it's a lock-screen spam vector — any
  // client could push "X wants to get together" at thousands of arbitrary user
  // ids. Guest emails stay open (that's how you invite someone off-app) but are
  // separately capped + daily-budgeted below.
  const rawInviteeUserIds = Array.isArray(body.inviteeUserIds)
    ? Array.from(new Set(body.inviteeUserIds.filter((n): n is number => typeof n === "number" && n !== userId)))
    : [];
  const gardenIds = rawInviteeUserIds.length > 0
    ? new Set(await getGardenUserIds(userId))
    : new Set<number>();
  const inviteeUserIds = rawInviteeUserIds.filter((n) => gardenIds.has(n)).slice(0, 30);
  const inviteeEmailsRaw = (Array.isArray(body.inviteeEmails)
    ? body.inviteeEmails.map((e) => str(e, 160)).filter((e): e is string => !!e)
    : []
  ).slice(0, 20); // per-request cap — one request must not email thousands
  // Daily backstop: bound how many invitee emails ONE user can send across all
  // their gatherings per day (truncate, don't reject — the gathering is still
  // created and the organizer can re-share the link).
  const inviteeEmails = takeGatherEmailBudget(userId, inviteeEmailsRaw);
  if (inviteeEmails.length < inviteeEmailsRaw.length) {
    console.warn(`[gather] user ${userId} hit the daily invite-email cap (${GATHER_EMAIL_DAILY_CAP}/day); sent ${inviteeEmails.length}/${inviteeEmailsRaw.length}`);
  }
  const inviteeRows = [
    ...inviteeUserIds.map((u) => ({ gatherId: gather!.id, userId: u, email: null })),
    ...inviteeEmails.map((e) => ({ gatherId: gather!.id, userId: null, email: e })),
  ];
  if (inviteeRows.length > 0) await db.insert(gatherInviteeTable).values(inviteeRows);

  // Social invite/notify layer removed: gatherings are recorded and shared
  // by link, but no push or email invitations are sent to invitees.

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

    // Social invite/notify layer removed: no organizer push on new responses.
    void isNew;
    void responderName;

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

  // Social invite/notify layer removed: no confirmation push or email is
  // sent to members or guests. The confirmed time is still recorded and
  // surfaces as a read-only event card via /gather/mine/events.
  const responses = await db.select().from(gatherResponseTable).where(eq(gatherResponseTable.gatherId, id));

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

// Nudge/reminder endpoint removed with the social invite/notify layer.

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
