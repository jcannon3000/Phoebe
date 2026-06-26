import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { getPsalmCycle } from "@/lib/officePrefs";
import { markPsalmsPrayed } from "@/lib/cacReadState";
import type { Slide } from "@/components/MorningPrayer/types";
import { SlideView } from "@/components/MorningPrayer/Slide";
import { ProgressBar } from "@/components/MorningPrayer/ProgressBar";
import { useSlideshow } from "@/components/MorningPrayer/useSlideshow";

// ── /psalms — Praying the Psalms, as a slideshow ────────────────────────────
//
// Opens the psalms appointed for today (per the chosen cycle: the daily-office
// lectionary, or the traditional 30-day monthly Psalter) and renders them the
// SAME way the office shows its psalms — a combined title slide, then the verses
// in 4-verse chunks, then a Gloria Patri, then a concluding slide. Built on the
// office's own slide engine (SlideView / useSlideshow / ProgressBar) so the
// appearance matches exactly. Reading them marks the day's Praying-the-Psalms
// practice done (the home card flips to "Prayed").

const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
// Office palettes — morning = soil/cream, evening = deep green.
const MORNING_BG = "#2C1810";
const EVENING_BG = "#0F2818";

const GLORIA_PATRI =
  "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";

const PSALM_LOADING_QUOTES: Array<{ text: string; author: string }> = [
  { text: "My strength returns to me with my cup of coffee and the reading of the psalms.", author: "Dorothy Day" },
  { text: "In the Psalter you learn about yourself. You find depicted in it all the movements of your soul, all its changes, its ups and downs, its failures and recoveries.", author: "Athanasius" },
];

type Psalm = {
  number: number;
  title: string;
  bcpRef: string;
  content: string;
  range: [number, number] | null;
  raw: string;
};

// Replicates the server's splitPsalmIntoChunks (lib/psalmRange.ts): walk the
// pointed BCP lines, group by verse marker ("N "), keep continuation/hemistich
// lines with their verse, then slice into chunks of N verses (4, like the office).
function splitPsalmIntoChunks(content: string, versesPerChunk: number): string[] {
  const verses: string[][] = [];
  let current: string[] | null = null;
  for (const line of content.split("\n")) {
    if (/^\d+\s/.test(line)) {
      if (current) verses.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      current = [line];
    }
  }
  if (current) verses.push(current);
  const chunks: string[] = [];
  for (let i = 0; i < verses.length; i += versesPerChunk) {
    chunks.push(verses.slice(i, i + versesPerChunk).map((v) => v.join("\n")).join("\n").replace(/\s+$/, ""));
  }
  return chunks.length > 0 ? chunks : [content];
}

function blankSlide(id: string, type: Slide["type"], eyebrow: string, content: string, extra?: Partial<Slide>): Slide {
  return {
    id, type, emoji: "📖", eyebrow, title: null, content,
    isCallAndResponse: false, callAndResponseLines: null, bcpReference: null,
    isScrollable: false, scrollHint: null, metadata: {},
    ...extra,
  };
}

// Build the office-shaped slide list: ONE combined title slide, then 4-verse
// chunks across every appointed psalm (eyebrow per psalm), then a single Gloria
// sealing the whole portion — exactly how assembleMorningPrayer renders psalms.
function buildPsalmSlides(psalms: Psalm[]): Slide[] {
  if (psalms.length === 0) return [];
  const slides: Slide[] = [];
  let n = 0;
  const id = () => `psalm-${n++}`;
  const refLabel = (p: Psalm) => (p.range ? `${p.number}:${p.range[0]}-${p.range[1]}` : `${p.number}`);

  const combinedEyebrow = psalms.length === 1
    ? `PSALM ${refLabel(psalms[0])}`
    : `PSALMS ${psalms.map(refLabel).join(" & ")}`;
  const combinedTitle = psalms.length === 1
    ? (psalms[0].title || `Psalm ${refLabel(psalms[0])}`)
    : `Psalms ${psalms.map((p) => p.number).join(" & ")}`;

  // Title slide.
  slides.push(blankSlide(id(), "psalm_title", combinedEyebrow, "", {
    title: combinedTitle,
    bcpReference: psalms[0].bcpRef || null,
  }));

  // 4-verse chunks across all psalms, in sequence.
  type Chunk = { content: string; psalm: Psalm; first: boolean };
  const allChunks: Chunk[] = [];
  for (const p of psalms) {
    const chunks = splitPsalmIntoChunks(p.content, 4);
    chunks.forEach((c, i) => allChunks.push({ content: c, psalm: p, first: i === 0 }));
  }
  for (const c of allChunks) {
    slides.push(blankSlide(id(), "psalm", `Psalm ${refLabel(c.psalm)}`, c.content, {
      title: c.psalm.title || null,
      bcpReference: c.psalm.bcpRef || null,
      // The verse renderer shows metadata.psalmTitle above the first chunk.
      metadata: c.first && c.psalm.title ? { psalmTitle: c.psalm.title, psalmNumber: c.psalm.number } : { psalmNumber: c.psalm.number },
    }));
  }

  // Gloria Patri — its own slide, sealing the whole reading.
  slides.push(blankSlide(id(), "psalm_gloria", combinedEyebrow, GLORIA_PATRI, { emoji: "🎶" }));
  return slides;
}

