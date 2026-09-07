/**
 * pageCache — the reading's own PAGE, kept the way a browser keeps one.
 *
 * Owner (2026-09-06): "you should not be extracting text, that's a copyright
 * issue … you should have the page downloaded just like how Safari mobile has
 * a read later, then overlay the reader over the saved page, and get the same
 * result."
 *
 * So nothing here parses scripture. The page is fetched as the publisher sent
 * it (through /api/reader/page, which proxies the hosts Phoebe's reader
 * already opens) and stored whole; the native reader loads that saved HTML
 * with the original URL as its base and runs the same readerJS over it, which
 * is why the offline reading looks like the online one — it IS the online one.
 */
import { PAGES, storeGet, storePut, storeKeys, storeDelete, storePrune } from "@/lib/offlineStore";
import { boundedFetch } from "@/lib/boundedFetch";

export type SavedPage = {
  /** The page's own URL — the base the reader loads it against. */
  url: string;
  html: string;
  savedAt: number;
  /** Which saver wrote it — see SAVE_VERSION. */
  sv?: number;
};

/**
 * THE SAVER THAT WROTE THE PAGE.
 *
 * v1 saved the HTML alone, so offline Standard showed unstyled markup —
 * oremus keeps its whole appearance in linked stylesheets. v2 inlines them
 * (3e42d8d9). A phone holding v1 pages would look "saved" and read wrong, so
 * an older page answers FALSE to "is this saved?" and the daily walk fetches
 * it again — while getSavedPage still returns it in the meantime, because a
 * plain-looking page beats no reading at all.
 */
const SAVE_VERSION = 2;

const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;

/** The exact shape the native reader asks for. Null when nothing is saved. */
export async function getSavedPage(url: string | null | undefined): Promise<SavedPage | null> {
  if (!url) return null;
  const page = await storeGet<SavedPage>(PAGES, url);
  return page && typeof page.html === "string" && page.html.length > 0 ? page : null;
}

/** Is a CURRENT page here? One from an older saver answers false, so the walk
 *  replaces it. */
export async function hasSavedPage(url: string): Promise<boolean> {
  const page = await getSavedPage(url);
  return !!page && (page.sv ?? 1) >= SAVE_VERSION;
}

/** Fetch and keep one page. Best-effort; false when it could not be saved. */
export async function cachePage(url: string): Promise<boolean> {
  if (!url) return false;
  if (await hasSavedPage(url)) return true;
  try {
    // Bounded like every other fetch in the walk: a page is bigger than a
    // day-list and the proxy may be fetching four stylesheets behind it, so it
    // gets 20s rather than the default 8 — but never forever. On device the
    // CapacitorHttp bridge ignores an abort signal, which is why this is a
    // raced timer rather than an AbortController.
    const res = await boundedFetch(`/api/reader/page?url=${encodeURIComponent(url)}`, undefined, 20_000);
    if (!res.ok) return false;
    const data = (await res.json()) as { url?: string; html?: string; partial?: boolean } | null;
    if (!data || typeof data.html !== "string" || data.html.length === 0) return false;
    /**
     * A PAGE MISSING ITS STYLESHEETS IS NOT SAVED. The proxy says so when an
     * asset timed out mid-inline; storing it would leave this reading
     * permanently half-styled on the device, which is exactly what "Standard"
     * must never show. Not saved means the walk tries again on its next pass.
     */
    if (data.partial) return false;
    return storePut<SavedPage>(PAGES, url, { url: data.url || url, html: data.html, savedAt: Date.now(), sv: SAVE_VERSION });
  } catch { return false; }
}

/** Keep only the pages the coming weeks need. */
export async function prunePagesExcept(keep: Set<string>): Promise<void> {
  for (const key of await storeKeys(PAGES)) {
    if (!keep.has(key)) await storeDelete(PAGES, key);
  }
}

export function prunePages(): Promise<void> {
  return storePrune(PAGES, MAX_AGE_MS);
}
