/**
 * THE STARTER RHYTHMS AND THE DEFAULT ONE, EDITABLE — routes for
 * schema/routine_presets.
 *
 * Owner: "I want an admin tool where I could edit the preset routines
 * including the default one."
 *
 * READ is public and unauthenticated on purpose: a logged-out device seeds the
 * default rhythm on first open, and the light customizer offers the same
 * presets a signed-in one does. WRITE is super-admin only.
 *
 * Everything here is an OVERLAY. The presets ship in code (the client's
 * RULE_PRESETS) and that list is the fallback, so an empty table — or a device
 * that can't reach the network — behaves exactly as the app does today. See
 * the schema file for what a row means.
 *
 * A body is UNTRUSTED even from an admin: it is written into every user's
 * picker and, for "__default__", into what a new device seeds. So it is
 * validated field by field against the same value sets the client's types
 * carry, and anything unrecognised is dropped rather than guessed at — the
 * discipline sanitizeSpec keeps for prescribed routines.
 */
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, routinePresetsTable } from "@workspace/db";
import { isSuperAdminUser } from "../lib/superAdmin";

const router: IRouter = Router();

function getUserId(req: any): number | null {
  const id = req.session?.userId ?? req.user?.id ?? null;
  return typeof id === "number" ? id : null;
}

/** The reserved slug: the default rhythm, not one of the picker's rules. */
export const DEFAULT_SLUG = "__default__";

// ── Value sets, mirroring the client's own types ─────────────────────────────
// rulePresets.ts PrayChoice
const PRAY = new Set(["none", "community", "devotion", "offices", "compline", "contemplation",
  "fdd", "readings", "psalms", "examen", "creation", "guidedPrayer", "ownPractice"]);
// officePrefs.ts ReflectionSource
const SOURCES = new Set(["cac", "fdd", "ssje", "vts", "nouwen", "sojo", "grist", "none"]);
// officePrefs.ts OfficeLevel — what a side's level may be (the default's shape)
const LEVELS = new Set(["ask", "devotion", "office", "intercessions", "reflect-sit", "fdd",
  "readings", "psalms", "examen", "creation", "guided-prayer", "custom", "compline"]);
// customAnchors.ts CustomSlot
const SLOTS = new Set(["morning", "anytime", "midday", "afternoon", "evening"]);
// customAnchors.ts SlottedPractice
const SLOTTED = new Set(["cobreathe", "listening", "examen", "walk", "reading", "visio", "icons", "taize", "spirituals"]);
// customAnchors.ts RELATIONAL_PRACTICES ids
const RELATIONAL = new Set(["hug", "gratitude", "call"]);
// RulePreset.practices keys
const PRACTICE_FLAGS = new Set(["cobreathe", "audio", "examen", "walk", "visio", "compline"]);
// homeModules.ts HOME_MODULE_KEYS — the default's `cards`
import { HOME_MODULE_KEYS } from "../lib/homeModules";
const CARDS = new Set<string>(HOME_MODULE_KEYS);
const SIDES = ["morning", "evening"] as const;

const str = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : undefined;
};
const days = (v: unknown): number[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const d = [...new Set(v.filter((x): x is number => typeof x === "number" && x >= 0 && x <= 6))].sort();
  return d.length > 0 && d.length < 7 ? d : undefined;
};
const pick = <T>(v: unknown, set: Set<string>): T | undefined =>
  typeof v === "string" && set.has(v) ? (v as T) : undefined;
