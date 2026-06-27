import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// ── /vision-deck — the "technology of holding" deck ─────────────────────────
//
// A second, narrative-first deck (distinct from the parish-pitch /church-deck).
// It leads with the WHY — ritual as a technology of holding, the rule of life,
// gathering a scattered practice into one place, being held through the liminal
// seasons of a life — drawn from Jeremy's "Building a Technology of Holding"
// letter. Reached from Admin Tools. Self-contained: its own dark slide shell,
// mostly typographic (the framing is the point), no shared deps on church-deck.

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.5)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const ACCENT = "rgba(168,197,160,0.55)";

type Slide =
  | { kind: "title"; eyebrow: string; headline: string; sub: string }
  | { kind: "statement"; eyebrow?: string; headline: string; body: string[] }
  | { kind: "feature"; label: string; headline: string; body: string[] }
  | { kind: "quote"; text: string; attribution?: string }
  | { kind: "closing"; headline: string; body: string[]; featured: string };

const SLIDES: Slide[] = [
  {
    kind: "title",
    eyebrow: "Phoebe",
    headline: "A technology of holding",
    sub: "Built on monastic life and the rule of life — to help a person be held by a practice, not left to sustain it alone.",
  },
  {
    kind: "statement",
    eyebrow: "Where tools begin",
    headline: "We assume the first tools were weapons.",
    body: [
      "Spears, blades, the axe — tools for hunting and winning. It is the story we inherit, and it quietly flatters the idea that underneath everything we are conquerors.",
      "But the basket, the sling, the pouch likely came first: tools for holding, for carrying more than two hands could hold and carrying it home. They simply rotted and returned to the earth — the way things that hold tend to do.",
    ],
  },
  {
    kind: "statement",
    eyebrow: "What we lost",
    headline: "Ritual was one of those technologies of holding.",
    body: [
      "It did not only mark time. It held us inside it. Take enough rituals away and the day loses its edges — it becomes a flow, one thing running into the next, and you are carried along without being carried by anything.",
    ],
  },
  {
    kind: "quote",
    text: "Ritual is to time what a home is to space. Without it, we are not made free. We are made homeless in time.",
    attribution: "after Byung-Chul Han",
  },
  {
    kind: "statement",
    eyebrow: "The hunger",
    headline: "Inside the monastery, the day had a shape you didn't have to manage.",
    body: [
      "The bell rang and you went to the chapel. Outside those walls the shape is yours to keep or lose — and it is so easily lost, especially in a transitional season.",
      "Building Phoebe, one thread kept returning in the feedback: people wanted help building a daily habit of prayer. I was not the only one hungry for ritual.",
    ],
  },
  {
    kind: "statement",
    eyebrow: "What Phoebe is",
    headline: "A way of coming home to yourself.",
    body: [
      "Phoebe is shaped from the rule of life — to carry a person through the fragile early stretch, before a practice has aged into meaning. Not a better way to track prayer. A way to be held by it.",
    ],
  },
  {
    kind: "feature",
    label: "Shape a rule of life",
    headline: "From the Psalms to the full offices.",
    body: [
      "A short questionnaire configures your daily practice across a wide range — simply praying the Psalms, the full monastic offices, or any of the steps between — and then holds that rhythm for you.",
    ],
  },
  {
    kind: "feature",
    label: "Met however meets you",
    headline: "One office, prayed your way.",
    body: [
      "Pray Morning and Evening Prayer guided through your own Book of Common Prayer — the lectionary and psalms filled in, no flipping for the right page. Or pray it on the app. Or listen to it read aloud. Or watch it live from Washington National Cathedral.",
      "The same prayer, met in whatever way meets you that day.",
    ],
  },
  {
    kind: "feature",
    label: "Held in one place",
    headline: "Your scattered practice, gathered.",
    body: [
      "Most people already have a practice — it's just scattered across newsletters and apps. Pray the Psalms, and that day's Forward Day by Day or Center for Action and Contemplation reflection opens next, with your contemplation timer waiting right there.",
      "Whatever shape your practice takes, you can hold it in one place.",
    ],
  },
  {
    kind: "feature",
    label: "A gentle return",
    headline: "Carried back, one day at a time.",
    body: [
      "Choose a time, and Phoebe taps you on the shoulder — the gentle machinery you'd know from a reminders app. Not to manufacture a streak you feel guilty about breaking, but to carry you through the fragile beginning.",
      "A record of returning, not a score to defend.",
    ],
  },
  {
    kind: "feature",
    label: "Not alone",
    headline: "Held alongside a few others.",
    body: [
      "Keep your own prayer list, and share what you're carrying with a small circle walking the same direction — joys, sorrows, the long quiet things — and know they are being held.",
    ],
  },
  {
    kind: "quote",
    text: "The question is not how to make it sticky. It is whether our technology is ordered toward the dignity of the human person — whether it serves what makes us human rather than reshaping it.",
    attribution: "after Pope Leo XIV, on artificial intelligence",
  },
  {
    kind: "statement",
    eyebrow: "Where it matters most",
    headline: "The liminal seasons.",
    body: [
      "When the day loses its edges — a student in the transition of college, or the long quiet recovery after a serious illness, when the casseroles stop and you are standing in a life that has lost its shape at the moment you have least strength to rebuild it.",
      "Something to help you find a daily rhythm to stand on again.",
    ],
  },
  {
    kind: "statement",
    eyebrow: "The name",
    headline: "Becoming people of love, together.",
    body: [
      "The early church did not run on winning people over one by one. It was small house churches, held together and pointed the same direction, learning together how to become people of love.",
      "The deacon Phoebe, whom Paul names in his letter to the Romans, was one who held such a community together. That is where this project got its name.",
    ],
  },
  {
    kind: "closing",
    headline: "A way to be held through the seasons of a life.",
    body: [
      "Alongside a few others walking the same direction — trying together to become people of love, just as those who gathered in Deacon Phoebe's house.",
    ],
    featured: "Phoebe",
  },
];

