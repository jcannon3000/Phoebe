/**
 * HOW SHAPE YOUR RHYTHM OPENS ON THE THREE QUESTIONS — AND HOW A PERSON OPTS OUT.
 *
 * Owner, 2026-10-01: "Lets have it start with three questions". The full
 * customizer used to open on its preset picker for anyone with no rhythm yet;
 * it now sends them to /find-your-rhythm first. The finder's own "I'll adjust it
 * myself" has to get them past that door and into the customizer WITHOUT being
 * sent straight back, so it leaves a note here that the flow reads once.
 *
 * sessionStorage, not localStorage: the note means "this visit", and a stale one
 * surviving into tomorrow would skip the questions for good.
 */
const KEY = "phoebe:finder-skip";

/** "I'll adjust it myself": the next time the flow opens, don't redirect. */
export function markFinderSkip(): void {
  try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode — they just see the questions again */ }
}

/**
 * Did they ask to skip the questions this visit? Reading it changes nothing —
 * the flow may render more than once — so the note is cleared the other way
 * round, by the finder itself the next time it opens (clearFinderSkip).
 */
export function finderSkipped(): boolean {
  try { return sessionStorage.getItem(KEY) === "1"; } catch {
    // If storage is unavailable we cannot tell, and sending them back to the
    // questions in a loop is worse than skipping them.
    return true;
  }
}

/** The finder is open: the opt-out, if any, has done its job. */
export function clearFinderSkip(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
