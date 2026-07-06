// CobreatheHowToIntro — a one-time, three-slide "how it works" shown to a
// first-time Co-Breather AFTER they tap Begin, before the breath starts.
//
// Styled to MATCH the Laurel Kearns prayer intro (CobreathePrayerIntro): a
// per-slide landscape at 0.22 under the same heavy dark wash, content
// vertically centered, and the office-style bottom controls (an "X of Y"
// counter, a frosted Next pill, and Skip). The two ring slides render a LIVE
// replica of the breath cluster driven by the SAME rAF formulas as the real
// practice — both strokes draw FORWARD (never rewind), a symmetric 6s in / 6s
// out, the inner session ring filling once across a full prayer — so it moves
// at the real speed and direction. Whichever ring the slide teaches GLOWS. The
// final slide is just the invitation, centered, with Begin breathing.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CYCLE_MS } from "@/components/CobreatheBreath";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

// Ring geometry + tones, mirrored from CobreatheBreath so the preview matches
// the real UI exactly.
const RING_R = 58;
const RING_CIRC = 2 * Math.PI * RING_R;
const SESSION_R = RING_R / 1.618;
const SESSION_CIRC = 2 * Math.PI * SESSION_R;
const RING_SW = 3.36;
const RING_IN = "#EFECE4";   // light warm-white — the inhale fill
const RING_OUT = "#4A473F";  // dark base / exhale sweep
const RING_GLOW = "rgba(240,237,230,0.45)";
const LIT_GLOW = "drop-shadow(0 0 6px rgba(240,237,230,0.95)) drop-shadow(0 0 15px rgba(240,237,230,0.55))";

type Slide = { eyebrow?: string; title?: string; body: string };

const SLIDES: Slide[] = [
  {
    eyebrow: "Breathing together",
    title: "Follow the outer ring",
    body: "It rises as you breathe in and settles as you breathe out. And everyone praying right now shares the same timer — you breathe together, as one.",
  },
  {
    eyebrow: "Twelve breaths",
    title: "The inner ring counts them",
    body: "It fills a little with each breath — twelve make one prayer.",
  },
  {
    // Last slide — just the invitation, centered. No eyebrow, no headline.
    body: "With each breath, a new picture to rest your eyes on. Let whatever rises in your heart as you look — wonder, thanks, grief, longing — be your prayer.",
  },
];

// Box size for the ring cluster — same rule as the breath's globe box (outer
// diameter = viewport width / 2.61, box = diameter × 128/116), clamped.
function boxFor(vw: number): number {
  return Math.round(Math.max(150, Math.min(240, (vw / 2.61) * (128 / 116))));
}

// A live replica of the breath cluster. Driven by a rAF clock using the SAME
// formulas as CobreatheBreath: on the inhale the light stroke draws forward and
// holds; on the exhale the dark stroke draws forward over it (never rewinds);
// the inner session ring fills once across a full prayer (12 breaths). The ring
// the slide teaches glows (`outerLit` / `innerLit`); the other dims but keeps
// breathing, exactly as in the real practice.
function RingCluster({ box, outerLit, innerLit }: { box: number; outerLit: boolean; innerLit: boolean }) {
  const lightRef = useRef<SVGCircleElement>(null);
  const darkRef = useRef<SVGCircleElement>(null);
  const sessRef = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const HALF = CYCLE_MS / 2;          // symmetric inhale / exhale
    const PRAYER = 12 * CYCLE_MS;       // the session ring fills once over 12 breaths
    const loop = (t: number) => {
      if (start === null) start = t;
      const el = t - start;
      const pos = el % CYCLE_MS;
      const inhale = pos < HALF;
      const fIn = inhale ? pos / HALF : 1;                 // light fills forward, holds
      const fOut = inhale ? 0 : (pos - HALF) / HALF;       // dark sweeps forward over it
      if (lightRef.current) lightRef.current.style.strokeDashoffset = (RING_CIRC * (1 - fIn)).toFixed(2);
      if (darkRef.current) darkRef.current.style.strokeDashoffset = (RING_CIRC * (1 - fOut)).toFixed(2);
      const sFrac = (el % PRAYER) / PRAYER;
      if (sessRef.current) sessRef.current.style.strokeDashoffset = (SESSION_CIRC * (1 - sFrac)).toFixed(2);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div style={{ position: "relative", width: box, height: box }}>
      <svg aria-hidden="true" width={box} height={box} viewBox="0 0 128 128"
        style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", overflow: "visible", pointerEvents: "none" }}>
        {/* Outer resting base. */}
        <circle cx={64} cy={64} r={RING_R} fill="none" stroke={RING_OUT} strokeWidth={RING_SW}
          style={{ opacity: outerLit ? 0.9 : 0.32, transition: "opacity 0.5s", filter: outerLit ? `drop-shadow(0 0 4px ${RING_GLOW})` : "none" }} />
        {/* Light inhale fill — draws forward, holds full. */}
        <circle ref={lightRef} cx={64} cy={64} r={RING_R} fill="none" stroke={RING_IN} strokeWidth={RING_SW} strokeLinecap="round"
          style={{ strokeDasharray: RING_CIRC, strokeDashoffset: RING_CIRC, opacity: outerLit ? 1 : 0.32, transition: "opacity 0.5s", filter: outerLit ? LIT_GLOW : `drop-shadow(0 0 3px ${RING_GLOW})` }} />
        {/* Dark exhale sweep — draws forward over the light, never rewinds. */}
        <circle ref={darkRef} cx={64} cy={64} r={RING_R} fill="none" stroke={RING_OUT} strokeWidth={RING_SW} strokeLinecap="round"
          style={{ strokeDasharray: RING_CIRC, strokeDashoffset: RING_CIRC, opacity: outerLit ? 0.9 : 0.3, transition: "opacity 0.5s" }} />
        {/* Inner session track + fill. */}
        <circle cx={64} cy={64} r={SESSION_R} fill="none" stroke="rgba(215,212,205,0.34)" strokeWidth={RING_SW}
          style={{ opacity: innerLit ? 1 : 0.4, transition: "opacity 0.5s" }} />
        <circle ref={sessRef} cx={64} cy={64} r={SESSION_R} fill="none" stroke={RING_IN} strokeWidth={RING_SW} strokeLinecap="round"
          style={{ strokeDasharray: SESSION_CIRC, strokeDashoffset: SESSION_CIRC, opacity: innerLit ? 1 : 0.32, transition: "opacity 0.5s", filter: innerLit ? LIT_GLOW : "none" }} />
      </svg>
      <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", filter: "drop-shadow(0 0 13px rgba(90,150,110,0.55)) drop-shadow(0 0 14px rgba(8,30,18,0.6))" }}>
        <span style={{ fontSize: Math.round(box * 0.5), lineHeight: 1 }}>🌍</span>
      </div>
    </div>
  );
}

