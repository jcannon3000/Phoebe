import { useRef, useLayoutEffect, type CSSProperties } from "react";

// A psalm / canticle hemistich that may end in the BCP pointing asterisk "*".
// Two things keep that caesura mark from being orphaned onto a line by itself
// when the first hemistich nearly fills the column:
//
//   1) The trailing " *" is bound to the preceding word with a non-breaking
//      space, so the asterisk can never wrap alone — at worst it travels to
//      the next line *with* its word.
//   2) If that would push the word+asterisk onto a new line when the rest of
//      the line fit, we instead shave a little letter-spacing (measured after
//      layout) so the whole hemistich stays on one line. Only the *minimal*
//      condense that removes the extra line is applied, and only when a small
//      squeeze (≤ 1.2px) is enough.
//
// Shared by the office's psalm slides (bcp-daily-office.tsx) and the
// standalone /psalms page (psalms.tsx) so both render the Psalter identically.
export function PointedLine({ text, style }: { text: string; style: CSSProperties }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const pointed = / \*$/.test(text);
  const bound = pointed ? text.replace(/ \*$/, " *") : text;

  // letterSpacing is owned entirely by this effect (none of the callers set
  // it), so it's tuned imperatively without fighting React.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.letterSpacing = ""; // measure at the natural spacing
    if (!pointed) return;
    const lh = parseFloat(window.getComputedStyle(el).lineHeight);
    if (!lh) return;
    const naturalLines = Math.round(el.offsetHeight / lh);
    if (naturalLines <= 1) return;
    // Shave the least letter-spacing that drops a wrapped line, so the
    // word+asterisk stays put instead of falling to the next line.
    for (let ls = 0.2; ls <= 1.2 + 1e-9; ls += 0.2) {
      el.style.letterSpacing = `-${ls.toFixed(1)}px`;
      if (Math.round(el.offsetHeight / lh) < naturalLines) return;
    }
    // Beyond the squeeze budget — leave it natural; the non-breaking space
    // still keeps the asterisk attached to its word.
    el.style.letterSpacing = "";
  }, [bound, pointed]);

  return (
    <p ref={ref} style={style}>
      {bound}
    </p>
  );
}
