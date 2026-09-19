// ── One line that rolls through when it doesn't fit ─────────────────────────
//
// Owner, 2026-09-18, on the "Music for the sit" sheet: "have the second line
// details only be on one line and have them roll through". A wrapped detail
// line made every row a different height; one line keeps the list even, and
// the part that doesn't fit slides into view instead of being cut off.
//
// The feast eyebrow's ticker (LiturgicalDateHeader's FeastTicker), made
// reusable: measure the text against its box on mount, on font load and on
// resize. If it fits it sits still — no motion for its own sake. If it
// overflows, `.animate-feast-ticker` (index.css) holds, slides exactly the
// overflow distance, holds, and returns.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export function RollingLine({ text, style }: { text: string; style?: CSSProperties }) {
  const boxRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const span = textRef.current;
    if (!box || !span) return;
    const measure = () => {
      // 1px slack, so sub-pixel rounding never starts the animation.
      const diff = span.scrollWidth - box.clientWidth;
      setOverflowPx(diff > 1 ? diff : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(span);
    // The first paint can be in the fallback font, with different metrics.
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [text]);

  // Honour reduced motion: the line then simply ends in an ellipsis.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(mq.matches);
      const on = () => setReduced(mq.matches);
      mq.addEventListener?.("change", on);
      return () => mq.removeEventListener?.("change", on);
    } catch { return undefined; }
  }, []);

  const animate = overflowPx > 0 && !reduced;

  return (
    <span
      ref={boxRef}
      className="block min-w-0"
      style={{ ...style, overflow: "hidden", whiteSpace: "nowrap", textOverflow: reduced ? "ellipsis" : undefined }}
    >
      <span
        ref={textRef}
        className={animate ? "animate-feast-ticker" : ""}
        style={{
          display: reduced ? "inline" : "inline-block",
          ["--feast-distance" as string]: `${-overflowPx}px`,
        }}
      >
        {text}
      </span>
    </span>
  );
}
