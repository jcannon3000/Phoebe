// Per-side contemplation completion for today — which side (Morning / Evening)
// the user has actually sat for. A sit launched from a side's card
// ("/contemplation?begin=1&side=morning") clears THAT side; a sit launched
// generically clears the first still-undone side (order: morning then evening).
// The user's total contemplation minutes still flow through
// /api/me/contemplation-stats; this only drives which per-side card reads as
// "kept" today, so an undone evening sit stays visible even after the morning
// sit met the daily minutes goal.
//
// The localStorage flags here are the instant per-device layer. For SIGNED-IN
// users the resolved side ALSO rides the sit's prayer_sessions POST
// (contemplationSide) and comes back via /api/me/contemplation-sides-today, so
// a sit done on the iPhone shows done on the web too — useRhythmState ORs the
// two layers (same pattern as reflections' local-read + server reflection_reads).

import { getSideContemplationExplicit } from "@/lib/officePrefs";

export type ContemplationSide = "morning" | "evening";

const PREFIX = "phoebe:contemplation-side-done:";
export const CONTEMPLATION_SIDE_DONE_EVENT = "phoebe:contemplation-side-done";

function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function hasContemplationSideDoneToday(side: ContemplationSide): boolean {
  try {
    return localStorage.getItem(`${PREFIX}${side}`) === todayLocalISO();
  } catch {
    return false;
  }
}

// Stamp a side's contemplation done for today + notify listeners. Kept separate
// from the generic practice-done tracker so it never double-counts. Idempotent
// within a day.
export function markContemplationSideDone(side: ContemplationSide): void {
  try {
    localStorage.setItem(`${PREFIX}${side}`, todayLocalISO());
    window.dispatchEvent(new Event(CONTEMPLATION_SIDE_DONE_EVENT));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

// Attribute a just-finished contemplation sit to a side. If `explicitSide` is
// set (the sit was launched from that side's card), it wins. Otherwise the sit
// clears the first side that is active AND not yet done today (morning first),
// falling back to the first active side. `activeSides` says which sides carry a
// contemplation card in the user's rhythm.
export function attributeContemplationSit(opts: {
  explicitSide?: ContemplationSide | null;
  activeSides: { morning: boolean; evening: boolean };
}): void {
  const { explicitSide, activeSides } = opts;
  if (explicitSide === "morning" || explicitSide === "evening") {
    markContemplationSideDone(explicitSide);
    return;
  }
  // Order-based fallback: first still-undone active side.
  const order: ContemplationSide[] = ["morning", "evening"];
  const undone = order.find((s) => activeSides[s] && !hasContemplationSideDoneToday(s));
  const anyActive = order.find((s) => activeSides[s]);
  const target = undone ?? anyActive;
  if (target) markContemplationSideDone(target);
}

// Resolve which side a sit STARTING NOW would be attributed to — the same rule
// attributeContemplationSit applies at completion (explicit ?side= wins, else
// the first still-undone active side). The timer stamps this onto the sit's
// prayer_sessions POST (contemplationSide) so the server can echo per-side
// done-state to the user's OTHER devices.
export function resolveContemplationSideForSit(): ContemplationSide | null {
  try {
    const s = new URLSearchParams(window.location.search).get("side");
    if (s === "morning" || s === "evening") return s;
  } catch { /* ignore */ }
  const mSet = getSideContemplationExplicit("morning");
  const eSet = getSideContemplationExplicit("evening");
  const anyExplicit = mSet !== null || eSet !== null;
  const active: Record<ContemplationSide, boolean> = {
    morning: anyExplicit ? mSet === true : true,
    evening: anyExplicit ? eSet === true : true,
  };
  const order: ContemplationSide[] = ["morning", "evening"];
  return order.find((s) => active[s] && !hasContemplationSideDoneToday(s))
    ?? order.find((s) => active[s])
    ?? null;
}
