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
import { PASSAGES, storeGet, storePut, storeHas, storePrune } from "@/lib/offlineStore";
import { boundedFetch } from "@/lib/boundedFetch";
import { isOnline } from "@/lib/offline";

export type CachedPassage = {
  ref: string;
  /** Verse-numbered paragraphs, plain text; one string per paragraph. */
  paragraphs: string[];
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

export async function hasCachedPassage(ref: string): Promise<boolean> {
  return storeHas(PASSAGES, passageKey(ref));
}

/** Fetch one passage from the server and keep it. Best-effort. */
export async function cachePassage(ref: string): Promise<boolean> {
  const key = passageKey(ref);
  if (await storeHas(PASSAGES, key)) return true;
  try {
    const res = await boundedFetch(`/api/scripture/passage-text?ref=${encodeURIComponent(ref)}`);
    if (!res.ok) return false;
    const data = (await res.json()) as { ref?: string; paragraphs?: unknown; version?: string; credit?: string } | null;
    if (!data || !Array.isArray(data.paragraphs) || data.paragraphs.length === 0) return false;
    const entry: CachedPassage = {
      ref: data.ref || ref,
      paragraphs: data.paragraphs.filter((p): p is string => typeof p === "string" && p.length > 0),
      version: data.version || "NRSV",
      ...(typeof data.credit === "string" && data.credit ? { credit: data.credit } : {}),
      fetchedAt: Date.now(),
    };
    await storePut(PASSAGES, key, entry);
    return true;
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
