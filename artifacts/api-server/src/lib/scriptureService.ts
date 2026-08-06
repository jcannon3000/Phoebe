/**
 * Scripture Service — looks up passage text from a local Bible JSON
 * file (the World English Bible, WEB — modern, public domain, so its
 * full text can be shown inline in the office slideshows) with
 * permanent caching. Psalms are NEVER fetched here — they come from
 * the bcp_texts table (BCP Psalter).
 *
 * The bundled web.json is produced by scripts/build-web-bible.mjs and
 * uses the SAME book names + order + verse shape the parser already
 * expects, so swapping translations is a one-line data-path change.
 *
 * ZERO external API calls at runtime.
 */

import { eq } from "drizzle-orm";
import {
  db,
  scriptureCacheTable,
  bcpTextsTable,
} from "@workspace/db";
import { readFileSync } from "fs";
import { join } from "path";

/* ------------------------------------------------------------------ */
/*  Load Bible JSON once at module init                                */
/* ------------------------------------------------------------------ */

interface BibleVerse {
  verse: number;
  text: string;
}
interface BibleChapter {
  chapter: number;
  verses: BibleVerse[];
}
interface BibleBook {
  name: string;
  chapters: BibleChapter[];
}
interface BibleData {
  translation: string;
  books: BibleBook[];
}

const bibleDataPath = join(__dirname, "data", "web.json");
const bible: BibleData = JSON.parse(readFileSync(bibleDataPath, "utf-8"));

/* ------------------------------------------------------------------ */
/*  Book name mapping (lowercase key → canonical book name in JSON)    */
/* ------------------------------------------------------------------ */

const BOOK_MAP: Record<string, string> = {
  // Full names
  genesis: "Genesis", exodus: "Exodus", leviticus: "Leviticus",
  numbers: "Numbers", deuteronomy: "Deuteronomy", joshua: "Joshua",
  judges: "Judges", ruth: "Ruth",
  "i samuel": "I Samuel", "ii samuel": "II Samuel",
  "1 samuel": "I Samuel", "2 samuel": "II Samuel",
  "i kings": "I Kings", "ii kings": "II Kings",
  "1 kings": "I Kings", "2 kings": "II Kings",
  "i chronicles": "I Chronicles", "ii chronicles": "II Chronicles",
  "1 chronicles": "I Chronicles", "2 chronicles": "II Chronicles",
  ezra: "Ezra", nehemiah: "Nehemiah", esther: "Esther",
  job: "Job", psalms: "Psalms", psalm: "Psalms",
  proverbs: "Proverbs", ecclesiastes: "Ecclesiastes",
  "song of solomon": "Song of Solomon", "song of songs": "Song of Solomon",
  isaiah: "Isaiah", jeremiah: "Jeremiah", lamentations: "Lamentations",
  ezekiel: "Ezekiel", daniel: "Daniel", hosea: "Hosea",
  joel: "Joel", amos: "Amos", obadiah: "Obadiah",
  jonah: "Jonah", micah: "Micah", nahum: "Nahum",
  habakkuk: "Habakkuk", zephaniah: "Zephaniah", haggai: "Haggai",
  zechariah: "Zechariah", malachi: "Malachi",
  matthew: "Matthew", mark: "Mark", luke: "Luke", john: "John",
  acts: "Acts", romans: "Romans",
  "i corinthians": "I Corinthians", "ii corinthians": "II Corinthians",
  "1 corinthians": "I Corinthians", "2 corinthians": "II Corinthians",
  galatians: "Galatians", ephesians: "Ephesians",
  philippians: "Philippians", colossians: "Colossians",
  "i thessalonians": "I Thessalonians", "ii thessalonians": "II Thessalonians",
  "1 thessalonians": "I Thessalonians", "2 thessalonians": "II Thessalonians",
  "i timothy": "I Timothy", "ii timothy": "II Timothy",
  "1 timothy": "I Timothy", "2 timothy": "II Timothy",
  titus: "Titus", philemon: "Philemon", hebrews: "Hebrews",
  james: "James",
  "i peter": "I Peter", "ii peter": "II Peter",
  "1 peter": "I Peter", "2 peter": "II Peter",
  "i john": "I John", "ii john": "II John", "iii john": "III John",
  "1 john": "I John", "2 john": "II John", "3 john": "III John",
  jude: "Jude",
  revelation: "Revelation of John", "revelation of john": "Revelation of John",

  // Common abbreviations (periods stripped by normalizer)
  gen: "Genesis", exod: "Exodus", ex: "Exodus",
  lev: "Leviticus", num: "Numbers", deut: "Deuteronomy",
  josh: "Joshua", judg: "Judges",
  "1 sam": "I Samuel", "2 sam": "II Samuel",
  "1 kgs": "I Kings", "2 kgs": "II Kings",
  "1 chr": "I Chronicles", "2 chr": "II Chronicles",
  neh: "Nehemiah", esth: "Esther",
  prov: "Proverbs", eccl: "Ecclesiastes", eccles: "Ecclesiastes",
  isa: "Isaiah", jer: "Jeremiah", lam: "Lamentations",
  ezek: "Ezekiel", dan: "Daniel", hos: "Hosea",
  obad: "Obadiah", mic: "Micah",
  nah: "Nahum", hab: "Habakkuk", zeph: "Zephaniah",
  hag: "Haggai", zech: "Zechariah", mal: "Malachi",
  matt: "Matthew", mk: "Mark", lk: "Luke", jn: "John",
  rom: "Romans",
  "1 cor": "I Corinthians", "2 cor": "II Corinthians",
  gal: "Galatians", eph: "Ephesians", phil: "Philippians",
  col: "Colossians",
  "1 thess": "I Thessalonians", "2 thess": "II Thessalonians",
  "1 tim": "I Timothy", "2 tim": "II Timothy",
  phlm: "Philemon", heb: "Hebrews", jas: "James",
  "1 pet": "I Peter", "2 pet": "II Peter",
  "1 jn": "I John", "2 jn": "II John", "3 jn": "III John",
  rev: "Revelation of John",
  // Deuterocanonical stubs (not in this JSON — produces clear "not found")
  sir: "Sirach", sirach: "Sirach", ecclesiasticus: "Sirach",
  ecclus: "Sirach",
  wis: "Wisdom", wisdom: "Wisdom", "wisdom of solomon": "Wisdom",
  baruch: "Baruch", bar: "Baruch",
  tobit: "Tobit", tob: "Tobit",
  judith: "Judith", jdt: "Judith",
  "1 maccabees": "1 Maccabees", "2 maccabees": "2 Maccabees",
  "1 macc": "1 Maccabees", "2 macc": "2 Maccabees",
};

