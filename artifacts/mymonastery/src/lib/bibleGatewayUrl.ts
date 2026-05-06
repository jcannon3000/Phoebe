/**
 * Bible.com (YouVersion) URL builder — client-side mirror of
 * api-server/src/lib/bibleGatewayUrl.ts. Each pattern accepts both
 * the BCP-style abbreviation ("2 Cor.") and the full book name
 * ("2 Corinthians") so devotion-style hardcoded references resolve
 * the same way Daily Office lectionary references do.
 */

const BOOK_USFM: Array<[RegExp, string]> = [
  [/^Gen(esis)?\.?$/i, "GEN"],
  [/^Ex(od|odus)?\.?$/i, "EXO"],
  [/^Lev(iticus)?\.?$/i, "LEV"],
  [/^Num(bers)?\.?$/i, "NUM"],
  [/^Deut(eronomy)?\.?$/i, "DEU"],
  [/^Josh(ua)?\.?$/i, "JOS"],
  [/^Judg(es)?\.?$/i, "JDG"],
  [/^Ruth$/i, "RUT"],
  [/^1\s*Sam(uel)?\.?$/i, "1SA"],
  [/^2\s*Sam(uel)?\.?$/i, "2SA"],
  [/^1\s*K(in)?gs\.?$/i, "1KI"],
  [/^1\s*Kings$/i, "1KI"],
  [/^2\s*K(in)?gs\.?$/i, "2KI"],
  [/^2\s*Kings$/i, "2KI"],
  [/^1\s*Chr(on(icles)?)?\.?$/i, "1CH"],
  [/^2\s*Chr(on(icles)?)?\.?$/i, "2CH"],
  [/^Ezra$/i, "EZR"],
  [/^Neh(emiah)?\.?$/i, "NEH"],
  [/^Esth(er)?\.?$/i, "EST"],
  [/^Job$/i, "JOB"],
  [/^Ps(alm)?\.?$/i, "PSA"],
  [/^Pss\.?$/i, "PSA"],
  [/^Psalms$/i, "PSA"],
  [/^Prov(erbs)?\.?$/i, "PRO"],
  [/^Eccl(es(iastes)?)?\.?$/i, "ECC"],
  [/^S(ong\s+of\s+)?Sol(omon)?\.?$/i, "SNG"],
  [/^Song\s+of\s+Songs$/i, "SNG"],
  [/^Cant(icles)?\.?$/i, "SNG"],
  [/^Isa(iah)?\.?$/i, "ISA"],
  [/^Jer(emiah)?\.?$/i, "JER"],
  [/^Lam(entations)?\.?$/i, "LAM"],
  [/^Ezek(iel)?\.?$/i, "EZK"],
  [/^Dan(iel)?\.?$/i, "DAN"],
  [/^Hos(ea)?\.?$/i, "HOS"],
  [/^Joel$/i, "JOL"],
  [/^Amos$/i, "AMO"],
  [/^Obad(iah)?\.?$/i, "OBA"],
  [/^Jonah$/i, "JON"],
  [/^Mic(ah)?\.?$/i, "MIC"],
  [/^Nah(um)?\.?$/i, "NAM"],
  [/^Hab(akkuk)?\.?$/i, "HAB"],
  [/^Zeph(aniah)?\.?$/i, "ZEP"],
  [/^Hag(g(ai)?)?\.?$/i, "HAG"],
  [/^Zech(ariah)?\.?$/i, "ZEC"],
  [/^Mal(achi)?\.?$/i, "MAL"],

  [/^Tob(it)?\.?$/i, "TOB"],
  [/^Jdth\.?$/i, "JDT"],
  [/^Judith$/i, "JDT"],
  [/^Wis(d(om)?)?\.?$/i, "WIS"],
  [/^Wisdom\s+of\s+Solomon$/i, "WIS"],
  [/^Ecclus\.?$/i, "SIR"],
  [/^Sir(ach)?\.?$/i, "SIR"],
  [/^Bar(uch)?\.?$/i, "BAR"],
  [/^1\s*Macc?(abees)?\.?$/i, "1MA"],
  [/^2\s*Macc?(abees)?\.?$/i, "2MA"],

  [/^Matt(hew)?\.?$/i, "MAT"],
  [/^Mark$/i, "MRK"],
  [/^Luke$/i, "LUK"],
  [/^John$/i, "JHN"],
  [/^Acts$/i, "ACT"],
  [/^Rom(ans)?\.?$/i, "ROM"],
  [/^1\s*Cor(inthians)?\.?$/i, "1CO"],
  [/^2\s*Cor(inthians)?\.?$/i, "2CO"],
  [/^Gal(atians)?\.?$/i, "GAL"],
  [/^Eph(esians)?\.?$/i, "EPH"],
  [/^Phil(ippians)?\.?$/i, "PHP"],
  [/^Col(ossians)?\.?$/i, "COL"],
  [/^1\s*Thess(alonians)?\.?$/i, "1TH"],
  [/^2\s*Thess(alonians)?\.?$/i, "2TH"],
  [/^1\s*Tim(othy)?\.?$/i, "1TI"],
  [/^2\s*Tim(othy)?\.?$/i, "2TI"],
  [/^Titus$/i, "TIT"],
  [/^Phlm\.?$/i, "PHM"],
  [/^Phile?(mon)?\.?$/i, "PHM"],
  [/^Heb(rews)?\.?$/i, "HEB"],
  [/^Jas\.?$/i, "JAS"],
  [/^James$/i, "JAS"],
  [/^1\s*Pet(er)?\.?$/i, "1PE"],
  [/^2\s*Pet(er)?\.?$/i, "2PE"],
  [/^1\s*John$/i, "1JN"],
  [/^2\s*John$/i, "2JN"],
  [/^3\s*John$/i, "3JN"],
  [/^Jude$/i, "JUD"],
  [/^Rev(elation)?\.?$/i, "REV"],
];

const NRSVUE_VERSION_ID = 3523;

export function bibleUrl(reference: string): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();
  if (!trimmed) return null;

  const noParens = trimmed.replace(/\([^)]*\)/g, ",").replace(/\s+/g, " ").trim();
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

export const bibleGatewayUrl = bibleUrl;
