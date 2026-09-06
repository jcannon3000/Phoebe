/**
 * passageCache — the scripture readers, saved for offline.
 *
 * Every reading in the app hands off to bible.oremus.org: the office lessons,
 * the Daily Scripture Reading and Sunday decks, Lectio Divina, Visio Divina's
 * reading. Offline, that hand-off was a blank page (owner: "right now the
 * readers are just black"). The server now serves the passage TEXT through
 * /api/scripture/passage-text, and this keeps a copy keyed by the reference so a
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

export type CachedPassage = {
  ref: string;
  /** Which parser wrote this — see PASSAGE_PARSER_VERSION. */
  pv?: number;
  /** Verse-numbered paragraphs, plain text; one string per paragraph. */
  paragraphs: string[];
  /** Which of them oremus set as section headings — from the parser, which
   *  saw the <h2>, rather than guessed at this end. */
  headingIndexes?: number[];
  version: string;
  /** oremus's own copyright line, saved with the reading. */
  credit?: string;
  fetchedAt: number;
};

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

export async function getCachedPassage(ref: string): Promise<CachedPassage | null> {
  return storeGet<CachedPassage>(PASSAGES, passageKey(ref));
}

export async function getCachedPassageForUrl(url: string | null | undefined): Promise<CachedPassage | null> {
  const ref = passageRefFromUrl(url);
  return ref ? getCachedPassage(ref) : null;
}

/** Is a CURRENT copy here? An entry from an older parser answers false, so
 *  the next walk replaces it. */
export async function hasCachedPassage(ref: string): Promise<boolean> {
  const entry = await storeGet<CachedPassage>(PASSAGES, passageKey(ref));
  return !!entry && (entry.pv ?? 1) >= PASSAGE_PARSER_VERSION;
}

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

/** @deprecated Superseded by lib/pageCache — kept only until the native
 *  saved-page reader is wired everywhere. Nothing should call it. */
export async function cachePassage(ref: string): Promise<boolean> {
  const key = passageKey(ref);
  if (await hasCachedPassage(ref)) return true;
  try {
    const res = await boundedFetch(`/api/scripture/passage-text?ref=${encodeURIComponent(ref)}`);
    if (!res.ok) return false;
    const data = (await res.json()) as { ref?: string; paragraphs?: unknown; headingIndexes?: unknown; version?: string; credit?: string } | null;
    if (!data || !Array.isArray(data.paragraphs) || data.paragraphs.length === 0) return false;
    const entry: CachedPassage = {
      ref: data.ref || ref,
      paragraphs: data.paragraphs.filter((p): p is string => typeof p === "string" && p.length > 0),
      version: data.version || "NRSV",
      ...(Array.isArray(data.headingIndexes) ? { headingIndexes: data.headingIndexes.filter((n): n is number => typeof n === "number") } : {}),
      pv: PASSAGE_PARSER_VERSION,
      ...(typeof data.credit === "string" && data.credit ? { credit: data.credit } : {}),
      fetchedAt: Date.now(),
    };
    return storePut(PASSAGES, key, entry);
  } catch { return false; }
}

export const OFFLINE_PASSAGE_EVENT = "phoebe:open-offline-passage";
export type OfflinePassageDetail = { passage: CachedPassage; title: string; slideLabel?: string };

/**
 * THE ONE DOOR. A deck about to open a reading calls this first: offline and
 * saved → the sheet opens over the deck (OfflinePassageHost) and this returns
 * true, so the caller does nothing more; otherwise false, and the caller
 * hands off to the browser as it always did.
 */
export async function openOfflinePassageIfCached(
  url: string | null | undefined,
  title: string,
  /** "18 of 38 · Lesson" — the deck's own counter, so the sheet's pill reads
   *  exactly as the deck's does. */
  slideLabel?: string,
): Promise<boolean> {
  if (isOnline()) return false;
  const passage = await getCachedPassageForUrl(url);
  if (!passage) return false;
  window.dispatchEvent(new CustomEvent<OfflinePassageDetail>(OFFLINE_PASSAGE_EVENT, { detail: { passage, title, slideLabel } }));
  return true;
}

export function prunePassages(): Promise<void> {
  return storePrune(PASSAGES, MAX_AGE_MS);
}
