import { useEffect, useRef, useState } from "react";

// Phoebe standing on the bottom nav pill of a slideshow (owner, 2026-10-03: "put phoebe above
// the bottom bar ... with a rise, she takes about 2/3s of the room", then "I want her on the
// bottom of any slideshow that has room at the bottom"). Mounted beside each deck's
// nav[aria-label="Slide navigation"]. She measures the lowest thing on the slide (text,
// controls, pictures - not fixed chrome, not full-bleed backgrounds) and the top of the nav
// pill; her height is one fixed size per phone (see phoebeHeight), and when the gap is too small for her (or the
// slide scrolls past the pill) she fades out instead. She is cut at the waist in the source
// art, so she stands on the pill's top edge. Decoration only: no taps, hidden from assistive
// tech. The rise plays once, the first time she appears.
const ASPECT = 420 / 538;
const MIN_H = 90;

/**
 * ONE SIZE FOR EVERY SLIDESHOW (owner, 2026-10-04: "have them all the same
 * size, as big as they are on evening prayer" — Psalms and the Rosary were
 * standing 320px tall, nearly three times the Evening Prayer one).
 *
 * She used to take two thirds of whatever room a slide left, so the emptier the
 * intro, the bigger she was. Now her height depends only on the phone: this
 * line fits the height she had on the Evening Prayer intro at 390x844 (114px),
 * 393x852 (117) and 430x932 (144). If the Evening Prayer layout changes, re-fit
 * it. A phone too short for her (an iPhone SE: it comes out at 53) gets none,
 * as Evening Prayer did.
 */
function phoebeHeight(viewportH: number): number {
  return Math.round(0.341 * viewportH - 174);
}
/** She needs this much of her own height again as free room above the bar, or
 *  she'd stand on the text — Evening Prayer leaves 1.5x, so 1.4x is lenient. */
const ROOM_FACTOR = 1.4;

function contentBottom(navTop: number): number {
  const vh = window.innerHeight;
  let bottom = 0;
  const isFixedChrome = (el: Element | null): boolean => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.hasAttribute("data-phoebe-rise") || e.hasAttribute("data-phoebe-stand") || e.tagName === "NAV") return true;
      // Fixed CHROME is small (a header, a pill). A fixed full-screen page wrapper (lectio, the
      // psalms decks) holds the content itself, so it does not make its children chrome.
      if (getComputedStyle(e).position === "fixed" && e.getBoundingClientRect().height < vh * 0.6) return true;
    }
    return false;
  };
  const consider = (r: DOMRect, el: Element | null) => {
    if (r.width < 2 || r.height < 2 || r.bottom <= 0) return;
    if (r.height > vh * 0.6) return; // a full-bleed ground, not content
    if (isFixedChrome(el)) return;
    if (r.bottom > bottom) bottom = r.bottom;
  };
  const root = document.getElementById("root") ?? document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (!n.textContent || !n.textContent.trim()) continue;
      range.selectNodeContents(n);
      consider(range.getBoundingClientRect(), n.parentElement);
    } else {
      const el = n as Element;
      if (/^(BUTTON|IMG|SVG|VIDEO|CANVAS|IFRAME|INPUT|TEXTAREA|SELECT)$/i.test(el.tagName)) {
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        consider(el.getBoundingClientRect(), el);
      }
    }
  }
  return Math.min(bottom, navTop + 1e4);
}

export function PhoebeRise({ show = true }: { show?: boolean }) {
  const [box, setBox] = useState<{ h: number; bottom: number; room: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Hidden = no measuring at all: this sits beside every deck's nav pill, and walking the DOM
    // on every mutation of a slide she is not on is pure cost.
    if (!show) return;
    const measure = () => {
      const nav = document.querySelector('nav[aria-label="Slide navigation"]') ?? document.querySelector("[data-phoebe-stand]");
      // No slide-navigation pill (a chooser-style intro): she stands on the bottom of the screen.
      const top = nav ? (nav as HTMLElement).getBoundingClientRect().top : window.innerHeight - 8;
      const gap = top - contentBottom(top);
      const h = phoebeHeight(window.innerHeight);
      const bottom = nav ? Math.round(window.innerHeight - top + 2) : 0;
      const fits = h >= MIN_H && gap >= h * ROOM_FACTOR;
      setBox((b) => (fits ? { h, bottom, room: true } : b ? { ...b, room: false } : b));
    };
    const soon = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(measure, 80); };
    measure();
    const later = [150, 600, 1400].map((ms) => window.setTimeout(measure, ms));
    const mo = new MutationObserver(soon);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", soon);
    return () => { later.forEach(clearTimeout); window.clearTimeout(timer.current); mo.disconnect(); window.removeEventListener("resize", soon); };
  }, [show]);
  // Intro slides only (owner, 2026-10-03: "phoebe should only show up on the intro slides not
  // the slideshow itself"). Unmounting when hidden lets the rise and fade play again the next
  // time an intro appears.
  if (!show || !box) return null;
  return (
    <>
      <style>{`
        @keyframes phoebe-rise { from { opacity: 0; transform: translate(-50%, 18px); } to { opacity: 1; transform: translate(-50%, 0); } }
        /* In sooner (owner, 2026-10-04: "it needs to come in a little earlier"):
           she was fully up at about 1.8s (700ms wait + 1100ms rise); now 1.1s. */
        .phoebe-rise { animation: phoebe-rise 800ms cubic-bezier(0.22, 1, 0.36, 1) 300ms both; }
        @media (prefers-reduced-motion: reduce) { .phoebe-rise { animation: none; } }
      `}</style>
      <div
        aria-hidden
        data-phoebe-rise
        style={{
          position: "fixed", left: 0, right: 0, bottom: box.bottom, height: box.h, zIndex: 49,
          pointerEvents: "none", opacity: box.room ? 1 : 0, transition: "opacity 250ms ease",
        }}
      >
        <img
          className="phoebe-rise"
          src="/brand/phoebe-character-420.png"
          alt=""
          style={{ position: "absolute", left: "50%", bottom: 0, height: box.h, width: Math.round(box.h * ASPECT), userSelect: "none" }}
        />
      </div>
    </>
  );
}
