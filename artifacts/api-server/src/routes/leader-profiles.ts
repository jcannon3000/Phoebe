// Leader pages + the routine questionnaire (see lib/db/src/schema/leader_profiles.ts).
//
//   GET  /api/leaders/:slug          public  - the page's name + welcome
//   POST /api/leaders/:slug/intake   public  - five answers + name + email
//   GET  /api/leader/me              admin   - my profile (or null)
//   PUT  /api/leader/me              admin   - create / edit my profile
//   GET  /api/leader/intakes         admin   - my inbox (a super admin sees all)
//   PATCH /api/leader/intakes/:id    admin   - status / attach a routine
//
// Leaders are SUPER ADMINS for now (owner: admins first, other leaders later).
import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, leaderProfilesTable, routineIntakesTable } from "@workspace/db";
import { rateLimit } from "../lib/rate-limit";
import { isSuperAdminUser } from "../lib/superAdmin";

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

// The newsletters the questionnaire offers (keys are the app's reflection sources).
export const INTAKE_NEWSLETTERS = ["cac", "fdd", "ssje", "vts", "nouwen", "payg", "taizeprayer"] as const;

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
  const b = (req.body ?? {}) as Record<string, unknown>;
  // Honeypot: a real person never fills this hidden field. Answer as if it worked.
  if (typeof b["website"] === "string" && b["website"].trim()) { res.json({ ok: true }); return; }
  const name = clip(b["name"], 120);
  const email = clip(b["email"], 200).toLowerCase();
  if (!name) { res.status(400).json({ error: "name_required" }); return; }
  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: "email_invalid" }); return; }
  const newsletters = Array.isArray(b["newsletters"])
    ? [...new Set((b["newsletters"] as unknown[]).filter((k): k is string => typeof k === "string"))]
        .filter((k) => (INTAKE_NEWSLETTERS as readonly string[]).includes(k))
    : [];
  await db.insert(routineIntakesTable).values({
    leaderProfileId: p.id, name, email,
    morning: clip(b["morning"], 2000), evening: clip(b["evening"], 2000),
    connect: clip(b["connect"], 2000), grow: clip(b["grow"], 2000),
    newsletters,
  });
  res.json({ ok: true });
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

router.patch("/leader/intakes/:id", async (req, res): Promise<void> => {
  const userId = await requireAdmin(req, res); if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "bad_id" }); return; }
  const status = (req.body ?? {}).status;
  if (!["new", "crafted", "sent"].includes(status)) { res.status(400).json({ error: "bad_status" }); return; }
  const [row] = await db.update(routineIntakesTable)
    .set({ status, ...(status === "sent" ? { sentAt: new Date() } : {}) })
    .where(eq(routineIntakesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ intake: row });
});

export default router;
