/**
 * The book someone is reading — title, author, length, and where they are in it.
 *
 * Owner: "create a daily habit of reading a book and integrate that into their
 * Phoebe experience … ask the title of the book, the author of the book, how
 * many pages the book is … they would log it, and they would put in what page
 * they are on now … like the contemplation card, which has a progress bar …
 * page thirty two of two hundred and thirty five."
 *
 * DEVICE-LOCAL, like iconHistory / visioHistory / spiritualsHistory and for the
 * same reason: this is a record of reading, not an account object, and the
 * practice is guest-allowed. Read defensively — every getter survives private
 * mode, cleared storage and a half-written value.
 *
 * ONE BOOK AT A TIME, deliberately. The practice is "the book I am reading",
 * not a shelf. Starting a new one replaces the current one and keeps the
 * finished one in `past`, so the card never has to ask which book you mean.
 *
 * WHAT IS STORED IS AN ABSOLUTE PAGE, not a daily amount. That matters: the
 * existing custom-anchor reading ritual (see ReadingConfig in
 * DailyProgressBody) logs "3 chapters today" and sums them. This logs "I am on
 * page 32", which is what a progress bar through a book needs and what the
 * owner asked to be prompted for. Summing daily amounts would drift the moment
 * someone skipped a day or re-read a chapter.
 */

const KEY = "phoebe:reading-book";
const PAST_CAP = 10;

export type ReadingBook = {
  title: string;
  author: string;
  /** Total pages. Always >= 1 — the setup form refuses anything else. */
  totalPages: number;
  /** The page they have read TO. 0 before the first log. */
  currentPage: number;
  /** Local ISO day (en-CA) the book was started. */
  startedYmd: string;
  /** Local ISO day of the most recent page log, or null before the first. */
  lastLoggedYmd: string | null;
};

type Store = { current: ReadingBook | null; past: ReadingBook[] };

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { current: null, past: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { current: null, past: [] };
    const s = parsed as Partial<Store>;
    return {
      current: isBook(s.current) ? s.current : null,
      past: Array.isArray(s.past) ? s.past.filter(isBook) : [],
    };
  } catch {
    return { current: null, past: [] };
  }
}

function isBook(v: unknown): v is ReadingBook {
  if (!v || typeof v !== "object") return false;
  const b = v as Partial<ReadingBook>;
  return typeof b.title === "string"
    && typeof b.totalPages === "number" && b.totalPages > 0
    && typeof b.currentPage === "number" && b.currentPage >= 0;
}

function writeStore(s: Store): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); }
  catch { /* private mode / quota — non-fatal, the practice just won't persist */ }
}

/** The book being read now, or null if none has been set up yet. */
export function getReadingBook(): ReadingBook | null {
  return readStore().current;
}

/**
 * Start a book. Any book already in progress is retired to `past` rather than
 * overwritten — someone who sets up a second book has not un-read the first.
 */
export function startReadingBook(
  title: string, author: string, totalPages: number, ymd: string,
): ReadingBook {
  const s = readStore();
  const book: ReadingBook = {
    title: title.trim(),
    author: author.trim(),
    totalPages: Math.max(1, Math.floor(totalPages)),
    currentPage: 0,
    startedYmd: ymd,
    lastLoggedYmd: null,
  };
  const past = s.current ? [s.current, ...s.past].slice(0, PAST_CAP) : s.past;
  writeStore({ current: book, past });
  return book;
}

/**
 * Record the page they read TO today.
 *
 * Clamped to the book's length, and never allowed to go BACKWARDS: re-opening
 * the sheet and mistyping a smaller number should not undo real progress, and
 * the prompt asks where you are now rather than how far you got today. Someone
 * who genuinely needs to correct downwards can restart the book.
 */
export function logReadingPage(page: number, ymd: string): ReadingBook | null {
  const s = readStore();
  if (!s.current) return null;
  const clamped = Math.max(0, Math.min(Math.floor(page), s.current.totalPages));
  const next: ReadingBook = {
    ...s.current,
    currentPage: Math.max(s.current.currentPage, clamped),
    lastLoggedYmd: ymd,
  };
  writeStore({ current: next, past: s.past });
  return next;
}

/** Has a page been logged today? Drives the card's done state. */
export function hasLoggedReadingToday(ymd: string): boolean {
  return getReadingBook()?.lastLoggedYmd === ymd;
}

/** Undo today's log — the card's ✓ → Unlog path. The page itself is left
 *  alone: they did read to it, they just un-marked the day. */
export function unlogReadingToday(): void {
  const s = readStore();
  if (!s.current) return;
  writeStore({ current: { ...s.current, lastLoggedYmd: null }, past: s.past });
}

/** Put the book away without starting another. */
export function clearReadingBook(): void {
  const s = readStore();
  writeStore({ current: null, past: s.current ? [s.current, ...s.past].slice(0, PAST_CAP) : s.past });
}
