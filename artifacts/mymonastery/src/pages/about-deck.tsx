// About deck — a short, swipeable slideshow of the About page (the product
// description), with little phone mockups. Self-contained; matches the app's
// deck look (dark leaf backdrop, Space Grotesk, sage accents). Route: /about-deck.
import { useState, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const C = {
  bg: "#091A10",
  text: "#F0EDE6",
  sage: "#8FAF96",
  font: "'Space Grotesk', system-ui, sans-serif",
} as const;
const SERIF = "Georgia, 'Times New Roman', serif";

type MockKind = "gather" | "configure" | "office" | "rhythm";
type Slide =
  | { kind: "title"; eyebrow?: string; headline: string; sub?: string }
  | { kind: "statement"; body: string }
  | { kind: "demo"; label: string; headline: string; mock: MockKind };

const SLIDES: Slide[] = [
  { kind: "title", eyebrow: "About", headline: "Phoebe", sub: "An app for cultivating a daily practice of prayer." },
  { kind: "statement", body: "It brings together resources from across the Episcopal Church and beyond into one seamless routine — with the modern tools to help you build it, and hold it." },
  { kind: "demo", label: "One place", headline: "Resources from across the Episcopal Church and beyond, gathered into one routine.", mock: "gather" },
  { kind: "demo", label: "Your rhythm", headline: "Shape your own rhythm — from simply praying the Psalms to the full Daily Office.", mock: "configure" },
  { kind: "demo", label: "However it meets you", headline: "Pray it your way: your own Book of Common Prayer, the app, audio, or a cathedral broadcast.", mock: "office" },
  { kind: "demo", label: "Held together", headline: "The offices, a daily reflection, a few minutes of silence — held in one place.", mock: "rhythm" },
  { kind: "statement", body: "It keeps the depth of the tradition intact, and simply changes how it reaches you — meeting you in the busy, dispersed life you actually live." },
  { kind: "title", eyebrow: "The name", headline: "Phoebe", sub: "Named for the deacon Phoebe, who carried Paul’s letter to the Romans — entrusted to bring the word to where it needed to go." },
];

export default function AboutDeckPage() {
  const [, setLocation] = useLocation();
  const [i, setI] = useState(0);
  const bg = useMemo(() => (LEAF_PHOTOS.length ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)] : null), []);

  const go = useCallback((n: number) => setI(() => Math.max(0, Math.min(SLIDES.length - 1, n))), []);
  const prev = useCallback(() => go(i - 1), [go, i]);
  const next = useCallback(() => go(i + 1), [go, i]);
  const close = useCallback(() => setLocation("/about"), [setLocation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, close]);

  const onDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -60) next();
    else if (info.offset.x > 60) prev();
  };

  const slide = SLIDES[i]!;
  const atEnd = i === SLIDES.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, color: C.text, fontFamily: C.font, overflow: "hidden", zIndex: 60 }}>
      {bg && (
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.16, filter: "blur(2px)" }} />
      )}
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 0%, rgba(9,26,16,0.25), rgba(9,26,16,0.94))" }} />

      <button onClick={close} aria-label="Close" style={{ position: "absolute", top: "max(14px, env(safe-area-inset-top))", right: 16, zIndex: 4, width: 40, height: 40, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.32)", border: "1px solid rgba(143,175,150,0.3)", color: C.text, cursor: "pointer" }}>
        <X size={20} />
      </button>

      <div style={{ position: "absolute", top: "max(20px, calc(env(safe-area-inset-top) + 6px))", left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6, zIndex: 3 }}>
        {SLIDES.map((_, n) => (
          <button key={n} onClick={() => go(n)} aria-label={`Slide ${n + 1}`} style={{ width: n === i ? 22 : 7, height: 7, borderRadius: 999, border: "none", padding: 0, background: n === i ? C.sage : "rgba(143,175,150,0.3)", transition: "width 0.25s, background 0.25s", cursor: "pointer" }} />
        ))}
      </div>

      <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} onDragEnd={onDragEnd} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "76px 24px 92px", touchAction: "pan-y" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}
          >
            <SlideView slide={slide} />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: "max(20px, env(safe-area-inset-bottom))", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, zIndex: 4 }}>
        <button onClick={prev} disabled={i === 0} aria-label="Previous" style={navBtn(i === 0)}><ChevronLeft size={22} /></button>
        <span style={{ fontSize: 12, color: C.sage, letterSpacing: "0.08em", minWidth: 52, textAlign: "center" }}>{i + 1} / {SLIDES.length}</span>
        {atEnd ? (
          <button onClick={close} style={{ ...navBtn(false), width: "auto", padding: "0 18px", borderRadius: 999, fontWeight: 600, fontSize: 14, fontFamily: C.font }}>Read more</button>
        ) : (
          <button onClick={next} aria-label="Next" style={navBtn(false)}><ChevronRight size={22} /></button>
        )}
      </div>
    </div>
  );
}