export default function PsalmsPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const office: "morning" | "evening" = params.get("office") === "evening" ? "evening" : "morning";
  // An explicit ?cycle wins (the Daily Offices "Psalms" entry forces the office
  // lectionary); otherwise fall back to the user's saved cycle preference.
  const cycleParam = params.get("cycle");
  const cycle = cycleParam === "office" || cycleParam === "monthly" ? cycleParam : getPsalmCycle();
  const today = new Date().toLocaleDateString("en-CA");
  const BG = office === "evening" ? EVENING_BG : MORNING_BG;

  const { data, isLoading } = useQuery<{ psalms: Psalm[] }>({
    queryKey: ["/api/psalms/today", cycle, office, today],
    queryFn: () => apiRequest("GET", `/api/psalms/today?cycle=${cycle}&office=${office}&date=${today}`),
    staleTime: 30 * 60_000,
  });
  const [loadingQuote] = useState(() => PSALM_LOADING_QUOTES[Math.floor(Math.random() * PSALM_LOADING_QUOTES.length)]);

  const psalmSlides = useMemo(() => buildPsalmSlides(data?.psalms ?? []), [data]);

  // Reading is praying — mark the day done once the psalms have loaded.
  useEffect(() => {
    if (psalmSlides.length > 0) markPsalmsPrayed();
  }, [psalmSlides.length]);

  // One concluding slide after the office-shaped slides (index === length).
  const total = psalmSlides.length + 1;
  const emptyScrollable = useMemo(() => new Set<number>(), []);
  const {
    currentIndex, direction, scrollBlocked, contentRef,
    handleClick, handleTouchStart, handleTouchEnd, handleTouchMove, handleScroll,
  } = useSlideshow({ total, scrollableSlides: emptyScrollable });

  const goHome = () => setLocation("/dashboard");

  // ── Loading ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ position: "fixed", inset: 0, background: BG, display: "flex", flexDirection: "column", justifyContent: "center", padding: 32 }}>
        <p style={{ color: "#E8E4D8", fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.55, margin: 0, maxWidth: 460 }}>
          &ldquo;{loadingQuote.text}&rdquo;
        </p>
        <p style={{ color: "#8FAF96", fontFamily: FONT, fontSize: 12.5, letterSpacing: "0.04em", margin: "12px 0 0" }}>— {loadingQuote.author}</p>
        <p style={{ color: "rgba(150,140,110,0.7)", fontFamily: FONT, fontSize: 14, marginTop: 28 }}>Gathering today's psalms…</p>
      </div>
    );
  }

  // ── Empty ───────────────────────────────────────────────────────────────
  if (psalmSlides.length === 0) {
    return (
      <div style={{ position: "fixed", inset: 0, background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 32, textAlign: "center" }}>
        <p style={{ color: "#E8E4D8", fontFamily: FONT, fontSize: 16 }}>No psalms found for today. Try again shortly.</p>
        <button onClick={goHome} style={{ color: "#8FAF96", fontFamily: FONT, fontSize: 15, background: "none", border: "none", cursor: "pointer" }}>← Home</button>
      </div>
    );
  }

  const onConcluding = currentIndex >= psalmSlides.length;
  const currentSlide = onConcluding ? null : psalmSlides[currentIndex];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: BG, overflow: "hidden", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
      onClick={onConcluding ? undefined : handleClick}
      onTouchStart={onConcluding ? undefined : handleTouchStart}
      onTouchEnd={onConcluding ? undefined : handleTouchEnd}
      onTouchMove={onConcluding ? undefined : handleTouchMove}
    >
      <ProgressBar current={currentIndex} total={total} currentType={currentSlide?.type ?? "closing"} />

      {/* Slide counter (hidden on the concluding slide). */}
      {!onConcluding && (
        <div style={{ position: "fixed", top: 12, right: 16, fontSize: 12, color: office === "evening" ? "rgba(232,228,216,0.4)" : "rgba(44,24,16,0.4)", fontFamily: FONT, zIndex: 90, pointerEvents: "none" }}>
          {currentIndex + 1} of {total}
        </div>
      )}

      <style>{`
        .mp-slide-enter-forward { animation: mp-enter-forward 300ms ease forwards; }
        .mp-slide-enter-back { animation: mp-enter-back 300ms ease forwards; }
        @keyframes mp-enter-forward { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes mp-enter-back { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      `}</style>

      {currentSlide ? (
        <div
          key={currentSlide.id}
          className={direction ? (direction === "forward" ? "mp-slide-enter-forward" : "mp-slide-enter-back") : undefined}
          style={{ width: "100%", height: "100%" }}
        >
          <SlideView
            ref={contentRef}
            slide={currentSlide}
            scrollBlocked={scrollBlocked}
            onScroll={handleScroll}
            onBack={goHome}
            theme={office}
          />
        </div>
      ) : (
        // ── Concluding slide ──────────────────────────────────────────────
        <div className="mp-slide-enter-forward" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 36, textAlign: "center" }}>
          <div style={{ fontSize: 40 }} aria-hidden>🌿</div>
          <p style={{ color: "#E8E4D8", fontFamily: SERIF, fontStyle: "italic", fontSize: 19, lineHeight: 1.5, margin: 0, maxWidth: 420 }}>
            The psalms are prayed.
          </p>
          <p style={{ color: office === "evening" ? "rgba(143,175,150,0.75)" : "rgba(193,127,36,0.85)", fontFamily: FONT, fontSize: 13, letterSpacing: "0.04em", margin: 0 }}>
            {office === "evening" ? "Evening Psalms" : "Morning Psalms"}
          </p>
          <button
            onClick={goHome}
            style={{ marginTop: 12, background: office === "evening" ? "rgba(143,175,150,0.18)" : "rgba(193,127,36,0.18)", border: `1px solid ${office === "evening" ? "rgba(143,175,150,0.4)" : "rgba(193,127,36,0.5)"}`, color: "#E8E4D8", borderRadius: 999, padding: "11px 28px", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
          >
            Home
          </button>
        </div>
      )}
    </div>
  );
}