/** Fast lookup: canonical book name → BibleBook object */
const bookByName: Map<string, BibleBook> = new Map();
for (const book of bible.books) {
  bookByName.set(book.name, book);
}

/* ------------------------------------------------------------------ */
/*  Reference parsing                                                  */
/* ------------------------------------------------------------------ */

interface VerseRange {
  startChapter: number;
  startVerse: number;   // 0 means "whole chapter from verse 1"
  endChapter: number;
  endVerse: number;     // Infinity means "through end of chapter"
}

/**
 * Resolve a book name string (possibly abbreviated, with periods)
 * to the canonical name used in the JSON data.
 */
function resolveBookName(raw: string): string | null {
  const key = raw
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return BOOK_MAP[key] ?? null;
}

/**
 * Parse a chapter:verse locator segment like "1:1-18" or "2:3"
 * into a VerseRange. `lastChapter` provides context for bare
 * verse numbers after commas.
 */
function parseSegment(
  seg: string,
  lastChapter: number,
  hasColonContext: boolean,
): VerseRange {
  seg = seg.trim();

  // Range: "1:1-2:3" or "1:1-18" or "40"
  const rangeParts = seg.split("-");

  if (rangeParts.length === 1) {
    // Single: "1:1" or "40" or "5"
    if (seg.includes(":")) {
      const [ch, vs] = seg.split(":").map((s) => parseInt(s, 10));
      return { startChapter: ch, startVerse: vs, endChapter: ch, endVerse: vs };
    }
    const num = parseInt(seg, 10);
    if (hasColonContext) {
      // Bare number after prior colon context = verse in lastChapter
      return {
        startChapter: lastChapter,
        startVerse: num,
        endChapter: lastChapter,
        endVerse: num,
      };
    }
    // Bare number = whole chapter
    return {
      startChapter: num,
      startVerse: 0,
      endChapter: num,
      endVerse: Infinity,
    };
  }

  // Two parts: start-end
  const startStr = rangeParts[0].trim();
  const endStr = rangeParts[1].trim();

  let startChapter: number;
  let startVerse: number;
  if (startStr.includes(":")) {
    const [ch, vs] = startStr.split(":").map((s) => parseInt(s, 10));
    startChapter = ch;
    startVerse = vs;
  } else {
    const num = parseInt(startStr, 10);
    if (hasColonContext || lastChapter > 0) {
      startChapter = lastChapter || num;
      startVerse = num;
    } else {
      startChapter = num;
      startVerse = 0;
    }
  }

  let endChapter: number;
  let endVerse: number;
  if (endStr.includes(":")) {
    const [ch, vs] = endStr.split(":").map((s) => parseInt(s, 10));
    endChapter = ch;
    endVerse = vs;
  } else {
    const num = parseInt(endStr, 10);
    // If start had a colon, bare end = verse in same chapter
    if (startStr.includes(":") || hasColonContext) {
      endChapter = startChapter;
      endVerse = num;
    } else {
      // chapter range
      endChapter = num;
      endVerse = Infinity;
    }
  }

  return { startChapter, startVerse, endChapter, endVerse };
}

