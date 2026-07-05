// CobreatheHowToIntro — a one-time, three-slide "how it works" shown to a
// first-time Co-Breather AFTER they tap Begin, before the breath starts.
//
// Design: show the REAL thing, not a card describing it. Each slide renders a
// live replica of the breath UI (the two concentric rings + globe, mirrored
// from CobreatheBreath's geometry) over a full-bleed creation photo — the same
// pool the breath itself rotates through. The ring the slide is teaching GLOWS
// (the other dims); the movement slide pulses four directional arrows around
// the cluster; the final slide fades the rings away and lets the photo speak,
// with just one serif line beneath it. Text sits directly on the photo (bottom
// scrim, no card). Tap / swipe / arrow-key to advance; Skip hands off early.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

// Ring geometry — mirrored from CobreatheBreath so the intro previews the REAL
// UI at the REAL size (outer ring diameter = viewport width / 2.61, viewBox 128,
// inner ring a golden ratio smaller, same stroke weight and warm-white tones).
const RING_R = 58;
const RING_CIRC = 2 * Math.PI * RING_R;
const SESSION_R = RING_R / 1.618;
const SESSION_CIRC = 2 * Math.PI * SESSION_R;
const RING_SW = 3.36;
const RING_IN = "#EFECE4";
const RING_OUT = "#4A473F";
const RING_GLOW = "rgba(240,237,230,0.45)";
// Stronger halo for whichever ring the current slide is teaching.
const LIT_GLOW = `drop-shadow(0 0 6px rgba(240,237,230,0.95)) drop-shadow(0 0 16px rgba(240,237,230,0.5))`;

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
    body: "It fills a little with each breath — twelve make one prayer. Drag the rings anywhere on the screen that feels restful.",
  },
  {
    // The last slide is the photo itself — no eyebrow, no headline, one line.
    body: "With each breath, a new picture to rest your eyes on. Let whatever rises in your heart as you look — wonder, thanks, grief, longing — be your prayer.",
  },
];

// Same sizing rule as the breath's globe box (outer diameter = vw / 2.61, box
// = diameter × 128/116), clamped so tablets/desktop don't balloon it.
function boxFor(vw: number): number {
  return Math.round(Math.max(150, Math.min(250, (vw / 2.61) * (128 / 116))));
}

