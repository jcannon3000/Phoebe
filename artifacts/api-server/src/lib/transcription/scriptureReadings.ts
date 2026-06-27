// ── Scripture Day by Day — reading detection ───────────────────────────────
//
// Each daily "Scripture Day by Day" episode (Forward Movement, feed
// scripturedbd) reads four passages aloud, in this SPOKEN order:
//
//     [~10s intro]  →  OLD TESTAMENT  →  PSALM  →  NEW TESTAMENT  →  GOSPEL
//
// The episode's feed <description> lists the four citations — but in the
// READER-CREDIT order (the psalm's reader is credited first), NOT the spoken
// order. Example description:
//
//   "Readers: Psalm 107:33-43, 108, Fr. Wiley Ammons, Numbers 20:14-29,
//    The Rev. Meghan Ryan, Romans 6:1-11, Laura Di Panfilo,
//    Matthew 21:1-11, Mtr. Lisa Meirow"
//
// So we recognise the citations by their SHAPE (a known book name followed by
// chapter/verse numbers — reader NAMES never match that), classify each by its
// book into OT / Psalm / NT / Gospel, and re-order them into the spoken
// sequence. The book-based classification — not the citation's position in the
// credits — is what tells us which reading is which.

export type ReadingKind = "ot" | "psalm" | "nt" | "gospel";

export type ScriptureReading = {
  kind: ReadingKind;
  citation: string; // as printed in the feed, e.g. "Numbers 20:14-29"
};

// The four gospels.
const GOSPELS = new Set(["matthew", "mark", "luke", "john"]);

// Non-gospel New Testament books (Acts → Revelation). Anything in the NT that
// isn't a gospel is the "NT" (epistle) reading.
const NT_OTHER = new Set([
  "acts", "romans",
  "1 corinthians", "i corinthians", "2 corinthians", "ii corinthians",
  "galatians", "ephesians", "philippians", "colossians",
  "1 thessalonians", "i thessalonians", "2 thessalonians", "ii thessalonians",
  "1 timothy", "i timothy", "2 timothy", "ii timothy",
  "titus", "philemon", "hebrews", "james",
  "1 peter", "i peter", "2 peter", "ii peter",
  "1 john", "i john", "2 john", "ii john", "3 john", "iii john",
  "jude", "revelation", "revelation of john",
]);

// Every book name (+ the variants the feed might print) the citation regex is
// anchored on. Sorted longest-first so multi-word names ("Song of Solomon")
// and numbered books ("1 Corinthians") match before their shorter prefixes.
const BOOK_NAMES = [
  // Old Testament
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "I Samuel", "2 Samuel", "II Samuel",
  "1 Kings", "I Kings", "2 Kings", "II Kings",
  "1 Chronicles", "I Chronicles", "2 Chronicles", "II Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Psalm", "Proverbs", "Ecclesiastes",
  "Song of Solomon", "Song of Songs", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel",
  "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
  "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  // Apocrypha (appointed in the Daily Office lectionary)
  "Tobit", "Judith", "Wisdom", "Sirach", "Ecclesiasticus", "Baruch",
  "1 Maccabees", "2 Maccabees",
  // New Testament
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "I Corinthians", "2 Corinthians", "II Corinthians",
  "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "I Thessalonians", "2 Thessalonians", "II Thessalonians",
  "1 Timothy", "I Timothy", "2 Timothy", "II Timothy",
  "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "I Peter", "2 Peter", "II Peter",
  "1 John", "I John", "2 John", "II John", "3 John", "III John",
  "Jude", "Revelation",
].sort((a, b) => b.length - a.length);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A scripture reference: a known book name, an optional trailing period, then
// at least one number, then an optional run of chapter/verse punctuation that
// must END on a digit — so a trailing ", " before the next reader name is left
// out, while a multi-part psalm ("Psalm 107:33-43, 108") is captured whole.
const CITATION_RE = new RegExp(
  `\\b(?:${BOOK_NAMES.map(escapeRe).join("|")})\\.?\\s+\\d+(?:[\\s,:;\\-–—\\d]*\\d)?`,
  "gi",
);

function bookKey(citation: string): string {
  // Everything before the first number is the book name. Normalise: drop
  // periods, collapse spaces, lowercase. "1 Cor. 10:1-13" → "1 corinthians"
  // isn't resolved here (we keep the printed form), but "Romans 6:1-11" →
  // "romans". The classifier sets only need the printed full names the feed
  // uses; abbreviations fall through to OT, which is the safe default.
  const m = citation.match(/^(.*?)\s+\d/);
  return (m ? m[1] : citation).replace(/\./g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function classifyKind(citation: string): ReadingKind {
  const key = bookKey(citation);
  if (key === "psalm" || key === "psalms") return "psalm";
  if (GOSPELS.has(key)) return "gospel";
  if (NT_OTHER.has(key)) return "nt";
  return "ot"; // Genesis…Malachi + Apocrypha + anything unrecognised
}

// Canonical SPOKEN order of the four readings.
const KIND_ORDER: ReadingKind[] = ["ot", "psalm", "nt", "gospel"];

// Pull the episode's readings out of its feed description, returned in SPOKEN
// order (OT, Psalm, NT, Gospel) regardless of the order the feed credits them.
// Keeps the first citation seen for each kind and de-dupes the rest, so a
// stray reference in the show notes can't create a fifth "reading".
export function parseScriptureReadings(
  description: string | null | undefined,
): ScriptureReading[] {
  if (!description) return [];
  const byKind = new Map<ReadingKind, string>();
  for (const m of description.matchAll(CITATION_RE)) {
    const citation = m[0].replace(/[\s,]+$/, "").trim();
    const kind = classifyKind(citation);
    if (!byKind.has(kind)) byKind.set(kind, citation);
  }
  const out: ScriptureReading[] = [];
  for (const kind of KIND_ORDER) {
    const citation = byKind.get(kind);
    if (citation) out.push({ kind, citation });
  }
  return out;
}
