import { markPracticeDoneToday, unmarkPracticeDoneToday, PRACTICE_DONE_EVENT } from "@/lib/practiceCompletion";

// Chapel (VTS-feed-gated) isn't a plain Done/Not-today check — the popup
// asks WHICH service, and that choice satisfies the Morning or Evening
// practice card too, not just Chapel's own checkmark (owner: "the Morning
// or Evening Card would move to done"). Rule:
//   Morning Prayer, any day        -> Morning
//   Evening Prayer, any day        -> Evening
//   Holy Eucharist, Mon/Tue/Wed/Fri -> Morning
//   Holy Eucharist, Thursday        -> Evening
// (Chapel itself only shows Mon-Fri — see chapelActive/isVtsPublishingDay —
// so Saturday/Sunday never reach this function.)
export type ChapelService = "morning-prayer" | "holy-eucharist" | "evening-prayer";

function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function chapelSlotFor(service: ChapelService, now: Date = new Date()): "morning" | "evening" {
  if (service === "morning-prayer") return "morning";
  if (service === "evening-prayer") return "evening";
  // Holy Eucharist: Thursday (getDay() === 4) counts as Evening; every other
  // weekday it's offered on (Mon/Tue/Wed/Fri) counts as Morning.
  return now.getDay() === 4 ? "evening" : "morning";
}

const SLOT_KEY_PREFIX = "phoebe:chapel-slot:";

/** Log today's Chapel attendance: marks the Chapel practice itself done, and
 *  stamps which of Morning/Evening it satisfies so useRhythmState can fold
 *  it into that card's done-state too. */
export function logChapel(service: ChapelService): void {
  const slot = chapelSlotFor(service);
  try {
    localStorage.setItem(`${SLOT_KEY_PREFIX}${todayLocalISO()}`, slot);
  } catch { /* private mode / quota — non-fatal */ }
  markPracticeDoneToday("chapel");
  // Also mark the SYNTHETIC slot section — persisted server-side (unlike
  // the localStorage-only stamp above, which only ever reflects TODAY) so
  // the weekly grid's history still shows this day's Morning/Evening dot
  // filled once the day rolls over. Owner: "the morning dot of the grid
  // saved, but then today yesterdays morning dot shows not done."
  markPracticeDoneToday(slot === "morning" ? "chapel-morning" : "chapel-evening");
  // markPracticeDoneToday already dispatches PRACTICE_DONE_EVENT, but the
  // slot stamp above happens right before it via a separate localStorage
  // write — no separate event needed, listeners re-read both on the same tick.
}

/** Undo today's Chapel log entirely — clears both the Chapel checkmark and
 *  whichever Morning/Evening slot it was satisfying (both the live local
 *  flag AND the persisted synthetic section, so an un-log also un-fills
 *  the day in the weekly grid history, not just today's live dot). */
export function unlogChapel(): void {
  const slot = getChapelSlotToday();
  try {
    localStorage.removeItem(`${SLOT_KEY_PREFIX}${todayLocalISO()}`);
  } catch { /* non-fatal */ }
  unmarkPracticeDoneToday("chapel");
  if (slot) unmarkPracticeDoneToday(slot === "morning" ? "chapel-morning" : "chapel-evening");
}

/** Which slot (if any) today's Chapel log is currently satisfying. */
export function getChapelSlotToday(): "morning" | "evening" | null {
  try {
    const v = localStorage.getItem(`${SLOT_KEY_PREFIX}${todayLocalISO()}`);
    return v === "morning" || v === "evening" ? v : null;
  } catch {
    return null;
  }
}

export { PRACTICE_DONE_EVENT as CHAPEL_LOG_EVENT };
