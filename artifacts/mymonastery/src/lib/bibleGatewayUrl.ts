/**
 * Bible.com (YouVersion) URL builder — client-side mirror of the
 * api-server's helper. Produces a NRSVUE deep link from a BCP-style
 * reference. Used by the lesson-slide button on /bcp/daily-office,
 * which can't depend on the server having pre-built metadata.readUrl
 * for cached slides.
 */

const BOOK_USFM: Array<[RegExp, string]> = [
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

  [/^Tob(it)?\.?$/i, "TOB"],
  [/^Jdth\.?$/i, "JDT"],
  [/^Wis(d)?\.?$/i, "WIS"],
  [/^Ecclus\.?$/i, "SIR"],
  [/^Sir(ach)?\.?$/i, "SIR"],
  [/^Bar(uch)?\.?$/i, "BAR"],
  [/^1\s*Macc?\.?$/i, "1MA"],
  [/^2\s*Macc?\.?$/i, "2MA"],

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

export function bibleUrl(reference: string): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();
  if (!trimmed) return null;

  const noParens = trimmed.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const cleaned = noParens.replace(/--/g, "-").replace(/[–—]/g, "-");

  const m = cleaned.match(/^([\dA-Za-z.\s]+?)\s+(\d.*)$/);
  if (!m) return null;
  const rawBook = m[1].trim();
  const rest = m[2].trim();

  const usfm = lookupUsfm(rawBook);
  if (!usfm) return null;

  const dotted = rest.replace(/:/g, ".");
  const firstSegment = dotted.split(/[,;]/)[0].trim();

  if (!/^\d+(\.\d+(-\d+(\.\d+)?)?)?$/.test(firstSegment)) {
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

// Existing call sites still import `bibleGatewayUrl`. Alias keeps
// them building during the rename.
export const bibleGatewayUrl = bibleUrl;
