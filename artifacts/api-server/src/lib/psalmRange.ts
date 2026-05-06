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
