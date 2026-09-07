/**
 * Psalm-range helpers
 *
 * The 1979 BCP Daily Office Lectionary frequently appoints partial
 * psalms — most often slices of Psalm 119 ("119:1-24",
 * "119:73-96", etc.), but also "37:1-18" / "37:19-42",
 * "78:1-39" / "78:40-72", "118:19-29", and so on. The seeded psalm
 * rows in `bcp_texts` always contain the full psalm; the assemblers
 * have to slice down to the appointed verse range when one is
 * given.
 */

export interface PsalmRef {
  number: number;            // The psalm number, e.g. 119
  /** The FIRST appointed range — what every caller written before the
   *  lectionary's comma showed up reads. Null means the whole psalm. */
  range: [number, number] | null;
  /**
   * EVERY appointed range, in order. The RCL appoints split selections far
   * more often than the Daily Office does — "Psalm 78:1-4, 12-16",
   * "118:1-2, 19-29" (Palm Sunday and Easter Day both), "112:1-9, (10)" —
   * and a parser that understood one bare `N-M` dropped the selection
   * entirely on 33 of 98 Sundays in the table, praying all 71 verses of
   * Psalm 78 where four were appointed. Null means the whole psalm.
   */
  ranges: Array<[number, number]> | null;
  raw: string;               // Original reference, e.g. "119:1-24"
}

/**
 * Parse one lectionary psalm reference. Accepts:
 *   "23"          -> { number: 23, range: null }
 *   "119:1-24"    -> { number: 119, range: [1, 24] }
 *   "37:19-42"    -> { number: 37, range: [19, 42] }
 *   "100:5"       -> { number: 100, range: [5, 5] }
 *   "95* & 32"    -> { number: 32, range: null }  (see the note on the
 *                                                  invitatory star below —
 *                                                  the SECOND number is the
 *                                                  psalm of the office)
 */
export function parsePsalmRef(ref: string): PsalmRef | null {
  if (!ref) return null;
  // The BCP daily office lectionary marks optional psalms with square
  // brackets, e.g. "[70]" or "[27:1-13]" — they're appointed for the
  // day but may be omitted if pressed for time. Treat them as regular
  // appointments here so both the full Office (which renders all
  // appointed psalms) and the Devotion (which uses psalms[0]) show
  // the same first psalm. Stripping the brackets up front means the
  // rest of the parser doesn't need to know about the convention.
  const trimmed = ref.trim().replace(/^\[+/, "").replace(/\]+$/, "").trim();
  if (!trimmed) return null;

  /**
   * THE STARRED PSALM IS THE INVITATORY, NOT THE PSALM OF THE OFFICE.
   *
   * The BCP prints "95* & 32" on eight days a year. The star means Psalm 95
   * is said as the Invitatory in place of the Venite; the psalm APPOINTED for
   * the office is the one after the ampersand. This took the first token, so
   * it returned 95 — and then `pickInvitatoryKey` saw 95 among the appointed
   * psalms, concluded the Venite was already covered and substituted the
   * Jubilate. Net effect: Psalm 95 prayed once, in the wrong slot, and the
   * appointed psalm never prayed at all.
   *
   * The days this hits are the year's penitential high points — Ash
   * Wednesday (loses 32), Good Friday (loses 22, "My God, my God, why have
   * you forsaken me", the psalm of the crucifixion), Holy Saturday, and
   * every Friday in Lent.
   *
   * So: when the star is present, take what follows the ampersand. The star
   * without an ampersand ("95*" alone) still means the invitatory, and there
   * is no other psalm to fall back to, so it stays as 95.
   */
  const starred = /^\s*95\s*\*\s*&\s*(.+)$/.exec(trimmed);
  const forOffice = starred ? starred[1]!.trim() : trimmed;
  /**
   * Only the FIRST psalm of a combined reference belongs to this ref — the
   * callers split "42 & 43" into two. Cutting here also keeps the ampersand
   * out of the verse part below.
   */
  const firstPsalm = forOffice.split(/[&;]/)[0]!.trim().replace(/[*]+$/, "");
  const colon = firstPsalm.indexOf(":");
  const number = parseInt(colon === -1 ? firstPsalm : firstPsalm.slice(0, colon), 10);
  if (!Number.isFinite(number)) return null;
  if (colon === -1) return { number, range: null, ranges: null, raw: forOffice };

  /**
   * THE WHOLE VERSE PART, NOT ITS FIRST TOKEN.
   *
   * This used to take `split(/\s+/)[0]`, so "78:1-4, 12-16" became "1-4,"
   * — which matched no pattern, fell through to null, and the deck prayed
   * all 71 verses over 18 slides where 3 were appointed. "45: 11-18" lost
   * its selection to the space alone. The This Sunday card printed the right
   * reference while the deck prayed something else.
   *
   * Parentheses mark verses the RCL leaves optional ("1-9, (10)",
   * "1-17(18-23)"); they are appointed, so they are treated as another
   * segment rather than dropped — praying ten verses where nine were
   * required is far closer to the appointment than praying all 150.
   */
  const versePart = firstPsalm.slice(colon + 1)
    .replace(/[\u2010-\u2015]/g, "-")   // en/em dashes from pasted lectionaries
    .replace(/[()[\]]/g, ",");
  const ranges: Array<[number, number]> = [];
  for (const seg of versePart.split(",")) {
    // Verse-letter suffixes ("45b", "22a") name half a verse; the seeded
    // psalms are whole verses, so the letter is dropped and the verse kept.
    const s = seg.replace(/\s+/g, "").replace(/(\d+)[a-z]+/gi, "$1");
    if (!s) continue;
    const m = /^(\d+)-(\d+)$/.exec(s);
    if (m) ranges.push([parseInt(m[1], 10), parseInt(m[2], 10)]);
    else if (/^\d+$/.test(s)) ranges.push([parseInt(s, 10), parseInt(s, 10)]);
  }
  if (ranges.length === 0) return { number, range: null, ranges: null, raw: forOffice };
  return { number, range: ranges[0]!, ranges, raw: forOffice };
}

