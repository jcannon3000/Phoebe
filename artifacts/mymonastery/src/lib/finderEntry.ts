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

/**
 * THE QUESTIONS ARE FOR ADMINS, THROUGH ONE DOOR (owner, 2026-10-01: "not all
 * users" · "admins only" · "only on the admin tool").
 *
 * They were wired in front of every new device's first open and in front of the
 * full customizer. That is switched off here and nowhere else: with this false
 * nothing sends anyone to /find-your-rhythm, and the only way in is the Find
 * your rhythm row in the admin tools. Everything those two entries needed is
 * still in place — set this true and a brand-new device is asked first again.
 */
export const FINDER_FOR_EVERYONE = false;

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

// ── THE FIRST OPEN ─────────────────────────────────────────────────────────
//
// Owner, 2026-10-01: "There was supposed to be now three questions before it
// loads recommendations the first time." A brand-new device used to be handed
// the default routine the instant the home opened — the "recommendations"
// loaded without a word asked. Now the home sends a device with no rhythm to the
// questions first, and what they answer is what gets set up.
//
// DEVICE-LOCAL, under the "phoebe:guest-" prefix so the logout wipe takes it
// with the rest of that family: a phone handed to somebody else is a new
// beginning, and is asked again.
const SKIP_KEY = "phoebe:guest-first-run-skip";

/**
 * Is this a device that has never been given a rhythm — and not been told to
 * skip the questions? True ONLY when every sign of an existing rhythm is
 * absent: the seed's stamp, a saved home layout, a chosen side. An existing
 * device, an account's synced rhythm and a restored session all carry at least
 * one of those, so none of them is ever sent to the questions. And if storage
 * cannot be read at all the answer is "no", never "yes": a person we cannot
 * check is not trapped in a screen they cannot leave.
 */
export function firstRunPending(): boolean {
  if (!FINDER_FOR_EVERYONE) return false;
  try {
    if (localStorage.getItem(SKIP_KEY) === "1") return false;
    if (localStorage.getItem("phoebe:guest-seeded-ymd")) return false;
    if (localStorage.getItem("phoebe:home-layout")) return false;
    if (localStorage.getItem("phoebe:office:level:morning")) return false;
    if (localStorage.getItem("phoebe:office:level:evening")) return false;
    return true;
  } catch {
    return false;
  }
}

/** "Skip": the questions are not for me — give me the standard routine. */
export function skipFirstRun(): void {
  try { localStorage.setItem(SKIP_KEY, "1"); } catch { /* the seed is the fallback either way */ }
}