const pickList = (v: unknown, set: Set<string>, max = 12): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter((x): x is string => typeof x === "string" && set.has(x)))].slice(0, max);
  return out.length > 0 ? out : undefined;
};
/** Build `{ [side]: value }` from a partial record, keeping only real sides. */
function bySide<T>(v: unknown, one: (x: unknown) => T | undefined): Record<string, T> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const src = v as Record<string, unknown>;
  const out: Record<string, T> = {};
  for (const s of SIDES) {
    const got = one(src[s]);
    if (got !== undefined) out[s] = got;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
function keep<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

/**
 * ONE PICKER RULE. Every optional field of the client's RulePreset is carried
 * through — a field this misses is a field the admin tool silently deletes on
 * save, which is how a saved VTS rule would lose its Chapel practice or its
 * Express Gratitude.
 */
export function sanitizeRulePreset(raw: unknown, slug: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const sides = (() => {
    const s = b.sides as Record<string, unknown> | undefined;
    return { morning: s?.morning !== false, evening: s?.evening !== false };
  })();
  const out = keep({
    id: str(b.id, 40) ?? slug,
    emoji: str(b.emoji, 8) ?? "🌿",
    sides,
    pray: pick<string>(b.pray, PRAY) ?? "offices",
    evening: pick<string>(b.evening, PRAY),
    silence: bool(b.silence) ?? false,
    goalMin: num(b.goalMin, 0, 180) ?? 0,
    title: str(b.title, 80),
    blurb: str(b.blurb, 400),
    rows: Array.isArray(b.rows)
      ? b.rows.slice(0, 8).map((r) => keep({ emoji: str((r as any)?.emoji, 8) ?? "·", label: str((r as any)?.label, 80) ?? "" }))
        .filter((r) => r.label)
      : undefined,
    silenceSide: pick<string>(b.silenceSide, new Set(SIDES)),
    contemplationStyle: pick<string>(b.contemplationStyle, new Set(["silent", "cobreathe"])),
    reflections: pickList(b.reflections, SOURCES, 7) ?? [],
    customNames: bySide(b.customNames, (v) => str(v, 40)),
    anchorReflection: bySide(b.anchorReflection, (v) => pick<string>(v, SOURCES)),
    customAnchors: Array.isArray(b.customAnchors)
      ? b.customAnchors.slice(0, 8).map((a) => keep({
          title: str((a as any)?.title, 40) ?? "",
          emoji: str((a as any)?.emoji, 8) ?? "✅",
          slot: pick<string>((a as any)?.slot, SLOTS) ?? "anytime",
          days: days((a as any)?.days),
          office: pick<string>((a as any)?.office, new Set(SIDES)),
        })).filter((a) => a.title)
      : undefined,
    dayRules: bySide(b.dayRules, (v) => (Array.isArray(v)
      ? v.slice(0, 7).map((r) => keep({
          days: days((r as any)?.days) ?? [],
          pray: pick<string>((r as any)?.pray, PRAY) ?? "offices",
          name: str((r as any)?.name, 40),
        })).filter((r) => r.days.length > 0)
      : undefined)),
    practices: (() => {
      const p = b.practices as Record<string, unknown> | undefined;
      if (!p || typeof p !== "object") return undefined;
      const out: Record<string, boolean> = {};
      for (const k of Object.keys(p)) if (PRACTICE_FLAGS.has(k) && typeof p[k] === "boolean") out[k] = p[k] as boolean;
      return Object.keys(out).length > 0 ? out : undefined;
    })(),
    practiceSlots: (() => {
      const p = b.practiceSlots as Record<string, unknown> | undefined;
      if (!p || typeof p !== "object") return undefined;
      const out: Record<string, string> = {};
      for (const k of Object.keys(p)) {
        const slot = pick<string>(p[k], SLOTS);
        if (SLOTTED.has(k) && slot) out[k] = slot;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    })(),
    relational: pickList(b.relational, RELATIONAL, 3),
  });
  // A rule nobody can read is not a rule: the picker renders a title.
  if (!out.title) return null;
  return out;
}

/**
 * THE DEFAULT RHYTHM — a different shape from a picker rule, because it is
 * applied by the seed rather than adopted through the customizer: it is
 * exactly the set of writes seedGuestRule makes (two side levels, the
 * newsletter, the cards to turn on, the relational practices, the silence goal
 * and any practice slots).
 */
export function sanitizeDefaultSeed(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const out = keep({
    morning: pick<string>(b.morning, LEVELS) ?? "ask",
    evening: pick<string>(b.evening, LEVELS) ?? "ask",
    reflection: pick<string>(b.reflection, SOURCES),
    cards: pickList(b.cards, CARDS, CARDS.size) ?? [],
    relational: pickList(b.relational, RELATIONAL, 3) ?? [],
    silenceMin: num(b.silenceMin, 0, 180) ?? 0,
    slots: (() => {
      const p = b.slots as Record<string, unknown> | undefined;
      if (!p || typeof p !== "object") return undefined;
      const out: Record<string, string> = {};
      for (const k of Object.keys(p)) {
        const slot = pick<string>(p[k], SLOTS);
        if (SLOTTED.has(k) && slot) out[k] = slot;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    })(),
    /** Bumped by the admin when the default changes, so a device sitting on an
     *  untouched older seed adopts the new one (guestSeed's SEED_VERSION does
     *  the same job for code changes). */
    version: num(b.version, 1, 9999) ?? 1,
  });
  return out;
}

// ── GET /routine-presets — public ────────────────────────────────────────────
router.get("/routine-presets", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(routinePresetsTable);
    const presets = rows
      .filter((r) => r.slug !== DEFAULT_SLUG)
      .sort((a, b) => (a.sortOrder ?? 1e6) - (b.sortOrder ?? 1e6))
      .map((r) => ({ slug: r.slug, body: r.body, hidden: r.hidden, sortOrder: r.sortOrder }));
    const def = rows.find((r) => r.slug === DEFAULT_SLUG);
    const updatedAt = rows.reduce((n, r) => Math.max(n, new Date(r.updatedAt).getTime()), 0);
    // Short cache: the picker and the seed both read this on boot, and an
    // admin's edit should reach people the same day, not the same second.
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ presets, default: def && !def.hidden ? def.body : null, updatedAt });
  } catch (err) {
    console.error("[routine-presets] list failed:", err);
    // Never an error into the picker or the seed — an empty overlay means
    // "use what ships in the app", which is always a correct answer.
    res.json({ presets: [], default: null, updatedAt: 0 });
  }
});

