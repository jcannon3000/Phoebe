/**
 * BibleGateway URL builder (client-side mirror of api-server's
 * src/lib/bibleGatewayUrl.ts). Kept in sync so the office viewer can
 * compute a deep link from the lesson's reference even if the server's
 * pre-built `metadata.readUrl` is missing — which happens when the
 * Morning Prayer cache holds a slide that was assembled before the
 * server-side change shipped.
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

  // Apocrypha
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

export function bibleGatewayUrl(reference: string): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();
  if (!trimmed) return null;

  const noParens = trimmed.replace(/\([^)]*\)/g, ",").replace(/\s+/g, " ").trim();
  const cleaned = noParens.replace(/--/g, "-").replace(/[–—]/g, "-");

  const m = cleaned.match(/^([\dA-Za-z.\s]+?)\s+(\d.*)$/);
  if (!m) return null;
  const rawBook = m[1].trim();
  const range = m[2].trim();

  const expanded = expandBook(rawBook) ?? rawBook;
  const search = `${expanded} ${range}`;
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(
    search,
  )}&version=NRSVUE`;
}

function expandBook(raw: string): string | null {
  for (const [pattern, full] of BOOK_EXPANSIONS) {
    if (pattern.test(raw)) return full;
  }
  return null;
}
