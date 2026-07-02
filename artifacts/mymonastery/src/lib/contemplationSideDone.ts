// Per-side contemplation completion for today — which side (Morning / Evening)
// the user has actually sat for. Client-only + per-device: attribution is
// inherently local. A sit launched from a side's card ("/contemplation?begin=1
// &side=morning") clears THAT side; a sit launched generically clears the first
// still-undone side (order: morning then evening). The user's total contemplation
// minutes still flow through /api/me/contemplation-stats; this only drives which
// per-side card reads as "kept" today, so an undone evening sit stays visible
// even after the morning sit met the daily minutes goal.

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
