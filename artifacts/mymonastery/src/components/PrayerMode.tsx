import { useState, useEffect } from "react";
import { findBcpPrayer } from "@/lib/bcp-prayers";

const CLOSING_COLLECT =
  "Keep watch, dear Lord, with those who work, or watch, or weep this night, and give thine angels charge over those who sleep. Tend the sick, Lord Christ; give rest to the weary, bless the dying, soothe the suffering, pity the afflicted, shield the joyous; and all for thy love's sake.";

interface PrayerSlide {
  kind: "intercession" | "request";
  text: string;
  attribution: string;
}

function SlideContent({ slide, onAdvance }: { slide: PrayerSlide; onAdvance: () => void }) {
  const bcpPrayer = slide.kind === "intercession" ? findBcpPrayer(slide.text) : undefined;

  return (
    <div className="w-full flex flex-col items-center text-center gap-5">
      {/* Kind label */}
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        {slide.kind === "intercession" ? "Your Intercession" : "Prayer Request"}
      </p>

      {/* Topic / intention title */}
      <p
        className="text-[22px] leading-[1.5] font-medium italic"
        style={{
          color: "#E8E4D8",
          fontFamily: "Playfair Display, Georgia, serif",
        }}
      >
        {slide.text}
      </p>

      {/* Attribution */}
      {slide.attribution && (
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          {slide.attribution}
        </p>
      )}

      {/* BCP prayer text card */}
      {bcpPrayer && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(92,122,95,0.15)",
          }}
        >
          <p
            className="text-[13px] leading-[1.85] italic"
            style={{
              color: "#C8D4C0",
              fontFamily: "Playfair Display, Georgia, serif",
            }}
          >
            {bcpPrayer.text}
          </p>
          <p
            className="text-[9px] uppercase tracking-[0.14em] mt-3"
            style={{ color: "rgba(143,175,150,0.3)" }}
          >
            From the Book of Common Prayer
          </p>
        </div>
      )}

      {/* Amen button */}
      <button
        onClick={onAdvance}
        className="mt-4 px-8 py-3 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-80 active:scale-[0.98]"
        style={{
          background: "rgba(46,107,64,0.28)",
          border: "1px solid rgba(46,107,64,0.5)",
          color: "#C8D4C0",
        }}
      >
        Amen →
      </button>
    </div>
  );
}

interface PrayerModeProps {
  intercessions: Array<{ intention: string; withName: string }>;
  prayerRequests: Array<{ body: string; fromName: string }>;
  onClose: () => void;
  onComplete: () => void;
}

export function PrayerMode({ intercessions, prayerRequests, onClose, onComplete }: PrayerModeProps) {
  const slides: PrayerSlide[] = [
    ...intercessions.map((i) => ({
      kind: "intercession" as const,
      text: i.intention,
      attribution: i.withName ? `with ${i.withName}` : "",
    })),
    ...prayerRequests.map((r) => ({
      kind: "request" as const,
      text: r.body,
      attribution: r.fromName ? `from ${r.fromName}` : "from someone",
    })),
  ];

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"prayer" | "closing">(slides.length === 0 ? "closing" : "prayer");
  const [visible, setVisible] = useState(false);
  const [slideVisible, setSlideVisible] = useState(true);

  // Fade the whole overlay in on mount; lock scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => setVisible(true), 30);
    return () => {
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, []);

  const handleDone = () => {
    setVisible(false);
    setTimeout(onComplete, 500);
  };

  const advance = () => {
    setSlideVisible(false);
    setTimeout(() => {
      if (index < slides.length - 1) {
        setIndex((i) => i + 1);
      } else {
        setPhase("closing");
      }
      setSlideVisible(true);
    }, 220);
  };

  const slide = slides[index];

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{
        background: "#0C1F12",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}
    >
      {/* Exit button */}
      <button
        onClick={onClose}
        aria-label="Exit prayer mode"
        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full z-10 text-xl"
        style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
      >
        ×
      </button>

      {/* Scroll container — flex-1 so it fills between × and progress */}
      <div className="flex-1 overflow-y-auto">
        {/* Inner wrapper: min-h-full + justify-center keeps content vertically centered
            when short, and lets it scroll naturally when tall */}
        <div
          className="min-h-full flex flex-col items-center justify-center px-8 py-16 w-full"
          style={{ maxWidth: 560, margin: "0 auto" }}
        >
        {phase === "prayer" && slide && (
          <div
            className="w-full"
            style={{
              opacity: slideVisible ? 1 : 0,
              transition: "opacity 0.22s ease",
            }}
          >
            <SlideContent slide={slide} onAdvance={advance} />
          </div>
        )}

        {phase === "closing" && (
          <div
            className="w-full flex flex-col items-center text-center gap-8"
            style={{
              opacity: slideVisible ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            {/* BCP closing collect */}
            <p
              className="text-[15px] leading-[2] italic"
              style={{
                color: "#C8D4C0",
                fontFamily: "Playfair Display, Georgia, serif",
              }}
            >
              {CLOSING_COLLECT}
            </p>

            <p
              className="text-[10px] uppercase tracking-[0.14em]"
              style={{ color: "rgba(143,175,150,0.32)" }}
            >
              From the Book of Common Prayer · Compline
            </p>

            <div className="h-px w-12" style={{ background: "rgba(200,212,192,0.15)" }} />

            {/* Closing line */}
            <p
              className="text-base leading-relaxed"
              style={{
                color: "#8FAF96",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              You have carried what your community is carrying. 🌿
            </p>

            {/* Done button */}
            <button
              onClick={handleDone}
              className="mt-2 px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{
                background: "#2D5E3F",
                color: "#F0EDE6",
              }}
            >
              Done
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Progress indicator */}
      {phase === "prayer" && slides.length > 0 && (
        <div className="pb-12 flex justify-center">
          <p
            className="text-xs"
            style={{ color: "rgba(143,175,150,0.32)", letterSpacing: "0.06em" }}
          >
            {index + 1} of {slides.length}
          </p>
        </div>
      )}
    </div>
  );
}
