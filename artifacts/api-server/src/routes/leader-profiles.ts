// Leader pages + the routine questionnaire (see lib/db/src/schema/leader_profiles.ts).
//
//   GET  /api/leaders/:slug          public  - the page's name + welcome
//   POST /api/leaders/:slug/intake   account - five answers (name + email come from the account)
//   GET  /api/leader/me              admin   - my profile (or null)
//   PUT  /api/leader/me              admin   - create / edit my profile
//   GET  /api/leader/intakes         admin   - my inbox (a super admin sees all)
//   PATCH /api/leader/intakes/:id    admin   - status / attach a routine
//
// Leaders are SUPER ADMINS for now (owner: admins first, other leaders later).
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { db, leaderProfilesTable, routineIntakesTable, prescribedRoutinesTable, usersTable } from "@workspace/db";
import { sendLeaderRoutineEmail, sendLeaderIntakeNoticeEmail } from "../lib/email";
import { sendLeaderRoutinePush } from "../lib/pushSender";
import { sanitizeSpec } from "../lib/routineSpec";
import { describeSpec } from "../lib/routineDescribe";
import type { RoutineIntake } from "@workspace/db";
import { rateLimit } from "../lib/rate-limit";
import { isSuperAdminUser } from "../lib/superAdmin";

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

// The newsletters the questionnaire offers (keys are the app's reflection sources).
export const INTAKE_NEWSLETTERS = ["cac", "fdd", "ssje", "vts", "nouwen", "payg", "taizeprayer"] as const;

const APP_BASE = (process.env["APP_BASE_URL"] ?? "https://withphoebe.app").replace(/\/$/, "");
const QUESTION_LABELS = {
  morning: "How do you pray, or how would you like to pray, in the morning?",
  evening: "How do you pray, or how would you like to pray, in the evening?",
  connect: "How do you best connect with God?",
  format: "What content format works best for you?",
  grow: "How would you like to grow in your prayer life?",
} as const;
const NEWSLETTER_NAMES: Record<string, string> = {
  cac: "Daily Meditation (CAC)", fdd: "Forward Day by Day", ssje: "SSJE", vts: "Dean's Commentary",
  nouwen: "Nouwen Daily Devotion", payg: "Pray As You Go", taizeprayer: "Taizé Daily Prayer",
};
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v: unknown, n: number): string => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function requireAdmin(req: any, res: any): Promise<number | null> {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (!(await isSuperAdminUser(userId))) { res.status(403).json({ error: "Admin access required" }); return null; }
  return userId;
}

router.get("/leaders/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug ?? "").toLowerCase();
  const [p] = await db.select().from(leaderProfilesTable).where(eq(leaderProfilesTable.slug, slug));
  if (!p || !p.active) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ displayName: p.displayName, welcome: p.welcome, newsletters: INTAKE_NEWSLETTERS });
});

router.post("/leaders/:slug/intake", rateLimit({
  name: "leader_intake", max: 6, windowMs: 60 * 60 * 1000,
  message: "Too many submissions from here. Please try again in a little while.",
}), async (req, res): Promise<void> => {
  const slug = String(req.params.slug ?? "").toLowerCase();
  const [p] = await db.select().from(leaderProfilesTable).where(eq(leaderProfilesTable.slug, slug));
  if (!p || !p.active) { res.status(404).json({ error: "not_found" }); return; }
  // An ACCOUNT is required (owner, 2026-10-04): the routine is delivered to it and
  // emailed. The anonymous device user is not an account.
  const me = (req as { user?: { id?: number; isAnonymous?: boolean } }).user;
  if (!me?.id || me.isAnonymous) { res.status(401).json({ error: "account_required" }); return; }
  const [acct] = await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, me.id));
  const email = (acct?.email ?? "").trim().toLowerCase();
  const name = (acct?.name ?? "").trim() || email.split("@")[0] || "";
  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: "email_invalid" }); return; }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const newsletters = Array.isArray(b["newsletters"])
    ? [...new Set((b["newsletters"] as unknown[]).filter((k): k is string => typeof k === "string"))]
        .filter((k) => (INTAKE_NEWSLETTERS as readonly string[]).includes(k))
    : [];
  const fields = {
    morning: clip(b["morning"], 2000), evening: clip(b["evening"], 2000),
    connect: clip(b["connect"], 2000), format: clip(b["format"], 2000), grow: clip(b["grow"], 2000),
  };
  await db.insert(routineIntakesTable).values({ leaderProfileId: p.id, userId: me.id, name, email, ...fields, newsletters });
  res.json({ ok: true, name, email });
  // Tell the leader. After the reply: a mail hiccup must never fail the person's submission.
  void (async () => {
    try {
      const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, p.userId));
      if (u?.email) await sendLeaderIntakeNoticeEmail({ to: u.email, applicantName: name, applicantEmail: email, adminUrl: `${APP_BASE}/admin/leaders`,
        answers: [
          ...(Object.keys(QUESTION_LABELS) as Array<keyof typeof QUESTION_LABELS>).map((k) => ({ q: QUESTION_LABELS[k], a: fields[k] })),
          { q: "Daily reflections they'd like", a: newsletters.map((k) => NEWSLETTER_NAMES[k] ?? k).join(", ") },
        ] });
    } catch (err) { console.error("[leader-intake] notice failed", err); }
  })();
});

