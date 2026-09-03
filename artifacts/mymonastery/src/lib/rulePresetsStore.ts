// ── The starter rhythms, as the ADMIN has them ───────────────────────────────
//
// Owner: "I want an admin tool where I could edit the preset routines
// including the default one."
//
// RULE_PRESETS (lib/rulePresets.ts) still ships in the app and is still the
// answer when nothing else is known. This module layers the super admin's
// edits — served by GET /api/routine-presets — on top of it:
//
//   · a row whose slug matches a built-in preset's id REPLACES that preset
//   · a row with a new slug ADDS one, after the built-ins
//   · a row marked hidden takes a built-in off the picker
//   · the reserved slug "__default__" is the DEFAULT RHYTHM (see guestSeed)
//
// READ IS SYNCHRONOUS, from a localStorage cache. That is deliberate: the
// picker renders inside a step of the customizer and the default seeds on
// FIRST OPEN, before anything has been fetched — a promise there would mean a
// spinner where a rule should be, or a device seeding nothing while it waits.
// So the cache is what's read, the network only ever refreshes it for next
// time, and an empty cache means "what ships in the app".
import { RULE_PRESETS, type RulePreset } from "@/lib/rulePresets";
import type { ReflectionSource } from "@/lib/officePrefs";
import type { CustomSlot, SlottedPractice, RelationalPracticeId } from "@/lib/customAnchors";

const CACHE_KEY = "phoebe:routine-presets";
/** Refetch at most this often (ms) — the overlay changes when an admin says
 *  so, which is rare; every boot hammering it would be silly. */
const MAX_AGE = 6 * 60 * 60 * 1000;

/**
 * THE DEFAULT RHYTHM, as data.
 *
 * Not a RulePreset: the default is APPLIED by the seed rather than adopted
 * through the customizer, so its shape is the set of writes seedGuestRule
 * makes — the two side levels, the newsletter, the cards to turn on, the
 * relational practices, the silence goal, and any practice slots. `version`
 * lets an admin's change reach devices already sitting on an untouched older
 * default, the same job SEED_VERSION does for changes made in code.
 */
export type DefaultSeed = {
  morning: string;
  evening: string;
  reflection?: ReflectionSource;
  cards: string[];
  relational: RelationalPracticeId[];
  silenceMin: number;
  slots?: Partial<Record<SlottedPractice, CustomSlot>>;
  version: number;
};

type Overlay = {
  presets: Array<{ slug: string; body: RulePreset; hidden?: boolean; sortOrder?: number | null }>;
  default: DefaultSeed | null;
  updatedAt: number;
  fetchedAt: number;
};

function readCache(): Overlay | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Overlay;
    return o && Array.isArray(o.presets) ? o : null;
  } catch { return null; }
}

/**
 * The presets the picker should show: the built-ins, with the admin's edits
 * applied. Falls back to the built-ins alone whenever there is no cache, the
 * cache is unreadable, or a row's body isn't a usable rule.
 */
export function getEffectiveRulePresets(): RulePreset[] {
  const overlay = readCache();
  if (!overlay || overlay.presets.length === 0) return RULE_PRESETS;
  const bySlug = new Map(overlay.presets.map((p) => [p.slug, p]));
  const out: RulePreset[] = [];
  for (const built of RULE_PRESETS) {
    const row = bySlug.get(built.id);
    if (!row) { out.push(built); continue; }
    bySlug.delete(built.id);
    if (row.hidden) continue; // taken off the picker, body kept server-side
    // The stored body wins, but only field by field — a row written by an
    // older admin build that doesn't know about a field added since must not
    // delete it from the rule people see.
    out.push({ ...built, ...row.body, id: built.id });
  }
  // Anything left is an ADDED preset, in the admin's order, after the built-ins.
  const added = [...bySlug.values()]
    .filter((r) => !r.hidden && r.body && typeof r.body.title === "string")
    .sort((a, b) => (a.sortOrder ?? 1e6) - (b.sortOrder ?? 1e6))
    .map((r) => ({ ...r.body, id: r.body.id || r.slug }));
  return [...out, ...added];
}

/** The admin's default rhythm, or null — in which case guestSeed uses the
 *  default that ships in the app. */
export function getStoredDefaultSeed(): DefaultSeed | null {
  const overlay = readCache();
  const d = overlay?.default;
  if (!d || typeof d !== "object") return null;
  // A default with no morning AND no evening AND no cards would seed a blank
  // home; treat that as "nothing to say" rather than applying it.
  const hasAnything = (d.morning && d.morning !== "ask") || (d.evening && d.evening !== "ask")
    || (Array.isArray(d.cards) && d.cards.length > 0);
  return hasAnything ? d : null;
}