/**
 * Parse a full reference like "Genesis 1:1-2:3" or "Isaiah 40"
 * or "John 1:1-18, 29-34" into a book name and array of VerseRanges.
 */
function parseReference(reference: string): {
  bookName: string;
  ranges: VerseRange[];
} | null {
  // Strip parenthetical optional verses: "1:1-7(8-10)" → "1:1-7"
  const ref = reference
    .trim()
    // Normalize em/en dashes to a hyphen, then collapse the lectionary's
    // chapter-spanning double-hyphen ("1 Cor. 10:14--11:1") to a single "-" so
    // the segment splitter sees a clean two-part range. The "--" used to split
    // into THREE parts ("10:14","","11:1") — the parser handled only two, so it
    // rendered ch.10 to its end and silently dropped ch.11 (no fallback).
    .replace(/[—–]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\([^)]*\)/g, "");

  // Match: optional number prefix + book name, then locator. The locator allows
  // ";" (separates ranges: "10:14-17; 11:27-32") and a/b/c verse-part suffixes
  // ("14:20-33a", "2:1b-10") so those refs parse inline instead of falling back.
  const match = ref.match(/^(\d?\s*[A-Za-z][A-Za-z.\s]*?)\s+([\d:,;\-\sa-c]+)$/);
  if (!match) return null;

  const rawBook = match[1].trim();
  const location = match[2].trim();

  const bookName = resolveBookName(rawBook);
  if (!bookName) return null;

  if (!location) {
    return {
      bookName,
      ranges: [{ startChapter: 1, startVerse: 0, endChapter: 999, endVerse: Infinity }],
    };
  }

  // Split comma- or semicolon-separated segments.
  const segments = location.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const ranges: VerseRange[] = [];
  let lastChapter = 0;
  let hasColonContext = false;

  for (const seg of segments) {
    if (seg.includes(":")) hasColonContext = true;
    const range = parseSegment(seg, lastChapter, hasColonContext);
    ranges.push(range);
    lastChapter = range.endChapter;
  }

  return { bookName, ranges };
}

/* ------------------------------------------------------------------ */
/*  Text extraction                                                    */
/* ------------------------------------------------------------------ */

function extractText(bookName: string, ranges: VerseRange[]): string {
  const book = bookByName.get(bookName);
  if (!book) {
    return `[${bookName} — not found in local Bible data]`;
  }

  const parts: string[] = [];

  for (const range of ranges) {
    for (const chapter of book.chapters) {
      if (chapter.chapter < range.startChapter) continue;
      if (chapter.chapter > range.endChapter) break;

      for (const v of chapter.verses) {
        const isStart = chapter.chapter === range.startChapter;
        const isEnd = chapter.chapter === range.endChapter;

        if (isStart && v.verse < range.startVerse && range.startVerse !== 0) continue;
        if (isEnd && v.verse > range.endVerse && range.endVerse !== Infinity) continue;

        parts.push(`[${v.verse}] ${v.text.trim()}`);
      }
    }
  }

  if (parts.length === 0) {
    return `[${bookName} — verses not found in local Bible data]`;
  }

  return parts.join(" ");
}

