// Prescribed routines — a community admin / clergy designs a daily rhythm for
// someone (through the customizer in "prescribe" mode), which captures the
// routine as a portable spec and mints a token link. The recipient opens
// /routine/:token, sees what it contains, and on accept has it applied to
// their account.
//
// What "apply" writes: office prefs, home layout, contemplation goal / silence
// ladder, and the per-device rule-config. It NEVER touches the recipient's
// prayers, fellows, journals, or any other personal content.
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  prescribedRoutinesTable,
  usersTable,
  groupsTable,
  groupMembersTable,
  betaUsersTable,
  type PrescribedRoutineSpec,
} from "@workspace/db";

const router: IRouter = Router();

function getUserId(req: unknown): number | null {
  const u = (req as { user?: { id?: number } }).user;
  return u && typeof u.id === "number" ? u.id : null;
}

// Same module key set the home-layout route validates against, so an applied
// layout can never surface an unknown card.
const HOME_MODULE_KEYS = [
  "office", "feeds", "contemplation", "listening", "lectio", "reading", "walk",
  "cobreathe", "gratitude", "examen", "journaling", "cac", "fdd", "ssje",
  "ncmp", "podcasts", "requests",
] as const;

function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "hidden_admin";
}

// Resolve the group for `slug` and confirm `userId` is an admin of it.
async function adminOfGroup(slug: string, userId: number) {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, slug));
  if (!group) return null;
  const [member] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.userId, userId)));
  if (!member || !member.joinedAt || !isAdminRole(member.role)) return null;
  return group;
}

// App SUPER ADMIN (beta_users.is_admin, matched by email) — the same check
// /auth/me uses for `isSuperAdmin`. Gates creating an app-wide PRESET rule
// (a prescribed routine with no group attached).
async function isSuperAdminUser(userId: number): Promise<boolean> {
  try {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
    if (!u?.email) return false;
    const [beta] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch { return false; }
}

// ── Validation ──────────────────────────────────────────────────────────────
const ALLOWED_PREFS = new Set(["none", "office", "devotion"]);
const ALLOWED_LEVELS = new Set(["ask", "devotion", "office", "intercessions", "reflect-sit", "journal"]);
const TIME_RE = /^\d{2}:\d{2}$/;

function sanitizeSpec(raw: unknown): PrescribedRoutineSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const op = s.officePrefs as Record<string, unknown> | undefined;
  const hl = s.homeLayout as Record<string, unknown> | undefined;
  if (!op || typeof op !== "object" || !hl || typeof hl !== "object") return null;

  const morning = ALLOWED_PREFS.has(op.morning as string) ? (op.morning as "none" | "office" | "devotion") : "none";
  const evening = ALLOWED_PREFS.has(op.evening as string) ? (op.evening as "none" | "office" | "devotion") : "none";
  const defaultPrayerLevel = ALLOWED_LEVELS.has(op.defaultPrayerLevel as string) ? (op.defaultPrayerLevel as string) : "ask";
  const goal = typeof op.contemplationGoalMinutes === "number" && Number.isFinite(op.contemplationGoalMinutes)
    ? Math.max(0, Math.min(180, Math.round(op.contemplationGoalMinutes))) : 0;
  const morningTime = typeof op.morningTime === "string" && TIME_RE.test(op.morningTime) ? op.morningTime : null;
  const eveningTime = typeof op.eveningTime === "string" && TIME_RE.test(op.eveningTime) ? op.eveningTime : null;

  const order = Array.isArray(hl.order) ? hl.order.filter((k): k is string => typeof k === "string") : [];
  const hidden = Array.isArray(hl.hidden) ? hl.hidden.filter((k): k is string => typeof k === "string") : [];
  if (order.length === 0) return null;

  // rule-config values: string→string, bounded like /me/rule-config.
  const rcRaw = (s.ruleConfig && typeof s.ruleConfig === "object" && !Array.isArray(s.ruleConfig))
    ? (s.ruleConfig as Record<string, unknown>) : {};
  const ruleConfig: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(rcRaw)) {
    if (n >= 64) break;
    if (typeof k === "string" && k.length <= 80 && typeof v === "string" && v.length <= 8000) { ruleConfig[k] = v; n++; }
  }

  return {
    v: 1,
    officePrefs: {
      defaultPrayerLevel,
      contemplationGoalMinutes: goal,
      contemplationReminderEnabled: op.contemplationReminderEnabled === true,
      morning, evening, morningTime, eveningTime,
    },
    silenceLadderEnabled: s.silenceLadderEnabled === true,
    homeLayout: { order, hidden, v: typeof hl.v === "number" ? hl.v : undefined },
    ruleConfig,
  };
}

// Build the cleaned home-layout the same way PUT /me/home-layout does.
function cleanHomeLayout(layout: PrescribedRoutineSpec["homeLayout"]) {
  const allowed = new Set<string>(HOME_MODULE_KEYS);
  const seen = new Set<string>();
  const cleanOrder = layout.order.filter((k) => allowed.has(k) && !seen.has(k) && (seen.add(k), true));
  for (const k of HOME_MODULE_KEYS) if (!seen.has(k)) cleanOrder.push(k);
  let cleanHidden = [...new Set(layout.hidden.filter((k) => allowed.has(k)))];
  if (cleanHidden.length >= cleanOrder.length) cleanHidden = cleanHidden.filter((k) => k !== cleanOrder[0]);
  return { order: cleanOrder, hidden: cleanHidden, ...(layout.v !== undefined ? { v: layout.v } : {}) };
}