export function CobreatheHowToIntro({ onDone, photos }: { onDone: () => void; photos?: string[] }) {
  const [i, setI] = useState(0);
  const isLast = i === SLIDES.length - 1;

  // One photo per slide, drawn from the same pool the breath rotates through —
  // the intro literally previews what they'll see.
  const picks = useMemo(() => {
    const pool = [...(photos ?? [])];
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [pool[k], pool[j]] = [pool[j]!, pool[k]!];
    }
    return pool.slice(0, SLIDES.length);
  }, [photos]);

  const [box, setBox] = useState<number>(() => {
    try { return boxFor(window.innerWidth); } catch { return 170; }
  });
  useEffect(() => {
    const onResize = () => { try { setBox(boxFor(window.innerWidth)); } catch { /* ignore */ } };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Desktop keyboard nav — ArrowRight advances (finishing on the last slide),
  // ArrowLeft steps back. Bound once; functional setI so no stale index.
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

  const swipeStartX = useRef<number | null>(null);
  const advance = () => setI((n) => (n >= SLIDES.length - 1 ? (onDone(), n) : n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    const w = e.currentTarget.clientWidth;
    if (e.clientX > w / 2) advance(); else back();
  };

  const outerLit = i === 0;
  const innerLit = i === 1;
  const photo = picks.length > 0 ? picks[i % picks.length]! : null;
  const slide = SLIDES[i]!;

  return (
    <div
      onClick={onTap}
      onTouchStart={(e) => { swipeStartX.current = e.touches[0]!.clientX; }}
      onTouchEnd={(e) => {
        if (swipeStartX.current == null) return;
        const dx = e.changedTouches[0]!.clientX - swipeStartX.current;
        swipeStartX.current = null;
        if (Math.abs(dx) > 50) { if (dx < 0) advance(); else back(); }
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 95, background: "#0C1F12",
        isolation: "isolate", cursor: "pointer", display: "flex", flexDirection: "column",
        fontFamily: FONT, paddingTop: "var(--safe-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Keyframes for the teaching animations: the outer ring breathes (fills
          on the inhale, settles on the exhale) and the four drag arrows nudge
          outward. Literal circumference so the dashoffset animates cleanly. */}
      <style>{`
        @keyframes cbHowtoBreath { 0% { stroke-dashoffset: ${RING_CIRC.toFixed(2)}; } 42% { stroke-dashoffset: 0; } 58% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: ${RING_CIRC.toFixed(2)}; } }
        @keyframes cbNudgeN { 0%, 100% { transform: translate(-50%, 0); opacity: 0.5; } 50% { transform: translate(-50%, -7px); opacity: 1; } }
        @keyframes cbNudgeS { 0%, 100% { transform: translate(-50%, 0); opacity: 0.5; } 50% { transform: translate(-50%, 7px); opacity: 1; } }
        @keyframes cbNudgeW { 0%, 100% { transform: translate(0, -50%); opacity: 0.5; } 50% { transform: translate(-7px, -50%); opacity: 1; } }
        @keyframes cbNudgeE { 0%, 100% { transform: translate(0, -50%); opacity: 0.5; } 50% { transform: translate(7px, -50%); opacity: 1; } }
      `}</style>

      {/* Full-bleed creation photos — all mounted (stacked) so slide changes
          crossfade instead of flashing on load; one scrim keeps the middle
          clear for the rings and darkens the bottom for the text. The final
          slide lightens the scrim so the photo itself is the subject. */}
      {picks.map((src, idx) => (
        <img key={src} src={src} alt="" aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -2, opacity: idx === i % picks.length ? 1 : 0, transition: "opacity 0.8s ease" }} />
      ))}
      <div aria-hidden style={{
        position: "absolute", inset: 0, zIndex: -1,
        background: "linear-gradient(180deg, rgba(8,22,15,0.55) 0%, rgba(8,22,15,0.28) 34%, rgba(8,22,15,0.5) 60%, rgba(8,22,15,0.92) 100%)",
        opacity: isLast ? 0.78 : 1, transition: "opacity 0.7s ease",
      }} />

      <div className="flex justify-end px-5 pt-4">
        <button type="button" onClick={(e) => { e.stopPropagation(); onDone(); }}
          style={{ background: "none", border: "none", color: "rgba(220,228,214,0.8)", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: 6, textShadow: "0 1px 10px rgba(8,30,18,0.8)" }}>
          Skip
        </button>
      </div>

      {/* The ring cluster — the REAL breath UI, mirrored from CobreatheBreath.
          Whichever ring the slide teaches glows; on the last slide the whole
          cluster fades and the photo carries the moment. */}
      <div style={{ height: "42%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <div style={{ position: "relative", width: box, height: box, opacity: isLast ? 0 : 1, transition: "opacity 0.7s ease" }}>
          <svg aria-hidden="true" width={box} height={box} viewBox="0 0 128 128"
            style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", pointerEvents: "none", overflow: "visible" }}>
            {/* Outer ring: resting base, always there. */}
            <circle cx={64} cy={64} r={RING_R} fill="none" stroke={RING_OUT} strokeWidth={RING_SW}
              style={{ opacity: outerLit ? 0.9 : 0.3, transition: "opacity 0.5s", filter: outerLit ? `drop-shadow(0 0 4px ${RING_GLOW})` : "none" }} />
            {/* Outer ring: the light inhale fill — breathes on the first slide
                (fills in, settles out) so it teaches itself. */}
            {outerLit && (
              <circle cx={64} cy={64} r={RING_R} fill="none" stroke={RING_IN} strokeWidth={RING_SW} strokeLinecap="round" strokeOpacity={0.9}
                style={{ strokeDasharray: RING_CIRC, strokeDashoffset: RING_CIRC, animation: "cbHowtoBreath 8s ease-in-out infinite", filter: LIT_GLOW }} />
            )}
            {/* Inner session ring: faint track always; on the counting slide it
                shows a mid-prayer fill (7 of 12) and glows. */}
            <circle cx={64} cy={64} r={SESSION_R} fill="none" stroke="rgba(215,212,205,0.34)" strokeWidth={RING_SW}
              style={{ opacity: innerLit ? 1 : 0.45, transition: "opacity 0.5s" }} />
            {innerLit && (
              <circle cx={64} cy={64} r={SESSION_R} fill="none" stroke={RING_IN} strokeWidth={RING_SW} strokeLinecap="round" strokeOpacity={0.9}
                style={{ strokeDasharray: SESSION_CIRC, strokeDashoffset: SESSION_CIRC * (1 - 7 / 12), filter: LIT_GLOW }} />
            )}
          </svg>
          {/* The globe at the centre, same halo as the breath. */}
          <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", filter: "drop-shadow(0 0 13px rgba(90,150,110,0.55)) drop-shadow(0 0 14px rgba(8,30,18,0.6))" }}>
            <span style={{ fontSize: Math.round(box * 0.5), lineHeight: 1 }}>🌍</span>
          </div>
          {/* Drag arrows — only on the movement slide: four chevrons nudging
              outward on each side of the cluster. */}
          <AnimatePresence>
            {innerLit && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {([
                  { key: "n", deg: 0, style: { left: "50%", top: -34, animation: "cbNudgeN 1.8s ease-in-out infinite" } },
                  { key: "s", deg: 180, style: { left: "50%", bottom: -34, animation: "cbNudgeS 1.8s ease-in-out infinite" } },
                  { key: "w", deg: 270, style: { left: -34, top: "50%", animation: "cbNudgeW 1.8s ease-in-out infinite" } },
                  { key: "e", deg: 90, style: { right: -34, top: "50%", animation: "cbNudgeE 1.8s ease-in-out infinite" } },
                ] as Array<{ key: string; deg: number; style: React.CSSProperties }>).map((a) => (
                  <div key={a.key} style={{ position: "absolute", ...a.style }}>
                    <svg width={20} height={20} viewBox="0 0 24 24" style={{ display: "block", transform: `rotate(${a.deg}deg)`, filter: "drop-shadow(0 1px 6px rgba(8,30,18,0.8))" }}>
                      <path d="M6 14.5 L12 8.5 L18 14.5" fill="none" stroke={WARM} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Text — straight on the photo (bottom scrim carries legibility), no
          card. The last slide drops eyebrow + headline and speaks in the
          breath's own serif voice. */}
      <div className="flex-1 flex flex-col items-center px-6" style={{ width: "100%", maxWidth: 520, margin: "0 auto", paddingTop: 18 }}>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}
            className="w-full text-center">
            {slide.eyebrow && (
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", margin: 0, textShadow: "0 1px 12px rgba(8,30,18,0.85)" }}>
                {slide.eyebrow}
              </p>
            )}
            {slide.title && (
              <h2 style={{ color: WARM, fontFamily: FONT, fontSize: 24, fontWeight: 700, lineHeight: 1.25, margin: "12px 0 12px", textShadow: "0 2px 14px rgba(8,30,18,0.85)" }}>
                {slide.title}
              </h2>
            )}
            <p style={{
              color: "rgba(228,234,222,0.94)", margin: 0,
              fontFamily: isLast ? SERIF : FONT, fontStyle: isLast ? "italic" : "normal",
              fontSize: isLast ? 18 : 15.5, lineHeight: 1.6,
              textShadow: "0 2px 16px rgba(8,30,18,0.9)",
            }}>
              {slide.body}
            </p>
            {isLast && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onDone(); }}
                style={{ marginTop: 26, padding: "15px 22px", borderRadius: 16, background: "#8FAF96", border: "none", color: "#0f2417", fontSize: 16.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer", boxShadow: "0 6px 24px rgba(8,30,18,0.5)" }}>
                Begin breathing →
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-col items-center gap-2 pb-8">
        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, d) => (
            <span key={d} style={{ width: d === i ? 18 : 6, height: 6, borderRadius: 3, background: d === i ? SAGE : "rgba(143,175,150,0.35)", transition: "width 0.3s, background 0.3s" }} />
          ))}
        </div>
        {!isLast && (
          <p style={{ color: "rgba(220,228,214,0.6)", fontFamily: FONT, fontSize: 11, margin: "4px 0 0", textShadow: "0 1px 8px rgba(8,30,18,0.8)" }}>Tap to continue</p>
        )}
      </div>
    </div>
  );
}