/** Refresh the cache. Fire-and-forget on boot; never throws, never blocks. */
export async function refreshRoutinePresets(force = false): Promise<void> {
  try {
    const cached = readCache();
    if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE) return;
    /**
     * A FORCED refresh must not be answered from the HTTP cache.
     *
     * The GET is sent with `Cache-Control: public, max-age=300` — right for
     * the boot-time warm, wrong immediately after an admin saves: the webview
     * would hand back the pre-save body for five minutes, so the page they
     * just saved from would go on showing the old rule.
     */
    const res = await fetch("/api/routine-presets", force ? { cache: "no-store" } : undefined);
    if (!res.ok) return;
    const data = await res.json() as Omit<Overlay, "fetchedAt">;
    if (!data || !Array.isArray(data.presets)) return;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, fetchedAt: Date.now() }));
  } catch { /* offline, blocked, private mode — the built-ins still apply */ }
}

/**
 * What the admin tool edits, straight from the server — and never from a
 * cache, HTTP or otherwise.
 *
 * `no-store` is load-bearing, not belt-and-braces: without it the editor read
 * the five-minute cached body, so a rule saved a moment ago came back
 * unedited — no "· edited" badge, no "Revert to built-in", and no way to
 * undo the save until the cache expired (found on the simulator by
 * eleanor-3a).
 */
export async function fetchRoutinePresetOverlay(): Promise<Omit<Overlay, "fetchedAt">> {
  const res = await fetch("/api/routine-presets", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// ── Editing a preset THROUGH the customizer ──────────────────────────────────
//
// Owner: "what I wanted for each is when I hit Edit it would go through the
// full flow as if I was editing my own routine." So the admin tool opens the
// real customizer, seeded from the rule being edited, and maps what comes back
// onto the stored shape. These are the two directions of that map.

import type { RoutineSpec } from "@/components/WayOfLoveRuleFlow";

/** The default that ships in the app (guestSeed's seed v7), as data — what the
 *  editor opens on before an admin has ever saved one. */
export const SEED_DEFAULT_FALLBACK: DefaultSeed = {
  morning: "guided-prayer", evening: "ask", reflection: "cac",
  cards: ["cac", "visio"], relational: ["gratitude"], silenceMin: 0,
  slots: { visio: "evening" }, version: 0,
};

/** A side's stored LEVEL → the customizer's own word for it. */
const PRAY_OF_LEVEL: Record<string, RulePreset["pray"]> = {
  office: "offices", devotion: "devotion", psalms: "psalms", readings: "readings",
  "guided-prayer": "guidedPrayer", examen: "examen", compline: "compline", fdd: "fdd",
  "reflect-sit": "contemplation", creation: "creation", custom: "ownPractice",
  intercessions: "community", ask: "none",
};
const NEWSLETTER_KEYS = ["cac", "fdd", "ssje", "vts", "nouwen", "sojo", "grist"];
/** layout key → the RulePreset.practices flag, where the two differ. */
const FLAG_OF_CARD: Record<string, string> = {
  cobreathe: "cobreathe", listening: "audio", examen: "examen",
  walk: "walk", visio: "visio", compline: "compline",
};

/**
 * THE DEFAULT RHYTHM, dressed as a rule the customizer can open.
 *
 * The flow only knows how to seed itself from a RulePreset (adoptRule), and the
 * default is not one — so it is translated on the way in, and translated back
 * on the way out by specToDefaultSeed. Nothing about the stored shape changes.
 */
export function defaultSeedToPreset(d: DefaultSeed): RulePreset {
  const practices: RulePreset["practices"] = {};
  for (const [card, flag] of Object.entries(FLAG_OF_CARD)) {
    if (d.cards.includes(card)) (practices as Record<string, boolean>)[flag] = true;
  }
  return {
    id: "__default__",
    emoji: "🌱",
    title: "The default rhythm",
    blurb: "What a new device starts with.",
    sides: { morning: d.morning !== "ask", evening: d.evening !== "ask" },
    pray: PRAY_OF_LEVEL[d.morning] ?? "none",
    evening: PRAY_OF_LEVEL[d.evening] ?? "none",
    silence: (d.silenceMin ?? 0) > 0,
    goalMin: d.silenceMin ?? 0,
    reflections: d.cards.filter((c) => NEWSLETTER_KEYS.includes(c)) as RulePreset["reflections"],
    ...(Object.keys(practices).length > 0 ? { practices } : {}),
    ...(d.slots ? { practiceSlots: d.slots } : {}),
    relational: d.relational,
  };
}

/** What `?adopt=<id>` should seed the flow with — an overlay row, a built-in,
 *  or the default rhythm under its reserved slug. */
export function resolveAdoptPreset(id: string): RulePreset | null {
  if (id === "__default__") return defaultSeedToPreset(getStoredDefaultSeed() ?? SEED_DEFAULT_FALLBACK);
  return getEffectiveRulePresets().find((p) => p.id === id) ?? null;
}

/** The cards a spec leaves visible. */
function visibleCards(spec: RoutineSpec): string[] {
  const hidden = new Set(spec.homeLayout?.hidden ?? []);
  return (spec.homeLayout?.order ?? []).filter((k) => !hidden.has(k));
}
function slotsOf(spec: RoutineSpec): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec.ruleConfig ?? {})) {
    if (k.startsWith("phoebe:slot:") && v) out[k.slice("phoebe:slot:".length)] = v;
  }
  return out;
}