// YYYY-MM-DD `days` from today, in UTC (good enough — the ladder re-evaluates
// against the user's own tz on the next GET).
function ymdShift(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const LADDER_MIN = 5, LADDER_MAX = 30;

// ── POST /api/prescribed-routines — create ───────────────────────────────────
// With `groupSlug`: the clergy flow — must be an admin of that community.
// WITHOUT `groupSlug`: an app-wide PRESET rule — super admins only. Same
// spec/label/token shape either way; the row just has no group attached.
router.post("/prescribed-routines", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = (req.body ?? {}) as { groupSlug?: unknown; spec?: unknown; label?: unknown };
  let groupId: number | null = null;
  if (typeof body.groupSlug === "string" && body.groupSlug) {
    const group = await adminOfGroup(body.groupSlug, me);
    if (!group) { res.status(403).json({ error: "Admin access required" }); return; }
    groupId = group.id;
  } else {
    if (!(await isSuperAdminUser(me))) { res.status(403).json({ error: "Admin access required" }); return; }
  }
  const spec = sanitizeSpec(body.spec);
  if (!spec) { res.status(400).json({ error: "Invalid routine spec" }); return; }
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
  const token = crypto.randomBytes(16).toString("hex");
  try {
    await db.insert(prescribedRoutinesTable).values({
      token, groupId, createdByUserId: me, label, spec,
    });
    res.json({ token, url: `https://withphoebe.app/routine/${token}` });
  } catch (err) {
    console.error("[prescribed-routines] create failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/prescribed-routines/:token — public landing data ────────────────
router.get("/prescribed-routines/:token", async (req, res): Promise<void> => {
  const token = req.params.token;
  if (!/^[a-f0-9]{32}$/i.test(token)) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const [row] = await db.select({
      label: prescribedRoutinesTable.label,
      spec: prescribedRoutinesTable.spec,
      groupId: prescribedRoutinesTable.groupId,
      createdByUserId: prescribedRoutinesTable.createdByUserId,
    }).from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.token, token)).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    // Presets have no group — groupName stays null and the landing page just
    // shows the creator / "A rhythm for you".
    const [group] = row.groupId != null
      ? await db.select({ name: groupsTable.name }).from(groupsTable).where(eq(groupsTable.id, row.groupId)).limit(1)
      : [undefined];
    const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.createdByUserId)).limit(1);
    res.json({
      label: row.label,
      groupName: group?.name ?? null,
      createdByName: creator?.name ?? null,
      spec: row.spec,
    });
  } catch (err) {
    console.error("[prescribed-routines] get failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/prescribed-routines/:token/accept — apply to my account ────────
router.post("/prescribed-routines/:token/accept", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = req.params.token;
  if (!/^[a-f0-9]{32}$/i.test(token)) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const [row] = await db.select({ id: prescribedRoutinesTable.id, spec: prescribedRoutinesTable.spec })
      .from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.token, token)).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const spec = sanitizeSpec(row.spec);
    if (!spec) { res.status(422).json({ error: "Routine is no longer valid" }); return; }

    const op = spec.officePrefs;
    // The contemplation goal: when the ladder is on, the rung drives it; else the
    // designed minutes stand.
    const ladderLevel = Math.max(LADDER_MIN, Math.min(LADDER_MAX, op.contemplationGoalMinutes || LADDER_MIN));
    const update: Record<string, unknown> = {
      parishOfficeMorningPref: op.morning,
      parishOfficeEveningPref: op.evening,
      parishOfficeMorningTime: op.morningTime,
      parishOfficeEveningTime: op.eveningTime,
      defaultPrayerLevel: op.defaultPrayerLevel,
      contemplationGoalMinutes: spec.silenceLadderEnabled ? ladderLevel : op.contemplationGoalMinutes,
      contemplationReminderEnabled: op.contemplationReminderEnabled,
      homeLayout: cleanHomeLayout(spec.homeLayout),
      ruleConfig: { values: spec.ruleConfig, updatedAt: Date.now() },
      silenceLadder: spec.silenceLadderEnabled
        // Enabling: start today counting toward the rung (lastEvalDate = yesterday).
        ? { enabled: true, level: ladderLevel, levelDays: 0, missStreak: 0, lastEvalDate: ymdShift(-1) }
        : { enabled: false, level: LADDER_MIN, levelDays: 0, missStreak: 0, lastEvalDate: ymdShift(0) },
    };
    await db.update(usersTable).set(update).where(eq(usersTable.id, me));
    await db.update(prescribedRoutinesTable)
      .set({ acceptCount: sql`${prescribedRoutinesTable.acceptCount} + 1` })
      .where(eq(prescribedRoutinesTable.id, row.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[prescribed-routines] accept failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