router.get("/leader/me", async (req, res): Promise<void> => {
  const userId = await requireAdmin(req, res); if (!userId) return;
  const [p] = await db.select().from(leaderProfilesTable).where(eq(leaderProfilesTable.userId, userId));
  res.json({ profile: p ?? null });
});

router.put("/leader/me", async (req, res): Promise<void> => {
  const userId = await requireAdmin(req, res); if (!userId) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const slug = clip(b["slug"], 40).toLowerCase();
  const displayName = clip(b["displayName"], 120);
  if (!SLUG_RE.test(slug)) { res.status(400).json({ error: "slug_invalid" }); return; }
  if (!displayName) { res.status(400).json({ error: "name_required" }); return; }
  const welcome = clip(b["welcome"], 1000) || null;
  const active = b["active"] !== false;
  const [taken] = await db.select({ userId: leaderProfilesTable.userId }).from(leaderProfilesTable).where(eq(leaderProfilesTable.slug, slug));
  if (taken && taken.userId !== userId) { res.status(409).json({ error: "slug_taken" }); return; }
  const [mine] = await db.select({ id: leaderProfilesTable.id }).from(leaderProfilesTable).where(eq(leaderProfilesTable.userId, userId));
  const [row] = mine
    ? await db.update(leaderProfilesTable).set({ slug, displayName, welcome, active }).where(eq(leaderProfilesTable.id, mine.id)).returning()
    : await db.insert(leaderProfilesTable).values({ userId, slug, displayName, welcome, active }).returning();
  res.json({ profile: row });
});

router.get("/leader/intakes", async (req, res): Promise<void> => {
  const userId = await requireAdmin(req, res); if (!userId) return;
  // Every leader today is a super admin, and super admins see every inbox.
  const profiles = await db.select().from(leaderProfilesTable);
  if (profiles.length === 0) { res.json({ intakes: [] }); return; }
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const rows = await db.select().from(routineIntakesTable)
    .where(inArray(routineIntakesTable.leaderProfileId, profiles.map((p) => p.id)))
    .orderBy(desc(routineIntakesTable.createdAt)).limit(300);
  res.json({ intakes: rows.map((r) => ({ ...r, leaderName: byId.get(r.leaderProfileId)?.displayName ?? null })) });
});

router.get("/leader/intakes/:id", async (req, res): Promise<void> => {
  const userId = await requireAdmin(req, res); if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "bad_id" }); return; }
  const [row] = await db.select().from(routineIntakesTable).where(eq(routineIntakesTable.id, id));
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ intake: row });
});

router.patch("/leader/intakes/:id", async (req, res): Promise<void> => {
  const userId = await requireAdmin(req, res); if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "bad_id" }); return; }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const set: Record<string, unknown> = {};
  if (b["status"] !== undefined) {
    if (!["new", "crafted", "sent"].includes(b["status"] as string)) { res.status(400).json({ error: "bad_status" }); return; }
    set["status"] = b["status"];
    if (b["status"] === "sent") set["sentAt"] = new Date();
  }
  if (b["prescribedRoutineId"] !== undefined) {
    const rid = Number(b["prescribedRoutineId"]);
    const [r] = Number.isInteger(rid) ? await db.select({ id: prescribedRoutinesTable.id }).from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.id, rid)) : [];
    if (!r) { res.status(400).json({ error: "bad_routine" }); return; }
    set["prescribedRoutineId"] = rid;
  }
  if (Object.keys(set).length === 0) { res.status(400).json({ error: "nothing_to_change" }); return; }
  const [row] = await db.update(routineIntakesTable).set(set).where(eq(routineIntakesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ intake: row });
});

