/**
 * THE USER'S OWN ORDER for their routine (owner: practices are standalone
 * things "and then you as the user order them" — no more morning/evening
 * slots for the sake of the routine).
 *
 * Stored as the customizer's edit-row ids ("side:morning", "slot:visio",
 * "custom:<id>", …) because that list is the one surface where the whole
 * routine is visible as rows — the home then maps ids to its card keys and
 * sorts. Ids the map doesn't know (a practice added after this shipped, a
 * server row shape change) simply keep their build order, so an unknown id
 * can never hide a card.
 *
 * In ROUTINE_KEYS: synced LWW across devices, cleared on logout, snapshotted
 * by prescribe — an ORDER is part of the rule.
 */
import { OFFICE_PREFS_EVENT } from "@/lib/officePrefs";
import { pushRoutineConfig } from "@/lib/routineSync";

export const ROUTINE_ORDER_KEY = "phoebe:routine-order";

export function getRoutineOrder(): string[] {
  try {
    const raw = localStorage.getItem(ROUTINE_ORDER_KEY);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 120).slice(0, 64) : [];
  } catch { return []; }
}

export function setRoutineOrder(ids: string[]): void {
  try {
    localStorage.setItem(ROUTINE_ORDER_KEY, JSON.stringify(ids.slice(0, 64)));
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* private mode */ }
  pushRoutineConfig();
}

/** Edit-row id → the home card key(s) it stands for. */
export function rowIdToCardKeys(id: string): string[] {
  if (id === "side:morning") return ["morning"];
  if (id === "side:evening") return ["evening"];
  if (id === "extra:morning") return ["extra-morning"];
  if (id === "extra:evening") return ["extra-evening"];
  // The day's silence goal renders as the "silence" card (audited against the
  // real keys in DailyProgressBody — guessing them cost the first live check).
  if (id === "contemplation") return ["silence", "contemplation"];
  if (id === "contemplation:morning") return ["contemplation-morning"];
  if (id === "contemplation:evening") return ["contemplation-evening"];
  if (id.startsWith("slot:")) {
    const k = id.slice(5);
    // Two vocabulary seams: Audio Divina's card key is "listening", and the
    // prayer list's card is "prayer-list-card".
    if (k === "audio") return ["listening"];
    if (k === "prayer-list") return ["prayer-list-card", "prayer-list"];
    return [k];
  }
  // Reflection cards render as reflect-<source>; keep the bare source too for
  // any surface keyed the module way.
  if (id === "card:reflection") return ["reflect-cac", "reflect-fdd", "reflect-ssje", "reflect-vts", "cac", "fdd", "ssje", "vts"];
  if (id.startsWith("card:")) { const k = id.slice(5); return [`reflect-${k}`, k]; }
  if (id.startsWith("custom:")) return [`custom-${id.slice(7)}`];
  return [];
}

/**
 * Stable-sort the home's cards by the user's order. Cards whose key isn't
 * covered by the saved order keep their existing relative order, after the
 * ordered ones — new practices appear at the end until the user places them.
 */
export function sortCardsByUserOrder<T extends { key: string }>(cards: T[]): T[] {
  const order = getRoutineOrder();
  if (order.length === 0) return cards;
  const rank = new Map<string, number>();
  order.forEach((id, i) => { for (const k of rowIdToCardKeys(id)) if (!rank.has(k)) rank.set(k, i); });
  if (rank.size === 0) return cards;
  return cards
    .map((c, i) => ({ c, i, r: rank.has(c.key) ? rank.get(c.key)! : Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((x) => x.c);
}
