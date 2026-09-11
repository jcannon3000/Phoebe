/**
 * Pages already fetched this morning, held in memory for the tap.
 *
 * Owner: "have the app fetch any reflection/newsletter in the background in
 * the morning and cache it so when the user opens it it can load in a second —
 * CAC and VTS can take 5 seconds to load sometimes." The saving half lives in
 * lib/officePrefetch (it writes them through pageCache); this is the half that
 * gets a saved copy INTO the tap.
 *
 * WHY A SYNCHRONOUS MAP AND NOT A LOOKUP AT TAP TIME. Reading the store is
 * async, and on web the browser only allows a new tab from inside the tap's
 * own tick — an await first and the open is a popup the browser blocks. The
 * deck hit this exact wall with its readings and solved it the same way: warm
 * ahead, read synchronously when the finger lands.
 *
 * Missing is always fine. No warmed copy means the reader fetches live, which
 * is precisely today's behaviour — this can make an open faster and can never
 * make one fail.
 */
import { getSavedPageToday } from "@/lib/pageCache";

const warmed = new Map<string, string>();

/** The saved HTML for this URL, if this morning's walk got it. Synchronous. */
export function warmedHtml(url: string | null | undefined): string | undefined {
  return url ? warmed.get(url) : undefined;
}

/**
 * Read today's saved copies into memory. Safe to call repeatedly — it only
 * reads, and a URL with nothing saved simply stays absent.
 */
export async function warmPages(urls: Array<string | null | undefined>): Promise<void> {
  for (const url of urls) {
    if (!url || warmed.has(url)) continue;
    try {
      const page = await getSavedPageToday(url);
      if (page?.html) warmed.set(url, page.html);
    } catch { /* best effort — the reader can always fetch live */ }
  }
}

/** Forget everything — the day rolled over, so this morning's copies are
 *  yesterday's. Called from the same place the prefetch re-runs. */
export function clearWarmedPages(): void { warmed.clear(); }