// Deliver the designed routine to the person: a push to their phone (their account),
// plus an email to the address on it. Nothing is applied for them - they open
// /routine/:token and tap to add it (it is their prayer life). Marked "sent" only
// if something actually reached them.
async function deliverIntake(intake: RoutineIntake): Promise<{ ok: boolean; emailed: boolean; pushed: boolean; url: string | null }> {
  if (!intake.prescribedRoutineId) return { ok: false, emailed: false, pushed: false, url: null };
  const [routine] = await db.select().from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.id, intake.prescribedRoutineId));
  const [profile] = await db.select().from(leaderProfilesTable).where(eq(leaderProfilesTable.id, intake.leaderProfileId));
  if (!routine || !profile) return { ok: false, emailed: false, pushed: false, url: null };
  const url = `${APP_BASE}/routine/${routine.token}`;

  let rows: Array<{ emoji: string; label: string; sub: string }> = [];
  try { rows = describeSpec(routine.spec as Parameters<typeof describeSpec>[0]).map((r) => ({ emoji: r.emoji, label: r.label, sub: r.sub })); } catch { /* the email still carries the link */ }
  const emailed = await sendLeaderRoutineEmail({ to: intake.email, name: intake.name, leaderName: profile.displayName, url, rows }).catch(() => false);
  let pushed = false;
  try {
    const targetId = intake.userId ?? (await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${intake.email.toLowerCase()}`))[0]?.id;
    if (targetId) {
      const r = await sendLeaderRoutinePush(targetId, { leaderName: profile.displayName, token: routine.token });
      pushed = r.deviceSucceeded > 0;
    }
  } catch (err) { console.error("[leader-intake] push failed", err); }

  if (emailed || pushed) await db.update(routineIntakesTable).set({ status: "sent", sentAt: new Date() }).where(eq(routineIntakesTable.id, intake.id));
  return { ok: true, emailed, pushed, url };
}

// Send (or re-send) an intake's routine.
router.post("/leader/intakes/:id/send", async (req, res): Promise<void> => {
  const userId = await requireAdmin(req, res); if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "bad_id" }); return; }
  const [intake] = await db.select().from(routineIntakesTable).where(eq(routineIntakesTable.id, id));
  if (!intake) { res.status(404).json({ error: "not_found" }); return; }
  if (!intake.prescribedRoutineId) { res.status(400).json({ error: "no_routine" }); return; }
  const r = await deliverIntake(intake);
  res.json(r);
});

// The leader finished designing: mint the routine link, attach it to this response,
// and deliver it - push + email - in one step. The link comes back too, so the
// leader can send it themselves as well.
router.post("/leader/intakes/:id/finish", async (req, res): Promise<void> => {
  const userId = await requireAdmin(req, res); if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "bad_id" }); return; }
  const [intake] = await db.select().from(routineIntakesTable).where(eq(routineIntakesTable.id, id));
  if (!intake) { res.status(404).json({ error: "not_found" }); return; }
  const spec = sanitizeSpec((req.body ?? {}).spec);
  if (!spec) { res.status(400).json({ error: "Invalid routine spec" }); return; }
  const rawLabel = (req.body ?? {}).label;
  const label = typeof rawLabel === "string" ? rawLabel.trim().slice(0, 80) || null : null;
  const token = crypto.randomBytes(16).toString("hex");
  try {
    const [routine] = await db.insert(prescribedRoutinesTable)
      .values({ token, groupId: null, createdByUserId: userId, label, spec }).returning();
    const [updated] = await db.update(routineIntakesTable)
      .set({ prescribedRoutineId: routine!.id, status: "crafted" }).where(eq(routineIntakesTable.id, id)).returning();
    const r = await deliverIntake(updated!);
    res.json({ ...r, url: r.url ?? `${APP_BASE}/routine/${token}`, name: intake.name, email: intake.email });
  } catch (err) {
    console.error("[leader-intake] finish failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