/**
 * A psalm's content cut to what the day appoints — every range, in order.
 *
 * ONE place, because the six assemblers each did `ref.range ? slice(...) :
 * content` and would each have had to learn about the second range. Creation
 * Prayer had already grown its own private multi-range parser
 * (assembleCreationDevotion's parseRef) precisely because this one couldn't
 * do it; that is the drift this closes.
 */
export function slicePsalmToRef(content: string, ref: Pick<PsalmRef, "range" | "ranges">): string {
  const ranges = ref.ranges ?? (ref.range ? [ref.range] : null);
  if (!ranges) return content;
  const parts = ranges.map((r) => sliceVersesByRange(content, r)).filter((x) => x.trim().length > 0);
  return parts.length > 0 ? parts.join("\n") : content;
}

/**
 * Slice a psalm content string down to a verse range. The seeded
 * format is `<n> first hemistich *\n  second hemistich\n<n+1> ...`
 * — verse markers are lines starting with digits + space. We walk
 * the lines and keep only those that belong to a verse whose number
 * falls inside the inclusive range. Continuation lines (indented
 * second hemistich, additional run-on lines) belong to the most
 * recent verse, so we track an `inRange` flag rather than checking
 * each line.
 */
export function sliceVersesByRange(
  content: string,
  range: [number, number],
): string {
  const [from, to] = range;
  const out: string[] = [];
  let inRange = false;
  for (const line of content.split("\n")) {
    const verseMatch = line.match(/^(\d+)\s/);
    if (verseMatch) {
      const n = parseInt(verseMatch[1], 10);
      // We've passed the end of the range — bail out so we don't
      // accumulate trailing verses.
      if (n > to) break;
      inRange = n >= from && n <= to;
    }
    if (inRange) out.push(line);
  }
  return out.join("\n").replace(/\s+$/, "");
}

/**
 * Split psalm content into N-verse chunks for slide-by-slide reading.
 *
 * Each chunk is a contiguous run of verses (with their continuation
 * lines), preserving the original line-break shape. Verses are
 * detected by the `^<digit>+ ` marker that the seeded psalm rows use.
 * Empty chunks are dropped — if the content has fewer than `versesPerChunk`
 * verses we just return one chunk.
 *
 * Returns the chunks in reading order. The caller is responsible for
 * appending the Gloria Patri to the last chunk only.
 */
export function splitPsalmIntoChunks(
  content: string,
  versesPerChunk: number,
): string[] {
  if (versesPerChunk <= 0) return [content];
  // Walk lines, group by verse marker. Continuation lines (no leading
  // digit) attach to the most recent verse so hemistich indents stay
  // with their verse number.
  const verses: string[][] = [];
  let current: string[] | null = null;
  for (const line of content.split("\n")) {
    if (/^\d+\s/.test(line)) {
      if (current) verses.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      // Pre-verse preamble (rare). Treat as its own pseudo-verse so
      // it doesn't get lost.
      current = [line];
    }
  }
  if (current) verses.push(current);

  const chunks: string[] = [];
  for (let i = 0; i < verses.length; i += versesPerChunk) {
    const slice = verses.slice(i, i + versesPerChunk);
    chunks.push(slice.map((v) => v.join("\n")).join("\n").replace(/\s+$/, ""));
  }
  return chunks.length > 0 ? chunks : [content];
}

/**
 * Split canticle content into N-verse chunks.
 *
 * Canticles don't carry numeric verse markers like psalms — instead a
 * "verse" is a non-indented line plus any immediately-following
 * indented continuation lines (the second hemistich after the BCP `*`
 * caesura). Stanza separators (blank lines) attach to the preceding
 * verse so the chunking respects the printed layout.
 *
 * Returns the verse-count + the chunked text. Callers can decide
 * whether to chunk based on the count (e.g. only chunk if > 4).
 */
