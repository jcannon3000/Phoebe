/**
 * Bible.com (YouVersion) URL builder
 *
 * Per user direction we link out to YouVersion's NRSVUE rather than
 * BibleGateway. The URL shape is:
 *
 *   https://www.bible.com/bible/3523/<USFM>.<chapter>[.<verseRange>].NRSVUE
 *
 * where 3523 is YouVersion's NRSVUE version id and <USFM> is the
 * three-letter Paratext / USFM book code (JHN, 1TH, GEN, …). Verse
 * ranges use a hyphen ("5.12-28"); single verses drop the hyphen
 * ("1.3"). The function name and file name are historical — the
 * Daily Office assemblers and the lesson-slide button both call
 * bibleUrl(reference) regardless of which Bible site we route to.
 */

const BOOK_USFM: Array<[RegExp, string]> = [
  // Old Testament
  [/^Gen\.?$/i, "GEN"],
  [/^Ex(od)?\.?$/i, "EXO"],
  [/^Lev\.?$/i, "LEV"],
  [/^Num\.?$/i, "NUM"],
  [/^Deut\.?$/i, "DEU"],
  [/^Josh\.?$/i, "JOS"],
  [/^Judg\.?$/i, "JDG"],
  [/^Ruth$/i, "RUT"],
  [/^1\s*Sam\.?$/i, "1SA"],
  [/^2\s*Sam\.?$/i, "2SA"],
  [/^1\s*K(in)?gs\.?$/i, "1KI"],
  [/^2\s*K(in)?gs\.?$/i, "2KI"],
  [/^1\s*Chr(on)?\.?$/i, "1CH"],
  [/^2\s*Chr(on)?\.?$/i, "2CH"],
  [/^Ezra$/i, "EZR"],
  [/^Neh\.?$/i, "NEH"],
  [/^Esth\.?$/i, "EST"],
  [/^Job$/i, "JOB"],
  [/^Ps(alm)?\.?$/i, "PSA"],
  [/^Pss\.?$/i, "PSA"],
  [/^Prov\.?$/i, "PRO"],
  [/^Eccl(es)?\.?$/i, "ECC"],
  [/^S(ong\s+of\s+)?Sol(omon)?\.?$/i, "SNG"],
  [/^Cant(icles)?\.?$/i, "SNG"],
  [/^Isa\.?$/i, "ISA"],
  [/^Jer\.?$/i, "JER"],
  [/^Lam\.?$/i, "LAM"],
  [/^Ezek\.?$/i, "EZK"],
  [/^Dan\.?$/i, "DAN"],
  [/^Hos\.?$/i, "HOS"],
  [/^Joel$/i, "JOL"],
  [/^Amos$/i, "AMO"],
  [/^Obad\.?$/i, "OBA"],
  [/^Jonah$/i, "JON"],
  [/^Mic\.?$/i, "MIC"],
  [/^Nah(um)?\.?$/i, "NAM"],
  [/^Hab\.?$/i, "HAB"],
  [/^Zeph\.?$/i, "ZEP"],
  [/^Hag(g)?\.?$/i, "HAG"],
  [/^Zech\.?$/i, "ZEC"],
  [/^Mal\.?$/i, "MAL"],

  // Apocrypha (BCP Daily Office uses these — YouVersion's NRSVUE
  // includes them all)
  [/^Tob(it)?\.?$/i, "TOB"],
  [/^Jdth\.?$/i, "JDT"],
  [/^Wis(d)?\.?$/i, "WIS"],
  [/^Ecclus\.?$/i, "SIR"],
  [/^Sir(ach)?\.?$/i, "SIR"],
  [/^Bar(uch)?\.?$/i, "BAR"],
  [/^1\s*Macc?\.?$/i, "1MA"],
  [/^2\s*Macc?\.?$/i, "2MA"],

  // New Testament
  [/^Matt\.?$/i, "MAT"],
  [/^Mark$/i, "MRK"],
  [/^Luke$/i, "LUK"],
  [/^John$/i, "JHN"],
  [/^Acts$/i, "ACT"],
  [/^Rom\.?$/i, "ROM"],
  [/^1\s*Cor\.?$/i, "1CO"],
  [/^2\s*Cor\.?$/i, "2CO"],
  [/^Gal\.?$/i, "GAL"],
  [/^Eph\.?$/i, "EPH"],
  [/^Phil\.?$/i, "PHP"],
  [/^Col\.?$/i, "COL"],
  [/^1\s*Thess?\.?$/i, "1TH"],
  [/^2\s*Thess?\.?$/i, "2TH"],
  [/^1\s*Tim\.?$/i, "1TI"],
  [/^2\s*Tim\.?$/i, "2TI"],
  [/^Titus$/i, "TIT"],
  [/^Phlm\.?$/i, "PHM"],
  [/^Phile?(mon)?\.?$/i, "PHM"],
  [/^Heb\.?$/i, "HEB"],
  [/^Jas\.?$/i, "JAS"],
  [/^James$/i, "JAS"],
  [/^1\s*Pet\.?$/i, "1PE"],
  [/^2\s*Pet\.?$/i, "2PE"],
  [/^1\s*John$/i, "1JN"],
  [/^2\s*John$/i, "2JN"],
  [/^3\s*John$/i, "3JN"],
  [/^Jude$/i, "JUD"],
  [/^Rev\.?$/i, "REV"],
];

