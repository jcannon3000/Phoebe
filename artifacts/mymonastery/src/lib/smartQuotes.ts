// Correct the *direction* of double quotation marks at render time.
//
// The BCP psalms and canticles are seeded from a remote source (see the
// seed script's &#8220;/&#8221; → curly-quote conversion) that sometimes
// carries reversed curly quotes — a closing ” where an opening “ belongs,
// and vice versa. Rather than re-seed the database, we re-derive each
// double quote's direction from its context: a quote that opens (at the
// start of the text, or after whitespace / an opening bracket / a dash)
// becomes a left quote “, and everything else becomes a right quote ”.
// Straight quotes (") get curled the same way. Single quotes and
// apostrophes are intentionally left untouched.
export function fixQuoteDirection(text: string): string {
  if (!text || !/["“”]/.test(text)) return text;
  return text.replace(/["“”]/g, (_m, offset: number, str: string) => {
    const prev = offset > 0 ? str[offset - 1] : "";
    return prev === "" || /[\s(\[{–—]/.test(prev) ? "“" : "”";
  });
}
