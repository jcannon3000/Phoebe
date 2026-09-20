/**
 * The book someone is reading — title, author, length, and where they are in it.
 *
 * Owner: "create a daily habit of reading a book and integrate that into their
 * Phoebe experience … ask the title of the book, the author of the book, how
 * many pages the book is … they would log it, and they would put in what page
 * they are on now … like the contemplation card, which has a progress bar …
 * page thirty two of two hundred and thirty five."
 *
 * LOCAL-FIRST, AND THE ACCOUNT REMEMBERS TOO (owner, 2026-09-19: "and save a
 * users progress"). Every read here is localStorage, so the practice works
 * offline and for a guest — but a page logged on the phone is pushed to
 * /api/me/client-state/reading-book through the write outbox, and pulled back
 * when the card opens. Whichever side is newer wins, exactly as the icon
 * history does (lib/iconHistory, the pattern this follows). Read defensively:
 * every getter survives private mode, cleared storage and a half-written
 * value.
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

import { apiRequest } from "@/lib/queryClient";
import { enqueueWrite, flushWrites } from "@/lib/writeOutbox";

const KEY = "phoebe:reading-book";
const PAST_CAP = 10;
const STAMP_KEY = "phoebe:reading-book:updated-at";
const STATE_URL = "/api/me/client-state/reading-book";
export const READING_BOOK_EVENT = "phoebe:reading-book-changed";

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

function writeStore(s: Store, push = true): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); }
  catch { /* private mode / quota — non-fatal, the practice just won't persist */ }
  if (push) pushToAccount(s);
  try { window.dispatchEvent(new Event(READING_BOOK_EVENT)); } catch { /* ignore */ }
}

function readStamp(): number {
  try { return Number(localStorage.getItem(STAMP_KEY) ?? 0) || 0; } catch { return 0; }
}
function writeStamp(ms: number): void {
  try { localStorage.setItem(STAMP_KEY, String(ms)); } catch { /* private mode */ }
}

/** Queue this device's copy for the account, and try to send it now. */
function pushToAccount(value: Store): void {
  const updatedAt = Date.now();
  writeStamp(updatedAt);
  enqueueWrite("client-state:reading-book", "PUT", STATE_URL, { value, updatedAt });
  void flushWrites();
}

function isStore(v: unknown): v is Store {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<Store>;
  return (s.current === null || isBook(s.current)) && Array.isArray(s.past);
}

/**
 * Adopt the account's copy when it is newer than this device's, and push ours
 * when ours is newer. Resolves true when what is stored here changed, so the
 * card can redraw. Quiet for a guest (401) and offline (the outbox holds the
 * push) — a reading practice must not depend on either.
 */
export async function pullReadingBookFromAccount(): Promise<boolean> {
  let remote: { value: unknown; updatedAt: number | null } | null = null;
  try { remote = await apiRequest("GET", STATE_URL); } catch { return false; }
  const local = readStamp();
  const remoteAt = remote?.updatedAt ?? 0;
  if (remoteAt > local && isStore(remote?.value)) {
    writeStore({ current: remote!.value.current, past: remote!.value.past.filter(isBook).slice(0, PAST_CAP) }, false);
    writeStamp(remoteAt);
    return true;
  }
  const here = readStore();
  if (local > remoteAt && (here.current || here.past.length > 0)) pushToAccount(here);
  return false;
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