/**
 * Look up a scripture passage from the local Bible JSON data.
 */
function lookupPassage(reference: string): string {
  const parsed = parseReference(reference);
  if (!parsed) {
    return `[${reference} — could not parse reference]`;
  }
  return extractText(parsed.bookName, parsed.ranges);
}

export interface LessonVerse {
  chapter: number;
  verse: number;
  text: string;
}

/**
 * Same lookup as getLesson, but returns a structured per-verse array
 * instead of a single concatenated string. Used by the office
 * assemblers to render a lesson as numbered-verse slide chunks
 * (mirroring the psalm chunked-slide treatment).
 *
 * Returns null when the book is missing from local data (e.g. the
 * deuterocanonical books) or the reference can't be parsed — callers
 * fall back to the reference-only "open your bible" slide in that
 * case.
 */
export function lookupLessonVerses(reference: string): LessonVerse[] | null {
  const parsed = parseReference(reference);
  if (!parsed) return null;
  const book = bookByName.get(parsed.bookName);
  if (!book) return null;

  const verses: LessonVerse[] = [];
  for (const range of parsed.ranges) {
    for (const chapter of book.chapters) {
      if (chapter.chapter < range.startChapter) continue;
      if (chapter.chapter > range.endChapter) break;
      for (const v of chapter.verses) {
        const isStart = chapter.chapter === range.startChapter;
        const isEnd = chapter.chapter === range.endChapter;
        if (isStart && v.verse < range.startVerse && range.startVerse !== 0) continue;
        if (isEnd && v.verse > range.endVerse && range.endVerse !== Infinity) continue;
        verses.push({ chapter: chapter.chapter, verse: v.verse, text: v.text.trim() });
      }
    }
  }
  return verses.length > 0 ? verses : null;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Get a scripture lesson by reference. Uses PERMANENT caching —
 * once a reference has been looked up it is cached forever.
 *
 * The cacheDate parameter is stored for record-keeping but
 * cache lookup matches on reference alone.
 */
export async function getLesson(
  reference: string,
  cacheDate: Date,
): Promise<{ text: string; fromCache: boolean }> {
  const dateStr = cacheDate.toISOString().slice(0, 10);

  // 1. Check permanent cache — match on reference ONLY
  const cached = await db
    .select()
    .from(scriptureCacheTable)
    .where(eq(scriptureCacheTable.reference, reference))
    .limit(1);

  if (cached.length > 0) {
    return { text: cached[0].nrsv_text, fromCache: true };
  }

  // 2. Look up from local Bible data (zero network calls)
  const text = lookupPassage(reference);

  // 3. Cache permanently
  try {
    await db
      .insert(scriptureCacheTable)
      .values({
        reference,
        cacheDate: dateStr,
        nrsv_text: text,
      })
      .onConflictDoNothing();
  } catch {
    // Non-fatal
  }

  return { text, fromCache: false };
}

/**
 * Get a psalm from the BCP Psalter (bcp_texts table).
 * Psalms always use the BCP translation, never the lesson translation.
 */
export async function getPsalm(psalmNumber: number): Promise<string> {
  const textKey = `psalm_${psalmNumber}`;
  const result = await db
    .select({ content: bcpTextsTable.content })
    .from(bcpTextsTable)
    .where(eq(bcpTextsTable.textKey, textKey))
    .limit(1);

  if (result.length > 0) {
    return result[0].content;
  }

  const page = 585 + Math.floor((psalmNumber / 150) * 223);
  return `[Psalm ${psalmNumber} — see BCP p. ${page}]`;
}

/**
 * Trim a full BCP psalm text down to just verses [startVerse, endVerse]
 * (inclusive) — for a novena day citing only a portion of a psalm, rather
 * than always presenting the whole thing. Each verse in the stored text
 * begins a line with "<number> "; a trailing Gloria Patri block (if any)
 * is dropped along with everything past the requested range.
 */
export function trimPsalmToVerses(fullText: string, startVerse: number, endVerse: number): string {
  const lines = fullText.split("\n");
  const out: string[] = [];
  let including = false;
  for (const line of lines) {
    const m = line.match(/^(\d+)\s/);
    if (m) {
      const n = Number(m[1]);
      including = n >= startVerse && n <= endVerse;
      if (n > endVerse) break;
    }
    if (including) out.push(line);
  }
  return out.join("\n").trim();
}
