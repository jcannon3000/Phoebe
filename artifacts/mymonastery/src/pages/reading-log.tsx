import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * /reading-log — RETIRED, and deliberately a redirect rather than a deletion.
 *
 * Reading became a book you track (title, author, pages, and the page you read
 * to — see lib/readingBook.ts), logged from a popup on the home card. This page
 * was the old generic "what did you read today?" form, and nothing links to it
 * any more.
 *
 * IT COULD NOT BE LEFT AS IT WAS. SimpleLogPage calls
 * markPracticeDoneToday("reading"), so anyone reaching this URL — a bookmark, a
 * back-history entry, an old push — would flip the card to DONE without ever
 * recording a page. The bar and the "Page 32 of 235" line would then sit stale
 * under a completed card, which is worse than either state on its own: two
 * writers for one key, disagreeing.
 *
 * A redirect rather than removing the route, so an existing link lands
 * somewhere real instead of a blank screen. The home card is the way in now.
 */
export default function ReadingLogPage() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/dashboard"); }, [setLocation]);
  return null;
}
