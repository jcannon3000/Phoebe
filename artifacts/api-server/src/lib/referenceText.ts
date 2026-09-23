// ─── A lectionary reference, as a reference ─────────────────────────────────
//
// The Daily Office table is transcribed from the printed book, footnote marks
// and all: "Esther 4:4-17*", "Exod. 12:1-14**", "Rom. 8:1-11***". In the book
// those asterisks point at a note at the foot of the page — which verses may be
// omitted, what to read when a feast displaces the day. They are not part of
// the citation, and nothing downstream knows that:
//
//   - the passage lookup's book/locator pattern does not allow them, so
//     "Esther 4:4-17*" found nothing at all;
//   - the read link's parser does the same, so the reading had no way to open;
//   - and the title slide printed the asterisk at the reader (owner,
//     2026-09-23: "on the title slides for the scriptures in any of the
//     slideshows dont have the astixes in there").
//
// Twenty-eight readings carry one, four of them Gospels — among them Easter
// Day's John 1:1-18** and Palm Sunday's John 13:36-38**. So a reader who
// reached one of those met a reading that would not open.
//
// This strips the marks and nothing else: the parenthetical "(1:1-7)" that
// marks optional verses is left alone, because the parsers already understand
// it, and a reference with nothing but a mark is still returned empty-handed
// for the caller to skip.

/** The footnote marks the printed lectionary uses beside a citation. */
const FOOTNOTE_MARKS = /[*†‡]+/g;

/**
 * The citation alone — no footnote marks — for looking a passage up, for
 * building a link to it, and for showing it to the reader.
 */
export function cleanReference(reference: string | null | undefined): string {
  if (!reference) return "";
  return reference
    .replace(FOOTNOTE_MARKS, "")
    // The marks sit tight against the text ("4:4-17*"), but removing one can
    // leave a double space where it stood between words.
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** True when a reference carries a footnote mark — for tests and logging. */
export function hasFootnoteMark(reference: string | null | undefined): boolean {
  return !!reference && FOOTNOTE_MARKS.test(reference);
}
