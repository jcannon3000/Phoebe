/**
 * BibleGateway URL builder
 *
 * Turns a BCP-style scripture reference like "1 Thess. 5:12-28" or
 * "Hab. 3:1-10(11-15)16-18" into a deep link that opens the passage
 * on BibleGateway in the NRSVUE translation.
 *
 * BibleGateway's `?search=` query is forgiving — it accepts both
 * abbreviated and full book names — but we expand the BCP
 * abbreviations anyway so the URL is human-readable when copied.
 */

const BOOK_EXPANSIONS: Array<[RegExp, string]> = [
  // Old Testament
  [/^Gen\.?$/i, "Genesis"],
  [/^Ex(od)?\.?$/i, "Exodus"],
  [/^Lev\.?$/i, "Leviticus"],
  [/^Num\.?$/i, "Numbers"],
  [/^Deut\.?$/i, "Deuteronomy"],
  [/^Josh\.?$/i, "Joshua"],
  [/^Judg\.?$/i, "Judges"],
  [/^Ruth$/i, "Ruth"],
  [/^1\s*Sam\.?$/i, "1 Samuel"],
  [/^2\s*Sam\.?$/i, "2 Samuel"],
  [/^1\s*K(in)?gs\.?$/i, "1 Kings"],
  [/^2\s*K(in)?gs\.?$/i, "2 Kings"],
  [/^1\s*Chr(on)?\.?$/i, "1 Chronicles"],
  [/^2\s*Chr(on)?\.?$/i, "2 Chronicles"],
  [/^Ezra$/i, "Ezra"],
  [/^Neh\.?$/i, "Nehemiah"],
  [/^Esth\.?$/i, "Esther"],
  [/^Job$/i, "Job"],
  [/^Ps(alm)?\.?$/i, "Psalm"],
  [/^Pss\.?$/i, "Psalm"],
  [/^Prov\.?$/i, "Proverbs"],
  [/^Eccl(es)?\.?$/i, "Ecclesiastes"],
  [/^S(ong\s+of\s+)?Sol(omon)?\.?$/i, "Song of Solomon"],
  [/^Cant(icles)?\.?$/i, "Song of Solomon"],
  [/^Isa\.?$/i, "Isaiah"],
  [/^Jer\.?$/i, "Jeremiah"],
  [/^Lam\.?$/i, "Lamentations"],
  [/^Ezek\.?$/i, "Ezekiel"],
  [/^Dan\.?$/i, "Daniel"],
  [/^Hos\.?$/i, "Hosea"],
  [/^Joel$/i, "Joel"],
  [/^Amos$/i, "Amos"],
  [/^Obad\.?$/i, "Obadiah"],
  [/^Jonah$/i, "Jonah"],
  [/^Mic\.?$/i, "Micah"],
  [/^Nah(um)?\.?$/i, "Nahum"],
  [/^Hab\.?$/i, "Habakkuk"],
  [/^Zeph\.?$/i, "Zephaniah"],
  [/^Hag(g)?\.?$/i, "Haggai"],
  [/^Zech\.?$/i, "Zechariah"],
  [/^Mal\.?$/i, "Malachi"],

  // Apocrypha (BCP Daily Office Lectionary uses these)
  [/^Tob(it)?\.?$/i, "Tobit"],
  [/^Jdth\.?$/i, "Judith"],
  [/^Wis(d)?\.?$/i, "Wisdom of Solomon"],
  [/^Ecclus\.?$/i, "Sirach"],
  [/^Sir(ach)?\.?$/i, "Sirach"],
  [/^Bar(uch)?\.?$/i, "Baruch"],
  [/^1\s*Macc?\.?$/i, "1 Maccabees"],
  [/^2\s*Macc?\.?$/i, "2 Maccabees"],

  // New Testament
  [/^Matt\.?$/i, "Matthew"],
  [/^Mark$/i, "Mark"],
  [/^Luke$/i, "Luke"],
  [/^John$/i, "John"],
  [/^Acts$/i, "Acts"],
  [/^Rom\.?$/i, "Romans"],
  [/^1\s*Cor\.?$/i, "1 Corinthians"],
  [/^2\s*Cor\.?$/i, "2 Corinthians"],
  [/^Gal\.?$/i, "Galatians"],
  [/^Eph\.?$/i, "Ephesians"],
  [/^Phil\.?$/i, "Philippians"],
  [/^Col\.?$/i, "Colossians"],
  [/^1\s*Thess?\.?$/i, "1 Thessalonians"],
  [/^2\s*Thess?\.?$/i, "2 Thessalonians"],
  [/^1\s*Tim\.?$/i, "1 Timothy"],
  [/^2\s*Tim\.?$/i, "2 Timothy"],
  [/^Titus$/i, "Titus"],
  [/^Phlm\.?$/i, "Philemon"],
  [/^Phile?(mon)?\.?$/i, "Philemon"],
  [/^Heb\.?$/i, "Hebrews"],
  [/^Jas\.?$/i, "James"],
  [/^James$/i, "James"],
  [/^1\s*Pet\.?$/i, "1 Peter"],
  [/^2\s*Pet\.?$/i, "2 Peter"],
  [/^1\s*John$/i, "1 John"],
  [/^2\s*John$/i, "2 John"],
  [/^3\s*John$/i, "3 John"],
  [/^Jude$/i, "Jude"],
  [/^Rev\.?$/i, "Revelation"],
];

/**
 * Pull the book name and verse range out of a reference string.
 * The 1979 BCP daily office references can include parenthetical
 * optional verses ("Hab. 3:1-10(11-15)16-18") and double dashes for
 * range crossings ("Amos 1:1-5, 13--2:8"). We strip the parentheses
 * (the optional verses are still inside the larger range) and
 * normalise the en-dash variant so BibleGateway sees a clean
 * "<book> <range>".
 */
export function bibleGatewayUrl(reference: string): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();
  if (!trimmed) return null;

  // Drop parenthetical optional verses, joining the surrounding
  // fragments with a comma so a reference like
  // "Hab. 3:1-10(11-15)16-18" becomes "Hab. 3:1-10,16-18" — a
  // BibleGateway-parseable two-range query rather than the smooshed
  // "1-1016-18".
  const noParens = trimmed.replace(/\([^)]*\)/g, ",").replace(/\s+/g, " ").trim();
  // Collapse "1-10--2:8" / "1:1--3:5" to a clean "1-10-2:8" so the
  // search query parses as one continuous range, and normalize
  // typographic en/em-dashes (4:5–6, 4:5—6) to plain hyphens since
  // BibleGateway only parses ASCII hyphens.
  const cleaned = noParens
    .replace(/--/g, "-")
    .replace(/[–—]/g, "-");

  // Split book name from chapter:verse range. Book names can have a
  // leading numeral ("1 Cor.") so the regex captures up to the LAST
  // run of letters before whitespace + chapter digit.
  const m = cleaned.match(/^([\dA-Za-z.\s]+?)\s+(\d.*)$/);
  if (!m) return null;
  const rawBook = m[1].trim();
  const range = m[2].trim();

  const expanded = expandBook(rawBook) ?? rawBook;
  const search = `${expanded} ${range}`;
  const url = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(
    search,
  )}&version=NRSVUE`;
  return url;
}

function expandBook(raw: string): string | null {
  for (const [pattern, full] of BOOK_EXPANSIONS) {
    if (pattern.test(raw)) return full;
  }
  return null;
}
