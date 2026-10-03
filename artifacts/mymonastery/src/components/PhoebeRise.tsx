import { useLayoutEffect, useState } from "react";

// Phoebe standing on the bottom nav pill of a deck's intro slide (owner, 2026-10-03: "put
// phoebe above the bottom bar on intro pages ... with a rise, she takes about 2/3s of the
// room to the next pill above"). Her height is two thirds of the gap between the element
// marked data-phoebe-above (the last control on the slide) and the top of the slide-
// navigation pill, so she fits any phone. She is cut at the waist in the source art, so she
// stands on the pill's top edge. Decoration only: no taps, hidden from assistive tech, and
// she does not render at all when there is no anchor to measure from.
const ASPECT = 420 / 538;
const MAX_H = 320;

export function PhoebeRise() {
  const [box, setBox] = useState<{ h: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const above = document.querySelector("[data-phoebe-above]");
      const nav = document.querySelector('nav[aria-label="Slide navigation"]');
      if (!above || !nav) { setBox(null); return; }
      const top = (nav as HTMLElement).getBoundingClientRect().top;
      const gap = top - (above as HTMLElement).getBoundingClientRect().bottom;
      const h = Math.min(MAX_H, Math.floor(gap * (2 / 3)));
      setBox(h >= 80 ? { h, bottom: Math.round(window.innerHeight - top + 2) } : null);
    };
    measure();
    const timers = [120, 500, 1200].map((ms) => window.setTimeout(measure, ms));
    window.addEventListener("resize", measure);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("resize", measure); };
  }, []);
  if (!box) return null;
  return (
    <>
      <style>{`
        @keyframes phoebe-rise { from { opacity: 0; transform: translate(-50%, 18px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .phoebe-rise { animation: phoebe-rise 1100ms cubic-bezier(0.22, 1, 0.36, 1) 500ms both; }
        @media (prefers-reduced-motion: reduce) { .phoebe-rise { animation: none; } }
      `}</style>
      <img
        className="phoebe-rise"
        src="/brand/phoebe-character-420.png"
        alt=""
        aria-hidden
        style={{
          position: "fixed", left: "50%", bottom: box.bottom, height: box.h, width: Math.round(box.h * ASPECT),
          zIndex: 49, pointerEvents: "none", userSelect: "none",
        }}
      />
    </>
  );
}
