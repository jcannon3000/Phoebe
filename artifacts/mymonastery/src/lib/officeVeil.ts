/**
 * THE VERSICLE AN OFFICE OPENS ON — one copy, for two screens that must agree.
 *
 * The office shows it on its "held breath" veil: the leaf photo, this line, a
 * spinner. The loading screen a lazy route shows while the office's code arrives
 * (components/RouteFallback) has to show the SAME thing, or tapping "Begin prayer"
 * runs through two screens that look nothing alike before the third appears.
 * Owner, 2026-10-02, from a screen recording of an evening office: "it should go
 * straight to the leaf splash with the quote" — "they shouldnt see the dark path".
 */
export type OfficeVeilOpening = { text: string; cite: string };

/** The opening for a liturgy mode, as the office's own veil has always chosen it. */
export function officeVeilOpening(mode: string | null | undefined): OfficeVeilOpening {
  if (mode === "evening" || mode === "early-evening-devotion" || mode === "creation-evening") {
    return { text: "Let my prayer rise before you as incense, the lifting up of my hands as the evening sacrifice.", cite: "Psalm 141:2" };
  }
  if (mode === "compline") return { text: "The Lord grant us a quiet night and a peaceful end.", cite: "Compline" };
  if (mode === "noonday") return { text: "O God, make speed to save us. O Lord, make haste to help us.", cite: "Psalm 70:1" };
  return { text: "O Lord, open my lips, and my mouth shall proclaim your praise.", cite: "Psalm 51:15" };
}

/** The modes /bcp/daily-office opens straight into a deck for — the ones that have a veil. */
const DECK_MODES = new Set([
  "morning", "evening", "compline", "noonday", "scripture", "sunday",
  "morning-devotion", "early-evening-devotion", "creation-morning", "creation-evening",
]);

/**
 * The mode in the address bar, if this address is one the office opens a deck for —
 * read from the URL, not from page state, so a loading screen can know before the
 * page has run a line of its own code.
 */
export function officeModeFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.location.pathname.startsWith("/bcp/daily-office")) return null;
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode && DECK_MODES.has(mode) ? mode : null;
}
