/**
 * passageCache — the scripture readers, saved for offline.
 *
 * Every reading in the app hands off to bible.oremus.org: the office lessons,
 * the Daily Scripture Reading and Sunday decks, Lectio Divina, Visio Divina's
 * reading. Offline, that hand-off was a blank page (owner: "right now the
 * readers are just black"). The server now serves the passage TEXT through
 * the extracted text it once kept.
 * reader can open it from the device.
 *
 * Passages are keyed by their oremus `passage=` query, which is how every
 * caller already names them (bibleUrl on the server, readingUrl on the
 * client), so an office slide's readUrl and Lectio's readUrl for the same
 * lesson share one entry.
 */
import { PASSAGES, storeGet, storePut, storePrune, storeKeys, storeDelete } from "@/lib/offlineStore";
import { boundedFetch } from "@/lib/boundedFetch";
import { isOnline } from "@/lib/offline";

/**
 * THE PARSER THAT WROTE THE ENTRY.
 *
 * v1 saved oremus's section headings glued to the verse with the tail of an
 * HTML comment — "13 -->Salt and Light13 'You are the salt of the earth"
 * (fixed server-side 2026-09-06). A device that saved a day of readings under
 * v1 would have read that for the six weeks until they aged out. Bumping this
 * makes every v1 entry look UNSAVED to the daily walk, so it is re-fetched and
 * overwritten — while `getCachedPassage` still returns it in the meantime:
 * slightly mangled text offline beats a blank reader offline.
 */
// v3 (2026-09-06): oremus hides footnote text inside an anchor's handler
// attributes, and the tag-strip ended at the first ">" inside them — the owner
// read `him');" onmouseout="return nd();"` in the middle of Job 25 on his
// phone. Entries saved before v3 carry that, so they are re-fetched.
const PASSAGE_PARSER_VERSION = 3;

const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;

/** The passage a reader URL names, or null when it isn't an oremus link. */
export function passageRefFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)oremus\.org$/i.test(u.hostname)) return null;
    const p = u.searchParams.get("passage");
    return p ? p.trim() : null;
  } catch { return null; }
}

export function passageKey(ref: string): string {
  return ref.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Is a CURRENT copy here? An entry from an older parser answers false, so
 *  the next walk replaces it. */
/** Fetch one passage from the server and keep it. Best-effort. */
/**
 * DELETE THE EXTRACTED TEXT. Owner, 2026-09-06: "you should not be extracting
 * text, that's a copyright issue." Every device that ran today's builds holds
 * paragraphs of the NRSV; this empties that store on the next walk. The page
 * itself is what we keep now (lib/pageCache).
 */
export async function purgeExtractedPassages(): Promise<void> {
  for (const key of await storeKeys(PASSAGES)) await storeDelete(PASSAGES, key);
}

export function prunePassages(): Promise<void> {
  return storePrune(PASSAGES, MAX_AGE_MS);
}