function SlideView({ slide }: { slide: Slide }) {
  if (slide.kind === "title") {
    return (
      <div className="flex flex-col items-center text-center" style={{ gap: 18 }}>
        <p style={{ color: ACCENT, fontFamily: FONT, fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase" }}>{slide.eyebrow}</p>
        <h1 style={{ color: WARM, fontFamily: FONT, fontSize: "clamp(34px, 8vw, 60px)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", maxWidth: 640 }}>{slide.headline}</h1>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 16, lineHeight: 1.55, maxWidth: 460, marginTop: 6 }}>{slide.sub}</p>
      </div>
    );
  }
  if (slide.kind === "quote") {
    return (
      <div className="flex flex-col items-center text-center" style={{ gap: 22 }}>
        <span aria-hidden style={{ color: ACCENT, fontFamily: SERIF, fontSize: 64, lineHeight: 0.5, marginBottom: 8 }}>“</span>
        <p style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(22px, 4.5vw, 32px)", lineHeight: 1.5, maxWidth: 620, whiteSpace: "pre-line" }}>{slide.text}</p>
        {slide.attribution && (
          <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 13, letterSpacing: "0.06em", marginTop: 4 }}>— {slide.attribution}</p>
        )}
      </div>
    );
  }
  if (slide.kind === "feature") {
    return (
      <div className="flex flex-col text-left w-full" style={{ gap: 16, maxWidth: 560 }}>
        <span className="self-start" style={{ color: WARM, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", padding: "6px 14px", borderRadius: 999, background: "rgba(46,107,64,0.32)", border: `1px solid ${ACCENT}` }}>{slide.label}</span>
        <h2 style={{ color: WARM, fontFamily: FONT, fontSize: "clamp(26px, 5.5vw, 40px)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.01em" }}>{slide.headline}</h2>
        {slide.body.map((p, i) => (
          <p key={i} style={{ color: SAGE, fontFamily: FONT, fontSize: 16.5, lineHeight: 1.6 }}>{p}</p>
        ))}
      </div>
    );
  }
  if (slide.kind === "closing") {
    return (
      <div className="flex flex-col items-center text-center" style={{ gap: 20 }}>
        <h2 style={{ color: WARM, fontFamily: FONT, fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.01em", maxWidth: 600 }}>{slide.headline}</h2>
        {slide.body.map((p, i) => (
          <p key={i} style={{ color: SAGE, fontFamily: FONT, fontSize: 16.5, lineHeight: 1.6, maxWidth: 480 }}>{p}</p>
        ))}
        <p style={{ color: ACCENT, fontFamily: FONT, fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 10 }}>{slide.featured}</p>
      </div>
    );
  }
  // statement
  return (
    <div className="flex flex-col text-left w-full" style={{ gap: 16, maxWidth: 580 }}>
      {slide.eyebrow && <p style={{ color: ACCENT, fontFamily: FONT, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>{slide.eyebrow}</p>}
      <h2 style={{ color: WARM, fontFamily: FONT, fontSize: "clamp(26px, 5.5vw, 40px)", fontWeight: 700, lineHeight: 1.18, letterSpacing: "-0.01em" }}>{slide.headline}</h2>
      {slide.body.map((p, i) => (
        <p key={i} style={{ color: SAGE, fontFamily: FONT, fontSize: 16.5, lineHeight: 1.6 }}>{p}</p>
      ))}
    </div>
  );
}

export default function VisionDeck() {
  const [, setLocation] = useLocation();
  const [i, setI] = useState(0);
  const total = SLIDES.length;
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const next = () => setI((n) => Math.min(total - 1, n + 1));
  const prev = () => setI((n) => Math.max(0, n - 1));
  const close = () => setLocation("/admin/tools");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, overflow: "hidden", isolation: "isolate", display: "flex", flexDirection: "column" }}>
      {leaf && (
        <div style={{ position: "absolute", inset: 0, zIndex: -1 }}>
          <img src={leaf} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.22 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(12,31,18,0.7) 0%, rgba(12,31,18,0.55) 45%, rgba(12,31,18,0.9) 100%)" }} />
        </div>
      )}

      {/* Top bar — progress dots + close */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(1rem, env(safe-area-inset-top)) 1.25rem 0" }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxWidth: "70%" }}>
          {SLIDES.map((_, idx) => (
            <button key={idx} aria-label={`Go to slide ${idx + 1}`} onClick={() => setI(idx)}
              style={{ width: idx === i ? 22 : 7, height: 7, borderRadius: 999, background: idx === i ? ACCENT : "rgba(255,255,255,0.18)", border: "none", padding: 0, cursor: "pointer", transition: "width 0.25s, background 0.25s" }} />
          ))}
        </div>
        <button onClick={close} aria-label="Close" style={{ width: 38, height: 38, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.12)", color: WARM, border: "none", cursor: "pointer", flexShrink: 0 }}>
          <X size={19} />
        </button>
      </div>

      {/* Slide body — tap left/right halves to move */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px" }}>
        <button aria-label="Previous" onClick={prev} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "33%", background: "none", border: "none", cursor: i > 0 ? "pointer" : "default", zIndex: 1 }} />
        <button aria-label="Next" onClick={next} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "67%", background: "none", border: "none", cursor: i < total - 1 ? "pointer" : "default", zIndex: 1 }} />
        <div key={i} style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 660, display: "flex", justifyContent: "center", animation: "vd-fade 0.45s ease" }}>
          <SlideView slide={SLIDES[i]} />
        </div>
      </div>

      {/* Bottom — back / counter / next */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.5rem max(1.5rem, env(safe-area-inset-bottom))", gap: 12 }}>
        <button onClick={prev} disabled={i === 0} style={{ display: "flex", alignItems: "center", gap: 4, color: i === 0 ? "transparent" : SAGE, fontFamily: FONT, fontSize: 14, background: "none", border: "none", cursor: i === 0 ? "default" : "pointer" }}>
          <ChevronLeft size={16} /> Back
        </button>
        <span style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 12, letterSpacing: "0.1em" }}>{i + 1} / {total}</span>
        {i < total - 1 ? (
          <button onClick={next} className="active:scale-[0.97]" style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(46,107,64,0.55)", color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 600, borderRadius: 999, padding: "10px 22px", border: `1px solid ${ACCENT}`, cursor: "pointer" }}>
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={close} className="active:scale-[0.97]" style={{ background: "rgba(46,107,64,0.55)", color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 600, borderRadius: 999, padding: "10px 22px", border: `1px solid ${ACCENT}`, cursor: "pointer" }}>
            Done
          </button>
        )}
      </div>

      <style>{`@keyframes vd-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
