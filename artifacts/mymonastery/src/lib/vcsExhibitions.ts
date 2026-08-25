/**
 * The Visual Commentary on Scripture — a link from today's reading to its book.
 *
 * ── Why this is a lookup table and not a crawler ──
 *
 * VCS (thevcs.org, a King's College London project) publishes expert commentary
 * on artworks, passage by passage — 1,300+ works, each exhibition tied to a
 * biblical text. Exactly the thing to send someone to after they've read the
 * lesson.
 *
 * Their images are licensed from agencies (Art Resource and the like) and the
 * commentary is the authors' own, so NONE of it can be reproduced here. Their
 * robots.txt also names and disallows the AI crawlers explicitly, and signals
 * ai-train=no. So we do not fetch, mirror, cache or catalogue their content.
 *
 * What we do is LINK — which needs nobody's permission, and which they clearly
 * want: every exhibition carries a "Cite & Share" button.
 *
 * ── Why it's book-level ──
 *
 * Individual exhibitions have opaque slugs (/vanity-vanities for Ecclesiastes
 * 1). Mapping a passage to its exhibition would take their index, which is the
 * thing we're not taking. But their BOOK pages are perfectly regular —
 * /exhibitions/{testament}/{book} — so today's reading resolves to its book's
 * page by pure function, and the reader picks from there. Coarser than
 * passage-level, and it costs nothing and can't rot.
 *
 * The slugs below are the books VCS actually covers, read off their own two
 * index pages. Books they don't cover are absent ON PURPOSE — 2 Thessalonians
 * and Philemon have no page — so a reading from one shows no link rather than a
 * dead one.
 */

const OLD_TESTAMENT: Record<string, string> = {
  "genesis": "genesis", "exodus": "exodus", "leviticus": "leviticus", "numbers": "numbers",
  "deuteronomy": "deuteronomy", "joshua": "joshua", "judges": "judges", "ruth": "ruth",
  "1 samuel": "1-samuel", "2 samuel": "2-samuel", "1 kings": "1-kings", "2 kings": "2-kings",
  "1 chronicles": "1-chronicles", "2 chronicles": "2-chronicles", "ezra": "ezra",
  "nehemiah": "nehemiah", "esther": "esther", "job": "job", "psalm": "psalms", "psalms": "psalms",
  "proverbs": "proverbs", "ecclesiastes": "ecclesiastes",
  "song of solomon": "song-solomon", "song of songs": "song-solomon", "canticles": "song-solomon",
  "isaiah": "isaiah", "jeremiah": "jeremiah", "lamentations": "lamentations", "ezekiel": "ezekiel",
  "daniel": "daniel", "hosea": "hosea", "joel": "joel", "amos": "amos", "obadiah": "obadiah",
  "jonah": "jonah", "micah": "micah", "habakkuk": "habakkuk", "haggai": "haggai",
  "zechariah": "zechariah",
  // Apocrypha — the Episcopal lectionary appoints these, so they matter here.
  "tobit": "tobit", "judith": "judith",
  "wisdom": "wisdom-solomon", "wisdom of solomon": "wisdom-solomon",
  "ecclesiasticus": "ecclesiasticus", "sirach": "ecclesiasticus",
  "1 maccabees": "1-maccabees", "2 maccabees": "2-maccabees",
  "susanna": "additions-book-daniel-susanna",
  "bel and the dragon": "additions-book-daniel-bel-and-dragon",
  "prayer of azariah": "additions-book-daniel-prayer-azariah-and-song-three-jews",
  "song of the three young men": "additions-book-daniel-prayer-azariah-and-song-three-jews",
};

const NEW_TESTAMENT: Record<string, string> = {
  "matthew": "matthew", "mark": "mark", "luke": "luke", "john": "john",
  "acts": "acts-apostles", "acts of the apostles": "acts-apostles",
  "romans": "romans", "1 corinthians": "1-corinthians", "2 corinthians": "2-corinthians",
  "galatians": "galatians", "ephesians": "ephesians", "philippians": "philippians",
  "colossians": "colossians", "1 thessalonians": "1-thessalonians",
  "1 timothy": "1-timothy", "2 timothy": "2-timothy", "titus": "titus",
  "hebrews": "hebrews", "james": "james", "1 peter": "1-peter", "2 peter": "2-peter",
  "1 john": "1-john", "2 john": "2-john", "3 john": "3-john", "jude": "jude",
  "revelation": "revelation",
  // NOT covered by VCS, and deliberately absent: 2 Thessalonians, Philemon.
};

/** Lectionary shorthand → the full name the tables above use. */
const ALIASES: Record<string, string> = {
  "gen": "genesis", "ex": "exodus", "exod": "exodus", "lev": "leviticus", "num": "numbers",
  "deut": "deuteronomy", "dt": "deuteronomy", "josh": "joshua", "judg": "judges",
  "1 sam": "1 samuel", "2 sam": "2 samuel", "1 kgs": "1 kings", "2 kgs": "2 kings",
  "1 chr": "1 chronicles", "2 chr": "2 chronicles", "neh": "nehemiah", "esth": "esther",
  "ps": "psalms", "prov": "proverbs", "eccl": "ecclesiastes", "qoheleth": "ecclesiastes",
  "song": "song of solomon", "isa": "isaiah", "jer": "jeremiah", "lam": "lamentations",
  "ezek": "ezekiel", "dan": "daniel", "hos": "hosea", "obad": "obadiah", "mic": "micah",
  "hab": "habakkuk", "hag": "haggai", "zech": "zechariah", "sir": "ecclesiasticus",
  "wis": "wisdom of solomon", "matt": "matthew", "mt": "matthew", "mk": "mark",
  "lk": "luke", "jn": "john", "rom": "romans", "1 cor": "1 corinthians",
  "2 cor": "2 corinthians", "gal": "galatians", "eph": "ephesians", "phil": "philippians",
  "col": "colossians", "1 thess": "1 thessalonians", "1 tim": "1 timothy",
  "2 tim": "2 timothy", "heb": "hebrews", "jas": "james", "1 pet": "1 peter",
  "2 pet": "2 peter", "rev": "revelation",
};

export type VcsLink = { url: string; book: string };

/**
 * The VCS page for the book a reference names, or null when there isn't one.
 *
 * Takes whatever the lectionary hands us — "John 6:52-59", "Job 6:1-4, 8-15, 21",
 * "Psalms 5 & 6", "1 Cor. 13:1-13" — and keeps only the book. Null rather than a
 * guess: a link that 404s is worse than no link, and VCS genuinely doesn't cover
 * every book.
 */
export function vcsLinkForReference(ref: string | null | undefined): VcsLink | null {
  if (!ref) return null;
  // Strip everything from the first digit that starts a chapter — but not a
  // LEADING digit, which is part of the name ("1 Samuel", "2 Corinthians").
  const cleaned = ref.trim().replace(/\s+/g, " ");
  const m = /^((?:[123]\s*)?[A-Za-z.’' ]+)/.exec(cleaned);
  if (!m) return null;
  const raw = m[1]!
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/’|'/g, "")
    .replace(/^([123])\s*/, "$1 ")
    .trim();
  const name = ALIASES[raw] ?? raw;
  const ot = OLD_TESTAMENT[name];
  if (ot) return { url: `https://thevcs.org/exhibitions/old-testament/${ot}`, book: titleCase(name) };
  const nt = NEW_TESTAMENT[name];
  if (nt) return { url: `https://thevcs.org/exhibitions/new-testament/${nt}`, book: titleCase(name) };
  return null;
}

const LOWER = new Set(["of", "the", "and"]);
function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