function navBtn(disabled: boolean): CSSProperties {
  return {
    width: 44, height: 44, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: disabled ? "transparent" : "rgba(46,107,64,0.22)",
    border: `1px solid rgba(46,107,64,${disabled ? 0.18 : 0.5})`,
    color: disabled ? "rgba(143,175,150,0.4)" : C.text,
    cursor: disabled ? "default" : "pointer",
  };
}

const eyebrow: CSSProperties = { fontFamily: C.font, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: C.sage, margin: 0 };

function SlideView({ slide }: { slide: Slide }) {
  if (slide.kind === "title") {
    return (
      <>
        {slide.eyebrow && <p style={eyebrow}>{slide.eyebrow}</p>}
        <h1 style={{ fontFamily: C.font, fontSize: "clamp(44px, 13vw, 76px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "8px 0 0", color: C.text }}>{slide.headline}</h1>
        {slide.sub && (
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(15px, 4.4vw, 19px)", lineHeight: 1.6, color: "#CFE0CC", maxWidth: 520, margin: "20px auto 0" }}>{slide.sub}</p>
        )}
      </>
    );
  }
  if (slide.kind === "statement") {
    return (
      <p style={{ fontFamily: SERIF, fontSize: "clamp(22px, 6.2vw, 33px)", lineHeight: 1.42, color: C.text, maxWidth: 680, margin: 0 }}>{slide.body}</p>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, width: "100%" }}>
      <div>
        <p style={eyebrow}>{slide.label}</p>
        <h2 style={{ fontFamily: C.font, fontSize: "clamp(19px, 5.4vw, 27px)", fontWeight: 600, lineHeight: 1.3, margin: "8px auto 0", maxWidth: 560, color: C.text }}>{slide.headline}</h2>
      </div>
      <PhoneMock kind={slide.mock} />
    </div>
  );
}

// ── Mock phone screens ───────────────────────────────────────────────────────
const mockH: CSSProperties = { fontFamily: C.font, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sage, margin: "2px 0 0" };
const mockTitle: CSSProperties = { fontFamily: C.font, fontSize: 11.5, fontWeight: 600, color: C.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const mockSub: CSSProperties = { fontFamily: C.font, fontSize: 9.5, color: "#9FBCA6", margin: "1px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const mockPill: CSSProperties = { fontFamily: C.font, fontSize: 9.5, fontWeight: 600, color: "#0C1F12", background: "rgba(143,175,150,0.85)", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" };
const mockCard: CSSProperties = { background: "rgba(46,107,64,0.16)", border: "1px solid rgba(143,175,150,0.16)", borderRadius: 11, padding: "8px 10px" };

function PhoneMock({ kind }: { kind: MockKind }) {
  return (
    <div style={{ width: 250, height: 384, borderRadius: 30, background: "#0B1F13", border: "1px solid rgba(143,175,150,0.22)", boxShadow: "0 18px 50px rgba(0,0,0,0.5)", padding: "16px 12px 12px", position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 56, height: 5, borderRadius: 999, background: "rgba(255,255,255,0.12)" }} />
      <div style={{ height: "100%", overflow: "hidden" }}>
        {kind === "gather" && <MockGather />}
        {kind === "configure" && <MockConfigure />}
        {kind === "office" && <MockOffice />}
        {kind === "rhythm" && <MockRhythm />}
      </div>
    </div>
  );
}

function Row({ e, t, s, cta }: { e: string; t: string; s?: string; cta?: string }) {
  return (
    <div style={{ ...mockCard, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 15 }} aria-hidden>{e}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={mockTitle}>{t}</p>
        {s && <p style={mockSub}>{s}</p>}
      </div>
      {cta && <span style={mockPill}>{cta}</span>}
    </div>
  );
}

function MockRhythm() {
  return (
    <div style={{ padding: "2px 3px" }}>
      <p style={mockH}>Today</p>
      <Row e="🌅" t="Morning Prayer" s="From the Book of Common Prayer" cta="Begin" />
      <Row e="📖" t="Forward Day by Day" s="Today’s reflection" cta="Read" />
      <Row e="🕯️" t="Silence" s="5 minutes" cta="Begin" />
    </div>
  );
}

function MockGather() {
  const items = [
    { e: "📿", t: "The Daily Office" },
    { e: "📖", t: "Forward Day by Day" },
    { e: "🕊️", t: "CAC Daily Meditation" },
    { e: "🎵", t: "Praying the Psalms" },
    { e: "🕯️", t: "Silence" },
  ];
  return (
    <div style={{ padding: "2px 3px" }}>
      <p style={mockH}>One routine</p>
      {items.map((it) => (
        <div key={it.t} style={{ ...mockCard, marginTop: 7, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }} aria-hidden>{it.e}</span>
          <p style={{ ...mockTitle, flex: 1 }}>{it.t}</p>
          <span style={{ color: C.sage, fontSize: 12 }} aria-hidden>✓</span>
        </div>
      ))}
    </div>
  );
}

function MockConfigure() {
  return (
    <div style={{ padding: "2px 3px" }}>
      <p style={mockH}>Shape your rhythm</p>
      <div style={{ ...mockCard, marginTop: 12, padding: "13px 12px 15px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9 }}>
          <span style={{ ...mockSub, fontSize: 9 }}>Psalms</span>
          <span style={{ ...mockSub, fontSize: 9 }}>Full Office</span>
        </div>
        <div style={{ position: "relative", height: 4, borderRadius: 999, background: "rgba(143,175,150,0.22)" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "64%", borderRadius: 999, background: "rgba(143,175,150,0.7)" }} />
          <div style={{ position: "absolute", left: "64%", top: "50%", transform: "translate(-50%,-50%)", width: 15, height: 15, borderRadius: 999, background: C.text, border: "2px solid #2D5E3F" }} />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {["Morning", "Evening", "Reflection", "Silence"].map((chip, n) => (
          <span key={chip} style={{ ...mockPill, background: n < 3 ? "rgba(143,175,150,0.85)" : "rgba(46,107,64,0.3)", color: n < 3 ? "#0C1F12" : "#CFE0CC" }}>{chip}</span>
        ))}
      </div>
    </div>
  );
}

function MockOffice() {
  return (
    <div style={{ padding: "2px 3px" }}>
      <p style={mockH}>Morning Prayer</p>
      <div style={{ ...mockCard, marginTop: 12, padding: 12 }}>
        <p style={{ ...mockTitle, fontSize: 13 }}>🌅 Morning Prayer</p>
        <p style={{ ...mockSub, marginTop: 2 }}>Tuesday · Proper 8</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 11 }}>
          {["Read", "Listen", "Watch", "From your BCP"].map((w, n) => (
            <span key={w} style={{ ...mockPill, background: n === 0 ? "rgba(143,175,150,0.85)" : "rgba(46,107,64,0.3)", color: n === 0 ? "#0C1F12" : "#CFE0CC" }}>{w}</span>
          ))}
        </div>
      </div>
      <p style={{ ...mockSub, marginTop: 12, textAlign: "center", whiteSpace: "normal", lineHeight: 1.4 }}>The same prayer, met however meets you that day.</p>
    </div>
  );
}