const NRSVUE_VERSION_ID = 3523;

/**
 * Build a YouVersion deep link for a BCP-style reference. Returns
 * null if we can't recognize the book name (so the caller can hide
 * the button rather than route to a broken page).
 */
export function bibleUrl(reference: string): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();
  if (!trimmed) return null;

  // Drop parenthetical optional verses, joining the surrounding
  // fragments so a reference like "Hab. 3:1-10(11-15)16-18" still
  // points at the chapter as a whole. The path-segment URL doesn't
  // accept comma-separated ranges, so we collapse to the outer
  // bound.
  const noParens = trimmed.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  // Normalise typographic dashes to plain hyphens.
  const cleaned = noParens
    .replace(/--/g, "-")
    .replace(/[–—]/g, "-");

  // Pull the leading book name + the chapter:verse tail.
  const m = cleaned.match(/^([\dA-Za-z.\s]+?)\s+(\d.*)$/);
  if (!m) return null;
  const rawBook = m[1].trim();
  const rest = m[2].trim();

  const usfm = lookupUsfm(rawBook);
  if (!usfm) return null;

  // Convert "5:12-28" → "5.12-28", "1:3" → "1.3", "5" → "5". Also
  // handle the rare cross-chapter range "1:1-2:8" → "1.1-2.8" by
  // replacing each colon with a dot. Strip any trailing comma list
  // (we already dropped the parenthetical optional verses; if a
  // reference has a comma like "1:1-5, 13-17" we keep the first
  // range only).
  const dotted = rest.replace(/:/g, ".");
  const firstSegment = dotted.split(/[,;]/)[0].trim();

  // Validate shape: chapter or chapter.verse[-verse[.chapter.verse]]
  if (!/^\d+(\.\d+(-\d+(\.\d+)?)?)?$/.test(firstSegment)) {
    // Falls back to a chapter-only link if the tail is unparseable.
    const chapterMatch = firstSegment.match(/^(\d+)/);
    if (!chapterMatch) return null;
    return `https://www.bible.com/bible/${NRSVUE_VERSION_ID}/${usfm}.${chapterMatch[1]}.NRSVUE`;
  }

  return `https://www.bible.com/bible/${NRSVUE_VERSION_ID}/${usfm}.${firstSegment}.NRSVUE`;
}

function lookupUsfm(raw: string): string | null {
  for (const [pattern, code] of BOOK_USFM) {
    if (pattern.test(raw)) return code;
  }
  return null;
}

// Backwards-compat: existing call sites still import bibleGatewayUrl.
// Re-export under the old name so no caller has to change. Will rename
// after this lands.
export const bibleGatewayUrl = bibleUrl;
