/**
 * WHERE A STANDING PROMPT MUST NOT APPEAR — one list, for every banner.
 *
 * These are the full-screen practice decks. Each one puts its own controls at
 * the bottom of the screen, so anything fixed down there lands on the Back /
 * Next pill or a Continue button — sometimes crowding it, sometimes hiding it
 * outright, at which point the deck cannot be advanced at all.
 *
 * It exists because the two components that need this each kept their own
 * copy, and they drifted: BottomPromptStack's was an exact-match Set that
 * never included /bcp/daily-office — the most-used deck in the app — while
 * NotificationReminderBanner's was a prefix list that did. The banner was
 * quiet there and the App Store card, which renders ONLY on iOS web, sat
 * squarely on the office's Back/Next. It could not have been found on the
 * native app or on Android, because that card shows on neither.
 *
 * PREFIX matching, deliberately: modes ride the query string
 * (?mode=compline) and some decks are parameterised
 * (/morning-prayer/:momentId/:token), so an exact match silently misses them.
 */
export const IMMERSIVE_PRACTICE_PREFIXES: readonly string[] = [
  "/bcp/daily-office", "/bcp/daily-devotions", "/pray",
  "/prayer-mode", "/begin-prayer", "/guided-prayer", "/examen",
  "/psalms", "/contemplation", "/cobreathe", "/pray-breath",
  "/lectio", "/visio", "/listening", "/icon-prayer", "/spirituals",
  "/creation-devotion", "/vts-reading", "/morning-prayer",
  // Designing your rule is also a sitting you shouldn't be interrupted during;
  // its Continue hovers at the bottom of the screen.
  "/rule-of-life", "/customize",
];

/** Is this a full-screen practice deck, whatever mode or params it carries? */
export function isImmersivePracticeRoute(location: string): boolean {
  const path = location.split("?")[0] ?? location;
  return IMMERSIVE_PRACTICE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
