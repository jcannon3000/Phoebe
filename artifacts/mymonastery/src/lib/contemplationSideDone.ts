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
import { markRecentCompletion } from "@/lib/recentCompletion";
import { clearOfficeReminderNotifications } from "@/lib/officeReminders";
import { EVENING_OPEN_HOUR } from "@/lib/customAnchors";

export type ContemplationSide = "morning" | "evening";
// WHICH contemplative practice was kept. A side's card is styled/labelled by
// the user's `contemplationStyle` — "Creation Prayer" (the Co-Breathe breath)
// when "cobreathe", "Contemplation" (the silent sit) when "silent" — and the
// two are DIFFERENT practices, so keeping one must not tick the other's card.
// (The user's report: "I did a contemplation sit, not Creation Prayer, and it
// counted it as Creation Prayer.") `null` = a legacy flag written before this
// was recorded; it satisfies either style so nobody's existing day regresses.
export type ContemplationKind = "silent" | "cobreathe";

const PREFIX = "phoebe:contemplation-side-done:";
export const CONTEMPLATION_SIDE_DONE_EVENT = "phoebe:contemplation-side-done";

function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Stored value is "<YYYY-MM-DD>|<kind>"; a bare "<YYYY-MM-DD>" is the legacy
// (pre-kind) form and reads back with kind = null.
function readSideFlag(side: ContemplationSide): { date: string; kind: ContemplationKind | null } | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${side}`);
    if (!raw) return null;
    const [date, kind] = raw.split("|");
    if (!date) return null;
    return { date, kind: kind === "silent" || kind === "cobreathe" ? kind : null };
  } catch {
    return null;
  }
}

// Did the user keep this side's contemplation today? When `expectedKind` is
// passed, a flag stamped with the OTHER practice does NOT count — a silent sit
// leaves a Creation Prayer card open, and vice versa. Legacy (kind-less) flags
// still count for either, so today's already-kept sides don't flip back.
export function hasContemplationSideDoneToday(
  side: ContemplationSide,
  expectedKind?: ContemplationKind,
): boolean {
  const flag = readSideFlag(side);
  if (!flag || flag.date !== todayLocalISO()) return false;
  if (!expectedKind || flag.kind === null) return true;
  return flag.kind === expectedKind;
}

// Stamp a side's contemplation done for today + notify listeners. Kept separate
// from the generic practice-done tracker so it never double-counts. Idempotent
// within a day.
export function markContemplationSideDone(side: ContemplationSide, kind?: ContemplationKind): void {
  try {
    // Only on a FRESH keep — sitting again after this side is already done
    // shouldn't replay the home's completion moment.
    const wasAlreadyDone = hasContemplationSideDoneToday(side, kind);
    localStorage.setItem(`${PREFIX}${side}`, kind ? `${todayLocalISO()}|${kind}` : todayLocalISO());
    window.dispatchEvent(new Event(CONTEMPLATION_SIDE_DONE_EVENT));
    if (!wasAlreadyDone) markRecentCompletion(`contemplation-${side}`);
    // Owner: completing a side's chosen prayer should clear that side's
    // reminder from the notification center — see cacReadState.ts's
    // clearReminderIfAnchor for the sibling side-anchor practices.
    clearOfficeReminderNotifications();
  } catch {
    /* private mode / quota — non-fatal */
  }
}

// The local hour the EVENING side's window opens — the same 5 PM boundary
// `SLOT_OPEN_HOUR.evening` uses for custom practices and the evening office's
// gate, and the hour the Home card stops rendering evening as a quiet "later".
// Re-exported from customAnchors so the per-side contemplation gate and the
// slot windows can't disagree about when evening starts (owner moved it to 4pm).
const EVENING_OPENS_HOUR = EVENING_OPEN_HOUR;

// Which side an un-attributed sit should try FIRST, by the clock. Sitting in
// the evening credits the evening; sitting before 5 PM credits the morning.
// Previously this was hardcoded morning-first at every hour, so an evening sit
// with an un-kept morning silently landed on the MORNING card — the user's
// report: "I did a 20 minute contemplation and it counted as my morning
// Creation Prayer." The other side is still the fallback, so a lone active
// side (or an already-kept preferred side) still receives the sit.
/**
 * The KIND of contemplation the rhythm is configured for.
 *
 * `phoebe:contemplation-style` is a single global value, so every side that
 * carries a contemplation carries THAT practice: silence, or the Creation
 * Prayer breath. Nothing per-side to read.
 */
function configuredKind(): ContemplationKind {
  try { return localStorage.getItem("phoebe:contemplation-style") === "cobreathe" ? "cobreathe" : "silent"; }
  catch { return "silent"; }
}

/**
 * Does an automatic attribution of `kind` belong to a side at all?
 *
 * Reported: with Creation Prayer as the evening anchor, finishing a SILENT sit
 * played the completion animation on the Creation Prayer card. The standalone
 * contemplation-goal card opens /contemplation with no ?side=, so the sit fell
 * into the order-based fallback below and claimed the evening side — whose
 * practice is the breath. The day-flag's kind kept the CARD from reading as
 * done, but markContemplationSideDone had already stamped
 * markRecentCompletion("contemplation-<side>"), and that key belongs to the
 * side's card whichever practice it renders as. So the wrong practice
 * celebrated.
 *
 * A sit only auto-claims a side when the side's own practice IS that sit. A
 * silent sit under a breath rhythm (the VTS shape: Creation Prayer in the
 * evening plus a daily silence goal) belongs to the standalone goal card, and
 * to no side at all.
 *
 * An EXPLICIT ?side= still wins — that's a deliberate launch from that side's
 * own card, and the card only offers the practice it actually is.
 */
function kindMatchesRhythm(kind: ContemplationKind): boolean {
  return kind === configuredKind();
}

function sideOrderByClock(now: Date = new Date()): ContemplationSide[] {
  return now.getHours() >= EVENING_OPENS_HOUR
    ? ["evening", "morning"]
    : ["morning", "evening"];
}

// Attribute a just-finished contemplation sit to a side. If `explicitSide` is
// set (the sit was launched from that side's card), it wins. Otherwise the sit
// clears the first side that is active AND not yet done today, preferring the
// side whose window the clock is currently in (see sideOrderByClock), and
// falling back to the first active side. `activeSides` says which sides carry a
// contemplation card in the user's rhythm.
export function attributeContemplationSit(opts: {
  explicitSide?: ContemplationSide | null;
  activeSides: { morning: boolean; evening: boolean };
  // Which practice was actually kept — the silent sit (/contemplation) or the
  // Creation Prayer breath (/cobreathe). Stamped onto the day-flag so the card
  // for the OTHER practice stays open.
  kind: ContemplationKind;
}): void {
  const { explicitSide, activeSides, kind } = opts;
  if (explicitSide === "morning" || explicitSide === "evening") {
    markContemplationSideDone(explicitSide, kind);
    return;
  }
  // Order-based fallback: first still-undone active side, clock-aware — but
  // only when this sit IS the practice those sides carry (see
  // kindMatchesRhythm). Otherwise it belongs to no side.
  if (!kindMatchesRhythm(kind)) return;
  const order = sideOrderByClock();
  const undone = order.find((s) => activeSides[s] && !hasContemplationSideDoneToday(s, kind));
  const anyActive = order.find((s) => activeSides[s]);
  const target = undone ?? anyActive;
  if (target) markContemplationSideDone(target, kind);
}

// Resolve which side a sit STARTING NOW would be attributed to — the same rule
// attributeContemplationSit applies at completion (explicit ?side= wins, else
// the first still-undone active side). The timer stamps this onto the sit's
// prayer_sessions POST (contemplationSide) so the server can echo per-side
// done-state to the user's OTHER devices.
export function resolveContemplationSideForSit(kind: ContemplationKind = "silent"): ContemplationSide | null {
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
  // Same rule as attributeContemplationSit: a sit that isn't the practice
  // these sides carry resolves to NO side, so the timer doesn't stamp a
  // contemplationSide the completion path would then decline to honour.
  if (!kindMatchesRhythm(kind)) return null;
  const order = sideOrderByClock();
  return order.find((s) => active[s] && !hasContemplationSideDoneToday(s, kind))
    ?? order.find((s) => active[s])
    ?? null;
}
