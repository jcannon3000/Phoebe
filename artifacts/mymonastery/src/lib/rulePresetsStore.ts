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
    const res = await fetch("/api/routine-presets");
    if (!res.ok) return;
    const data = await res.json() as Omit<Overlay, "fetchedAt">;
    if (!data || !Array.isArray(data.presets)) return;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, fetchedAt: Date.now() }));
  } catch { /* offline, blocked, private mode — the built-ins still apply */ }
}

/** What the admin tool edits, straight from the server (never the cache). */
export async function fetchRoutinePresetOverlay(): Promise<Omit<Overlay, "fetchedAt">> {
  const res = await fetch("/api/routine-presets");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