// Per-slide backdrop — a landscape at 0.22 that fades in on load, matching the
// Laurel Kearns intro (office look).
function Backdrop({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img src={src} alt="" aria-hidden onLoad={() => setLoaded(true)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 0.22 : 0, transition: "opacity 0.6s ease", zIndex: -1 }} />
  );
}

export function CobreatheHowToIntro({ onDone, photos }: { onDone: () => void; photos?: string[] }) {
  const [i, setI] = useState(0);
  const slide = SLIDES[i]!;
  const isLast = i === SLIDES.length - 1;

  const [box, setBox] = useState<number>(() => { try { return boxFor(window.innerWidth); } catch { return 170; } });
  useEffect(() => {
    const onResize = () => { try { setBox(boxFor(window.innerWidth)); } catch { /* ignore */ } };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const pool = photos && photos.length > 0 ? photos : [];
  const photo = pool.length > 0 ? pool[i % pool.length]! : null;

  const next = () => setI((n) => (n >= SLIDES.length - 1 ? (onDone(), n) : n + 1));
  const prev = () => setI((n) => Math.max(0, n - 1));

  // Desktop keyboard nav — mirrors tap-forward / left-edge back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); setI((n) => (n >= SLIDES.length - 1 ? (onDone(), n) : n + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const outerLit = i === 0;
  const innerLit = i === 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 95, background: "#0C1F12", isolation: "isolate", fontFamily: FONT }}>
      {photo && (
        <>
          <Backdrop key={photo} src={photo} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
        </>
      )}

      {/* Content — vertically centered, same wrapper metrics the Kearns intro
          uses (max-width 560, bottom band reserved for the controls). Tap
          anywhere advances (except the last slide, which waits for Begin); the
          left-edge strip steps back. */}
      <div
        onClick={isLast ? undefined : next}
        className="flex flex-col items-center text-center px-6 w-full"
        style={{
          maxWidth: 560, margin: "0 auto", minHeight: "100dvh", justifyContent: "center",
          paddingTop: "clamp(24px, 6dvh, 72px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 168px)",
          cursor: isLast ? "default" : "pointer", position: "relative",
        }}
      >
        {i > 0 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous"
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 64, background: "transparent", border: "none", cursor: "pointer" }} />
        )}

        {/* The ring cluster stays mounted across the two ring slides (no
            flicker); the glow shifts from outer → inner. Gone on the last slide
            so the invitation centers on its own. */}
        {!isLast && (
          <div style={{ marginBottom: 34 }}>
            <RingCluster box={box} outerLit={outerLit} innerLit={innerLit} />
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ maxWidth: 480, textAlign: "center" }}>
            {slide.eyebrow && (
              <p style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
                {slide.eyebrow}
              </p>
            )}
            {slide.title && (
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 16 }}>
                {slide.title}
              </h2>
            )}
            <p style={{
              color: isLast ? "rgba(240,237,230,0.94)" : "rgba(240,237,230,0.86)", margin: 0,
              fontFamily: isLast ? SERIF : FONT, fontStyle: isLast ? "italic" : "normal",
              fontSize: isLast ? "clamp(19px, 4.8vw, 24px)" : "clamp(15.5px, 4.2vw, 18px)", lineHeight: isLast ? 1.6 : 1.55,
            }}>
              {slide.body}
            </p>
            {isLast && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onDone(); }}
                className="rounded-2xl py-4 px-10 transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ marginTop: 34, background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(168,197,160,0.5)", color: WARM, fontFamily: FONT, fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
                Begin breathing →
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls — the office's "X of Y" counter, a Next pill, and Skip
          beneath. Hidden on the last slide (it advances via its own Begin). */}
      <div className="absolute left-0 right-0 flex flex-col items-center" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }}>
        <p className="text-xs" style={{ color: "rgba(143,175,150,0.32)", letterSpacing: "0.06em", fontFamily: FONT, marginBottom: 16 }}>
          {i + 1} of {SLIDES.length}
        </p>
        {!isLast && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); next(); }}
              className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(168,197,160,0.5)", color: WARM, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
              Next
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onDone(); }}
              style={{ color: "rgba(200,212,192,0.65)", fontFamily: FONT, fontSize: 13, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer", padding: "2px 8px" }}>
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