/**
 * WHAT THE CUSTOMIZER BUILT → the preset body we store.
 *
 * `base` is the rule as it was, and it matters: a RoutineSpec is a routine,
 * not a rule CARD, so it carries no title, blurb, emoji or summary rows, and
 * the flow deliberately never touches relational practices or custom anchors
 * in this mode (commit() hands off to onPrescribe before it writes any). Those
 * are carried across untouched rather than dropped — dropping them is how a
 * saved rule would quietly lose Express Gratitude, or VTS its Chapel.
 */
export function specToPresetBody(spec: RoutineSpec, base: RulePreset): RulePreset {
  const rc = spec.ruleConfig ?? {};
  const cards = visibleCards(spec);
  const slots = slotsOf(spec);
  const level = (side: "morning" | "evening") => rc[`phoebe:office:level:${side}`] ?? "ask";
  const practices: Record<string, boolean> = {};
  for (const [card, flag] of Object.entries(FLAG_OF_CARD)) if (cards.includes(card)) practices[flag] = true;
  const perSideCreation = rc["phoebe:office:contemplation-kind:morning"] === "creation"
    || rc["phoebe:office:contemplation-kind:evening"] === "creation";
  const goalMin = spec.officePrefs?.contemplationGoalMinutes ?? 0;
  const sitOnASide = rc["phoebe:office:contemplation:morning"] === "1"
    || rc["phoebe:office:contemplation:evening"] === "1";
  return {
    ...base,
    id: base.id,
    sides: { morning: level("morning") !== "ask", evening: level("evening") !== "ask" },
    pray: PRAY_OF_LEVEL[level("morning")] ?? "none",
    evening: PRAY_OF_LEVEL[level("evening")] ?? "none",
    silence: goalMin > 0 || sitOnASide,
    goalMin,
    reflections: cards.filter((c) => NEWSLETTER_KEYS.includes(c)) as RulePreset["reflections"],
    ...(Object.keys(practices).length > 0 ? { practices } : { practices: undefined }),
    ...(Object.keys(slots).length > 0 ? { practiceSlots: slots as RulePreset["practiceSlots"] } : {}),
    ...(perSideCreation ? { contemplationStyle: "cobreathe" as const } : {}),
    // What the flow's Relational step collected, when it collected anything;
    // otherwise the rule keeps the ones it had.
    relational: spec.relational ?? base.relational,
    // Names a side gave its own practice ("Chapel") ride the rule-config.
    ...((rc["phoebe:office:custom-name:morning"] || rc["phoebe:office:custom-name:evening"]) ? {
      customNames: {
        ...(rc["phoebe:office:custom-name:morning"] ? { morning: rc["phoebe:office:custom-name:morning"] } : {}),
        ...(rc["phoebe:office:custom-name:evening"] ? { evening: rc["phoebe:office:custom-name:evening"] } : {}),
      },
    } : {}),
  };
}

/** …and the same for the default rhythm, which stores its own shape. */
export function specToDefaultSeed(spec: RoutineSpec, base: DefaultSeed): DefaultSeed {
  const rc = spec.ruleConfig ?? {};
  const slots = slotsOf(spec);
  return {
    morning: rc["phoebe:office:level:morning"] ?? "ask",
    evening: rc["phoebe:office:level:evening"] ?? "ask",
    reflection: (rc["phoebe:office:reflection-source"] as DefaultSeed["reflection"]) ?? base.reflection,
    cards: visibleCards(spec),
    relational: spec.relational ?? base.relational ?? [],
    silenceMin: spec.officePrefs?.contemplationGoalMinutes ?? 0,
    ...(Object.keys(slots).length > 0 ? { slots: slots as DefaultSeed["slots"] } : {}),
    // Bumped on every save: this is what carries the change onto devices still
    // sitting on an untouched default.
    version: (base.version ?? 0) + 1,
  };
}
