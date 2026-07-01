import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EARTH_PHOTOS } from "@/lib/earthPhotos";

// The opening slideshow for Co-Breathe: Laurel Kearns' "Prayer of Con-Spiring"
// read one stanza at a time, ending on the Hebrew name of God breathed in and
// out — which hands straight into the practice. This IS the intro to
// Co-Breathe; the prayer is the same source the whole practice is drawn from
// (see the note atop pages/cobreathe.tsx). Rendered as a full-screen immersive
// overlay (no app chrome), matching the breath + summary screens.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

type Slide =
  | { kind: "title" }
  | { kind: "verse"; body: string }
  | { kind: "breath" };

// The prayer, one paragraph per slide (faithful to the original — Kearns'
// spelling + punctuation kept). Each of the prayer's five paragraphs stands as
// its own slide, then the closing breath (the name of God, in and out).
const SLIDES: Slide[] = [
  { kind: "title" },
  { kind: "verse", body: "O God who is above us and below us, around us and inside us with each breath we take, we thank you for the Breath of Life. From the very beginning we are told, your Breath, your ruach, your presence enlivens the world and brings all of creation to life." },
  { kind: "verse", body: "All creatures exchange your Breath with the trees and plants, thousands of times each day, con-spiring together, breathing together, participating in an interspecies ritual of communion with you, reminding us of the sacred gift of life." },
  { kind: "verse", body: "We have been taught to recognise the body and blood of Christ in the everyday world of grains and grapes. May we now learn to sense your presence in every breath we take so that we understand that when we dirty the air, when our actions make it so others cannot breathe, when we make the creation warm too much, we stifle your presence, we defile the Breath." },
  { kind: "verse", body: "Let us vow that in our life’s limit of breaths, we make it so no one has to say, “I can’t breathe.” Let us vow that in our life’s limit of breaths our breathmates, the trees, can live and thrive." },
  { kind: "verse", body: "O God of Breath, may each breath we take together — our con-spiring with each other and the forest — may it clear our minds and hearts. May it enliven our vision with justice and compassion. May it reconnect us with the creation so that we strive to truly live in communion with all living beings on this one earth." },
  { kind: "breath" },
];

export function CobreathePrayerIntro({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const [i, setI] = useState(0);
  // A wide, calm LANDSCAPE behind the prayer (the curated earth library — no
  // close-up leaves, no animals/farm), held stable for the whole reading.
  const [bg] = useState<string | null>(() =>
    EARTH_PHOTOS.length > 0 ? EARTH_PHOTOS[Math.floor(Math.random() * EARTH_PHOTOS.length)]! : null,
  );
  const slide = SLIDES[i]!;
  const isLast = i === SLIDES.length - 1;
  const next = () => setI((n) => Math.min(SLIDES.length - 1, n + 1));
  const prev = () => setI((n) => Math.max(0, n - 1));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "radial-gradient(125% 85% at 50% 28%, #122E20 0%, #0A1C14 68%)",
        display: "flex",
        flexDirection: "column",
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* A calm landscape behind the words, with a dark overlay ON TOP so the
          prayer stays legible over any image. */}
      {bg && (
        <>
          <div
            aria-hidden
            style={{ position: "absolute", inset: 0, zIndex: -2, backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.5 }}
          />
          <div
            aria-hidden
            style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,18,12,0.55) 0%, rgba(8,18,12,0.62) 45%, rgba(8,18,12,0.78) 100%)" }}
          />
        </>
      )}

      {/* Top bar — progress dots (Skip now lives under the Next button). */}
      <div className="flex items-center px-5 pt-4" style={{ minHeight: 44 }}>
        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, n) => (
            <span
              key={n}
              style={{
                width: n === i ? 16 : 6,
                height: 6,
                borderRadius: 999,
                background: n === i ? "rgba(240,237,230,0.85)" : "rgba(143,175,150,0.35)",
                transition: "width 0.25s ease, background 0.25s ease",
              }}
            />
          ))}
        </div>
      </div>

      {/* Body — tap anywhere to advance (except the final slide, which waits for
          the Begin button). A left-edge tap steps back. */}
      <div
        onClick={isLast ? undefined : next}
        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "18px 28px", cursor: isLast ? "default" : "pointer", position: "relative", overflowY: "auto" }}
      >
        {i > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Previous"
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 64, background: "transparent", border: "none", cursor: "pointer", color: "rgba(200,212,192,0.0)" }}
          />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{ maxWidth: 480, textAlign: "center" }}
          >
            {slide.kind === "title" && (
              <>
                <p style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 22 }}>
                  A prayer to begin
                </p>
                <h1 style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(34px, 9vw, 46px)", lineHeight: 1.08, letterSpacing: "-0.02em", marginBottom: 18 }}>
                  {/* Non-breaking hyphen so "Con-Spiring" never splits across lines. */}
                  A Prayer of Con‑Spiring
                </h1>
                <p style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic", fontSize: 17 }}>
                  Laurel Kearns
                </p>
              </>
            )}

            {slide.kind === "verse" && (
              <p style={{ color: "rgba(240,237,230,0.94)", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(18px, 4.8vw, 23px)", lineHeight: 1.55 }}>
                {slide.body}
              </p>
            )}

            {slide.kind === "breath" && (
              <>
                <p style={{ color: "rgba(240,237,230,0.94)", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(20px, 5.4vw, 25px)", lineHeight: 1.6, marginBottom: 30 }}>
                  And so, with each breath —
                </p>
                <p style={{ color: "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK, fontSize: 13, marginBottom: 14 }}>
                  the name of God, breathed in and breathed out
                </p>
                <motion.div
                  animate={{ opacity: [0.55, 1, 0.55] }}
                  transition={{ duration: 5.5, ease: "easeInOut", repeat: Infinity }}
                  style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(30px, 8vw, 42px)", letterSpacing: "0.12em", lineHeight: 1.25, marginBottom: 30 }}
                >
                  YAHHH<br />WEHHH
                </motion.div>
                <p style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic", fontSize: 18, marginBottom: 34 }}>
                  We remember that life is sacred.
                </p>
                <button
                  type="button"
                  onClick={onDone}
                  className="rounded-2xl py-4 px-10 transition-opacity hover:opacity-90 active:scale-[0.99]"
                  style={{ background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(168,197,160,0.5)", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 700, cursor: "pointer" }}
                >
                  Continue
                </button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls — a Next pill with Skip text under it (the final slide uses its
          own "Begin breathing" button inside the slide, so no controls here). */}
      <div className="flex flex-col items-center gap-2.5 pb-7" style={{ minHeight: 80 }}>
        {!isLast && (
          <>
            <button
              type="button"
              onClick={next}
              className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(168,197,160,0.5)", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
            >
              Next
            </button>
            <button
              type="button"
              onClick={onSkip}
              style={{ color: "rgba(200,212,192,0.65)", fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer", padding: "2px 8px" }}
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