export function splitCanticleIntoChunks(
  content: string,
  versesPerChunk: number,
): { verses: number; chunks: string[] } {
  if (versesPerChunk <= 0) return { verses: 0, chunks: [content] };
  const verses: string[][] = [];
  let current: string[] | null = null;
  for (const line of content.split("\n")) {
    const isContinuation = /^\s/.test(line);
    const isBlank = line.trim().length === 0;
    if (!isContinuation && !isBlank) {
      // Start of a new verse.
      if (current) verses.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      // Pre-verse content (rare). Seed the first verse.
      current = [line];
    }
  }
  if (current) verses.push(current);

  const chunks: string[] = [];
  for (let i = 0; i < verses.length; i += versesPerChunk) {
    const slice = verses.slice(i, i + versesPerChunk);
    chunks.push(slice.map((v) => v.join("\n")).join("\n").replace(/\s+$/, ""));
  }
  return {
    verses: verses.length,
    chunks: chunks.length > 0 ? chunks : [content],
  };
}

/**
 * Pretty label for a parsed reference. "PSALM 119:1-24" or "PSALM 23".
 */
export function psalmEyebrow(ref: PsalmRef): string {
  if (!ref.range) return `PSALM ${ref.number}`;
  const [from, to] = ref.range;
  if (from === to) return `PSALM ${ref.number}:${from}`;
  return `PSALM ${ref.number}:${from}-${to}`;
}

/**
 * BibleGateway-friendly reference string for a parsed ref. Used by
 * the bibleGatewayUrl builder when we want a deep link to the
 * appointed range only (rather than the whole psalm). Returns
 * "Psalm 119:1-24" / "Psalm 23".
 */
export function psalmReadingRef(ref: PsalmRef): string {
  if (!ref.range) return `Psalm ${ref.number}`;
  const [from, to] = ref.range;
  if (from === to) return `Psalm ${ref.number}:${from}`;
  return `Psalm ${ref.number}:${from}-${to}`;
}

/**
 * A psalm reference as a READER should see it.
 *
 * The lectionary carries the printed book's own notation, and it was being
 * shown verbatim on the home card and the office eyebrow. Real examples that
 * reached people:
 *
 *   "95* & 32"          → the invitatory star, meaningless without the rubric
 *   "40:1:1-14(15-19)"  → a typo, now fixed in the data
 *   "[59, 60] or\t33"   → a literal tab, mid-string
 *   "56, 57, [58]"      → brackets mark an OPTIONAL psalm
 *   "114 or 118"        → a genuine either/or the book offers
 *
 * The rules, in the order a reader needs them:
 *   • the starred invitatory is not part of the day's psalms — drop it
 *   • brackets mean "may be omitted"; keep the number, lose the brackets
 *   • an either/or keeps only the first, which is what the office prays
 *   • whitespace is normalised, so a stray tab can't reach a slide
 *
 * PARSING IS UNCHANGED — parsePsalmRef still reads the raw string. This is
 * for display only, so the two can never disagree about which psalm is said.
 */
export function displayPsalmRef(ref: string): string {
  if (!ref) return "";
  let out = ref.replace(/\s+/g, " ").trim();
  // "95* & 32" → "32"; a bare "95*" keeps its number.
  const starred = /^95\s*\*\s*&\s*(.+)$/.exec(out);
  if (starred) out = starred[1]!.trim();
  out = out.replace(/\*+/g, "");
  // "114 or 118" → "114" — the office prays the first.
  out = out.split(/\s+or\s+/i)[0]!.trim();
  // "[58]" → "58"
  out = out.replace(/[[\]]/g, "").trim();
  return out.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

/**
 * A LESSON reference as a reader should see it.
 *
 * The lectionary carries the printed book's footnote marks and its
 * "read the bracketed part if you like" convention. Both were reaching the
 * slide headline AND the oremus URL, where a stray character means the
 * passage simply doesn't resolve. Real examples:
 *
 *   "Exod. 12:1-14**"        - Easter Day's Morning Prayer headline
 *   "Heb, 1:1-12"            - a comma for a period; the link 404s
 *   "2 John -13"             - a dropped chapter number
 *   "Col. (3:18--4:1)2-18"   - an optional longer reading
 *   "Matt. (1:1-17); 3:1-6"  - the same, with a second passage after it
 *
 * The asterisks and the comma-for-period are unambiguous and fixed here.
 * The parenthetical is the BCP's optional extension: the shorter reading is
 * what the office prays, so the parenthetical is dropped and what follows is
 * kept - which is also what bibleUrl already did, except it left a dangling
 * separator behind ("Col. ; 3:1-6").
 */
export function displayLessonRef(ref: string): string {
  if (!ref) return "";
  let out = ref.replace(/\s+/g, " ").trim();
  out = out.replace(/\*+/g, "").trim();
  out = out.replace(/^([1-3]?\s*[A-Za-z.]+),(\s*\d)/, "$1.$2");
  out = out.replace(/\([^)]*\)/g, " ").replace(/\s*;\s*/g, "; ").trim();
  out = out.replace(/^[;,\s]+/, "").replace(/[;,\s]+$/, "").trim();
  out = out.replace(/\s+-(\d)/, " 1-$1");
  return out.replace(/\s+/g, " ").trim();
}
