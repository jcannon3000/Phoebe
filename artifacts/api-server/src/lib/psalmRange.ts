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
  range: [number, number] | null;  // Inclusive verse range, or null = whole psalm
  raw: string;               // Original reference, e.g. "119:1-24"
}

/**
 * Parse one lectionary psalm reference. Accepts:
 *   "23"          -> { number: 23, range: null }
 *   "119:1-24"    -> { number: 119, range: [1, 24] }
 *   "37:19-42"    -> { number: 37, range: [19, 42] }
 *   "100:5"       -> { number: 100, range: [5, 5] }
 *   "95* & 32"    -> { number: 95, range: null }  (the rare "instead-of"
 *                                                  notation; first
 *                                                  number wins)
 */
export function parsePsalmRef(ref: string): PsalmRef | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;

  // Take the first numeric/range token, ignoring any "* & N" suffix.
  const head = trimmed.split(/\s+/)[0].replace(/[*]+$/, "");
  const [numStr, rangeStr] = head.split(":");
  const number = parseInt(numStr, 10);
  if (!Number.isFinite(number)) return null;
  if (!rangeStr) return { number, range: null, raw: trimmed };

  const rangeMatch = rangeStr.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[1], 10);
    const to = parseInt(rangeMatch[2], 10);
    return { number, range: [from, to], raw: trimmed };
  }
  const single = rangeStr.match(/^(\d+)$/);
  if (single) {
    const n = parseInt(single[1], 10);
    return { number, range: [n, n], raw: trimmed };
  }
  return { number, range: null, raw: trimmed };
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
