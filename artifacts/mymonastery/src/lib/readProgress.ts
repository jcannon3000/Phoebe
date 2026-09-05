/**
 * HOW FAR someone has read a long piece in the reader — per URL, 0..1.
 *
 * Owner (2026-09-04): "any material more than 300 words in a scroll, let's
 * track where they are, and don't have it finish and count until they have
 * scrolled through all the text … if they don't finish and are partway
 * through, have the card still in Next with a progress bar like the
 * Contemplation card that shows how far and says Continue."
 *
 * The native reader measures the scroll (BibleWebViewController) and reports
 * it when it closes (phoebe:browserfinished's detail); openExternalThenMarkRead
 * stores a partial read here instead of marking the piece read. Cards read
 * it for their bar and their "Continue". Cleared when the piece is finished.
 */
const KEY = "phoebe:read-progress";
const KEEP = 60;
export const READ_PROGRESS_EVENT = "phoebe:read-progress";
/** Pieces at or under this many words count as read on close, as before. */
export const LONG_READ_WORDS = 300;

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch { return {}; }
}
function save(map: Record<string, number>): void {
  try {
    const entries = Object.entries(map).slice(-KEEP);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(READ_PROGRESS_EVENT)); } catch { /* ignore */ }
}

/** 0..1 for a URL, or null when nothing partial is recorded. */
export function getReadProgress(url: string): number | null {
  if (!url) return null;
  const v = load()[url];
  return typeof v === "number" && v > 0 && v < 1 ? v : null;
}
export function setReadProgress(url: string, fraction: number): void {
  if (!url) return;
  const map = load();
  const f = Math.max(0, Math.min(1, fraction));
  if (f >= 0.97) delete map[url]; else map[url] = f;
  save(map);
}
export function clearReadProgress(url: string): void {
  if (!url) return;
  const map = load();
  if (url in map) { delete map[url]; save(map); }
}

/** What the reader reports when it closes (see BibleBrowserPlugin). */
export type ReaderOutcome = { url?: string; words?: number; progress?: number; readToEnd?: boolean };
export function parseReaderOutcome(detail: unknown): ReaderOutcome | null {
  if (!detail) return null;
  try {
    const d = typeof detail === "string" ? JSON.parse(detail) : detail;
    return d && typeof d === "object" ? (d as ReaderOutcome) : null;
  } catch { return null; }
}
