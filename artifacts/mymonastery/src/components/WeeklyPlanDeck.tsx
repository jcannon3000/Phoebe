/**
 * WeeklyPlanDeck — the member-facing player for a leader-authored weekly-plan
 * slideshow (kind "deck", behind WEEKLY_PLAN_ENABLED). A near-copy of the
 * Laurel Kearns Co-Breathe intro's form (CobreathePrayerIntro): full-screen,
 * per-slide landscape at 0.22 under the dark wash, centered serif text,
 * tap-to-advance + left-edge back + swipe, "X of Y" counter with a Next pill.
 *
 * Differences from the intro:
 *   • An auto-generated title slide (group name eyebrow · item title · the
 *     grace-first "N slides · about a minute" byline).
 *   • The last slide's pill reads "Amen" — tapping it COMPLETES the item
 *     (the office's amen-seals-the-prayer pattern). "Not now" exits without
 *     credit; the deck is re-openable anytime.
 *   • The ⚙ office display prefs apply: text size (fontScaleWrapStyle),
 *     backdrop (plain/paper → no photo), typeface.
 *
 * Also used by the composer's Preview (draft slides passed straight in, with
 * onAmen doing nothing but closing).
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2 } from "lucide-react";
import { EARTH_PHOTOS } from "@/lib/earthPhotos";
import { OfficeDisplaySheet, useOfficeDisplay, fontScaleWrapStyle } from "@/components/OfficeDisplaySheet";
import { officeThemeStyle } from "@/lib/officeDisplay";
import { slideTypeMeta, deckByline, type WeeklyDeckSlide } from "@/lib/weeklyDeck";

const WARM = "var(--oh-ink, #F0EDE6)";
const SAGE = "var(--oh-sage, #8FAF96)";
const BODY = "rgba(var(--ot-ink3, 240,237,230),0.94)";
const SPACE_GROTESK = "var(--office-font, 'Space Grotesk', system-ui, sans-serif)";
const SERIF = "Georgia, serif";

function DeckBackdropPhoto({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      onLoad={() => setLoaded(true)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 0.22 : 0, transition: "opacity 0.6s ease", zIndex: -1 }}
    />
  );
}

function SlideBody({ slide }: { slide: WeeklyDeckSlide }) {
  const eyebrow = (
    <p style={{ color: "rgba(var(--ot-sage, 143,175,150),0.7)", fontFamily: SPACE_GROTESK, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 22 }}>
      {slideTypeMeta(slide.type).eyebrow}
    </p>
  );
  switch (slide.type) {
    case "teaching":
      return (
        <>
          {eyebrow}
          {slide.heading && (
            <h2 style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(20px, 5.6vw, 30px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 16 }}>
              {slide.heading}
            </h2>
          )}
          <p style={{ color: BODY, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(18px, 4.8vw, 23px)", lineHeight: 1.55 }}>
            {slide.body}
          </p>
        </>
      );
    case "scripture":
      return (
        <>
          {eyebrow}
          <p style={{ color: BODY, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(18px, 4.8vw, 23px)", lineHeight: 1.55, marginBottom: 18 }}>
            {slide.passage}
          </p>
          <p style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic", fontSize: 17 }}>{slide.citation}</p>
        </>
      );
    case "question":
      return (
        <>
          {eyebrow}
          <p style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 600, fontSize: "clamp(22px, 6vw, 30px)", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
            {slide.question}
          </p>
        </>
      );
    case "prompt":
      return (
        <>
          {eyebrow}
          <p style={{ color: BODY, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(19px, 5vw, 24px)", lineHeight: 1.55 }}>
            {slide.action}
          </p>
          {slide.hint && (
            <p style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 14, marginTop: 16 }}>{slide.hint}</p>
          )}
        </>
      );
    case "song":
      return (
        <>
          {eyebrow}
          <h2 style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(22px, 6.2vw, 34px)", lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: 12 }}>
            {slide.title}
          </h2>
          {slide.artist && (
            <p style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic", fontSize: 17, marginBottom: slide.note ? 16 : 0 }}>{slide.artist}</p>
          )}
          {slide.note && (
            <p style={{ color: BODY, fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.5 }}>{slide.note}</p>
          )}
          {slide.link && (
            <a
              href={slide.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-full mt-6 py-2.5 px-6"
              style={{ background: "rgba(var(--ot-deep, 9,26,16),0.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(var(--ot-fern, 168,197,160),0.5)", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 700, textDecoration: "none" }}
            >
              Listen ↗
            </a>
          )}
        </>
      );
    case "reflection":
      return (
        <>
          {eyebrow}
          <p style={{ color: BODY, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(20px, 5.4vw, 25px)", lineHeight: 1.6 }}>
            {slide.body}
          </p>
        </>
      );
  }
}

export function WeeklyPlanDeck({
  title,
  groupName,
  slides,
  onAmen,
  onClose,
  amenLabel = "Amen",
}: {
  title: string;
  groupName: string | null;
  slides: WeeklyDeckSlide[];
  /** The last slide's pill — completes the item (or just closes, in Preview). */
  onAmen: () => void;
  onClose: () => void;
  amenLabel?: string;
}) {
  // Index 0 is the auto title slide; authored slides follow.
  const total = slides.length + 1;
  const [i, setI] = useState(0);
  const isLast = i === total - 1;
  const display = useOfficeDisplay();
  const [displayOpen, setDisplayOpen] = useState(false);
  const photoless = display.backdrop === "plain" || display.backdrop === "paper";
  const photo = !photoless && EARTH_PHOTOS.length > 0 ? EARTH_PHOTOS[i % EARTH_PHOTOS.length]! : null;
  const next = () => setI((n) => Math.min(total - 1, n + 1));
  const prev = () => setI((n) => Math.max(0, n - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); setI((n) => Math.min(total - 1, n + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // Swipe left → next, right → prev — same thresholds as the office deck.
  const swipeX = useRef<number | null>(null);
  const swipeY = useRef<number | null>(null);

  const slide = i === 0 ? null : slides[i - 1]!;

  return (
    <div
      onTouchStart={(e) => { swipeX.current = e.touches[0].clientX; swipeY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        if (swipeX.current === null || swipeY.current === null) return;
        const dx = e.changedTouches[0].clientX - swipeX.current;
        const dy = e.changedTouches[0].clientY - swipeY.current;
        swipeX.current = null; swipeY.current = null;
        if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) return;
        if (dx < 0) next(); else prev();
      }}
      style={{
        ...officeThemeStyle(display.backdrop, display.font),
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "var(--oh-bg, #0C1F12)",
        isolation: "isolate",
      }}
    >
      {photo && (
        <>
          <DeckBackdropPhoto key={photo} src={photo} />
          <div
            aria-hidden
            style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(var(--ot-wash, 8,22,15),0.62) 0%, rgba(var(--ot-wash, 8,22,15),0.80) 52%, rgba(var(--ot-wash, 8,22,15),0.90) 100%)" }}
          />
        </>
      )}

      {/* Exit ✕ + display ⚙ — the office deck's header pair. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-5 w-10 h-10 flex items-center justify-center rounded-full z-10 text-xl"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)", color: "rgba(var(--ot-mist, 200,212,192),0.5)", background: "rgba(var(--ot-mist, 200,212,192),0.06)", border: "none", cursor: "pointer" }}
      >
        ×
      </button>
      <button
        type="button"
        onClick={() => setDisplayOpen(true)}
        aria-label="Display settings"
        className="absolute w-10 h-10 flex items-center justify-center rounded-full z-10"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)", right: "calc(1.25rem + 48px)", color: "rgba(var(--ot-mist, 200,212,192),0.5)", background: "rgba(var(--ot-mist, 200,212,192),0.06)", border: "none", cursor: "pointer" }}
      >
        <Settings2 size={16} />
      </button>
      <OfficeDisplaySheet open={displayOpen} onClose={() => setDisplayOpen(false)} />

      <div
        onClick={isLast ? undefined : next}
        className="flex flex-col items-center text-center px-6 w-full"
        style={{
          ...fontScaleWrapStyle(display.fontScale, 560),
          margin: "0 auto",
          minHeight: "100dvh",
          justifyContent: "center",
          paddingTop: "clamp(24px, 6dvh, 72px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 168px)",
          cursor: isLast ? "default" : "pointer",
          position: "relative",
        }}
      >
        {i > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Previous"
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 64, background: "transparent", border: "none", cursor: "pointer", color: "transparent" }}
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
            {slide === null ? (
              <>
                {groupName && (
                  <p style={{ color: "rgba(var(--ot-sage, 143,175,150),0.7)", fontFamily: SPACE_GROTESK, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 22 }}>
                    {groupName}
                  </p>
                )}
                <h1 style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(22px, 6.2vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: 18 }}>
                  {title}
                </h1>
                <p style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic", fontSize: 17 }}>
                  {deckByline(slides.length)}
                </p>
              </>
            ) : (
              <SlideBody slide={slide} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom band — counter + Next / Amen pill + "Not now". */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }}
      >
        <p className="text-xs" style={{ color: "rgba(var(--ot-sage, 143,175,150),0.32)", letterSpacing: "0.06em", fontFamily: SPACE_GROTESK, marginBottom: 16 }}>
          {i + 1} of {total}
        </p>
        <button
          type="button"
          onClick={isLast ? onAmen : next}
          className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{ background: isLast ? "rgba(var(--ot-green, 46,107,64),0.85)" : "rgba(var(--ot-deep, 9,26,16),0.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(var(--ot-fern, 168,197,160),0.5)", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}
        >
          {isLast ? amenLabel : "Next"}
        </button>
        {!isLast && (
          <button
            type="button"
            onClick={onClose}
            style={{ color: "rgba(var(--ot-mist, 200,212,192),0.65)", fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer", padding: "2px 8px" }}
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
