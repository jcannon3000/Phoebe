// Shared "portable routine spec" machinery — sanitize a client-supplied
// PrescribedRoutineSpec and apply it to a user's account. Used by BOTH accept
// paths: prescribed-routine / preset links (routes/prescribed-routines.ts) and
// creator-season joins (routes/creator-seasons.ts). One implementation so the
// two can't drift.
//
// What "apply" writes: office prefs, home layout, contemplation goal / silence
// ladder, and the per-device rule-config. It NEVER touches the user's prayers,
// fellows, journals, or any other personal content.
import { eq } from "drizzle-orm";
import { db, usersTable, type PrescribedRoutineSpec } from "@workspace/db";

// Same module key set the home-layout route validates against, so an applied
// layout can never surface an unknown card.
const HOME_MODULE_KEYS = [
  "office", "feeds", "contemplation", "listening", "lectio", "reading", "walk",
  "cobreathe", "gratitude", "examen", "journaling", "cac", "fdd", "ssje",
  "ncmp", "podcasts", "requests",
] as const;

const ALLOWED_PREFS = new Set(["none", "office", "devotion"]);
const ALLOWED_LEVELS = new Set(["ask", "devotion", "office", "intercessions", "reflect-sit", "journal"]);
const TIME_RE = /^\d{2}:\d{2}$/;

export function sanitizeSpec(raw: unknown): PrescribedRoutineSpec | null {
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
export function cleanHomeLayout(layout: PrescribedRoutineSpec["homeLayout"]) {
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

/** Apply a sanitized spec to the user's account in ONE users update. */
export async function applyRoutineSpecToUser(userId: number, spec: PrescribedRoutineSpec): Promise<void> {
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
  await db.update(usersTable).set(update).where(eq(usersTable.id, userId));
}
