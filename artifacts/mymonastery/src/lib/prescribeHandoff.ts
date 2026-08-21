/**
 * How the AI interview hands a finished routine to the prescribe page.
 *
 * Owner: "if I'm building a prayer routine for someone else — the preset rhythm
 * link in the admin tools — I want to do it through the questionnaire."
 *
 * The interview is its own route, so the spec travels through sessionStorage
 * rather than a prop. One key, defined once, because a handoff whose two halves
 * disagree about the key fails silently: the admin finishes the questionnaire,
 * lands on the naming screen with nothing in it, and has no idea why.
 *
 * sessionStorage, not localStorage: an abandoned handoff should die with the
 * tab, not wait around to surprise someone next week.
 */
export const PRESCRIBE_SPEC_KEY = "phoebe:prescribe-spec";

/** Take the handed-off spec, if there is one. Reading it CONSUMES it, so a
 *  refresh of the naming screen doesn't resurrect a routine already used. */
export function takePrescribedSpec(): unknown | null {
  try {
    const raw = sessionStorage.getItem(PRESCRIBE_SPEC_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PRESCRIBE_SPEC_KEY);
    return JSON.parse(raw);
  } catch { return null; }
}