// ── PUT /routine-presets/:slug — super admin ─────────────────────────────────
router.put("/routine-presets/:slug", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isSuperAdminUser(me))) { res.status(403).json({ error: "Admin access required" }); return; }

  const slug = String(req.params.slug || "").trim().slice(0, 60);
  if (!slug || !/^[A-Za-z0-9_-]+$/.test(slug)) { res.status(400).json({ error: "bad_slug" }); return; }

  const body = slug === DEFAULT_SLUG
    ? sanitizeDefaultSeed(req.body?.body)
    : sanitizeRulePreset(req.body?.body, slug);
  if (!body) { res.status(400).json({ error: "bad_body" }); return; }

  const hidden = req.body?.hidden === true;
  const sortOrder = typeof req.body?.sortOrder === "number" ? Math.round(req.body.sortOrder) : null;
  try {
    await db.insert(routinePresetsTable)
      .values({ slug, body, hidden, sortOrder, updatedByUserId: me, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: routinePresetsTable.slug,
        set: { body, hidden, sortOrder, updatedByUserId: me, updatedAt: new Date() },
      });
    res.json({ ok: true, slug, body, hidden, sortOrder });
  } catch (err) {
    console.error("[routine-presets] save failed:", err);
    res.status(500).json({ error: "save_failed" });
  }
});

// ── DELETE /routine-presets/:slug — back to what ships in the app ────────────
router.delete("/routine-presets/:slug", async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isSuperAdminUser(me))) { res.status(403).json({ error: "Admin access required" }); return; }
  const slug = String(req.params.slug || "").trim();
  try {
    await db.delete(routinePresetsTable).where(eq(routinePresetsTable.slug, slug));
    res.json({ ok: true });
  } catch (err) {
    console.error("[routine-presets] delete failed:", err);
    res.status(500).json({ error: "delete_failed" });
  }
});

export default router;
