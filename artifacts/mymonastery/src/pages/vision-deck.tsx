import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useLocation } from "wouter";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// ── /vision-deck — the "technology of holding" deck ─────────────────────────
//
// A second, narrative-first deck (distinct from the parish-pitch /church-deck).
// It leads with the WHY — ritual as a technology of holding, the rule of life,
// gathering a scattered practice into one place, being held through the liminal
// seasons of a life — drawn from Jeremy's "Building a Technology of Holding"
// letter. Reached from Admin Tools. Self-contained: its own dark slide shell
// AND its own phone mocks (including ones church-deck lacks: the rule of life
// and the gathered daily flow).

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.5)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const ACCENT = "rgba(168,197,160,0.55)";

// ── Phone mocks ─────────────────────────────────────────────────────────────
function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", maxWidth: 250, margin: "0 auto", borderRadius: 26, padding: 14, background: "#091A10", border: "1px solid rgba(200,212,192,0.15)", boxShadow: "0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(200,212,192,0.04)" }}>
      {children}
    </div>
  );
}

// A generic app card (left accent bar, emoji, title/sub, optional pill/check).
function MockCard({ rgb, emoji, title, sub, pill, done }: { rgb: string; emoji: string; title: string; sub?: string; pill?: string; done?: boolean }) {
  return (
    <div style={{ display: "flex", borderRadius: 11, overflow: "hidden", background: "rgba(22,46,32,0.6)", border: "1px solid rgba(200,212,192,0.18)" }}>
      <div style={{ width: 3, flexShrink: 0, background: `rgba(${rgb},0.85)` }} />
      <div style={{ flex: 1, padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 15, flexShrink: 0 }} aria-hidden>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: WARM, fontFamily: FONT, fontSize: 11.5, fontWeight: 600, margin: 0, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
          {sub && <p style={{ color: SAGE, fontFamily: FONT, fontSize: 9.5, margin: "1px 0 0", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</p>}
        </div>
        {done ? (
          <span style={{ flexShrink: 0, fontSize: 11, color: "rgba(240,237,230,0.85)", background: "rgba(46,107,64,0.2)", border: "1px solid rgba(46,107,64,0.45)", borderRadius: 999, padding: "2px 7px" }} aria-hidden>✓</span>
        ) : pill ? (
          <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 600, color: WARM, background: `rgba(${rgb},0.32)`, border: `1px solid rgba(${rgb},0.5)`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{pill}</span>
        ) : null}
      </div>
    </div>
  );
}

function MockHeader(sub?: string) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 700 }}>Phoebe</span>
        <span style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 9 }}>Menu</span>
      </div>
      {sub && <p style={{ color: SAGE, fontFamily: FONT, fontSize: 9, margin: "2px 0 0" }}>{sub}</p>}
    </div>
  );
}

function HomeMock() {
  return (
    <MockPhone>
      {MockHeader("Sunday, 12 April")}
      {/* Office hero */}
      <div style={{ borderRadius: 13, overflow: "hidden", background: "rgba(46,107,64,0.16)", border: "1px solid rgba(46,107,64,0.4)", padding: "11px 12px", marginBottom: 7 }}>
        <p style={{ color: ACCENT, fontFamily: FONT, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", margin: 0 }}>Book of Common Prayer</p>
        <p style={{ color: WARM, fontFamily: FONT, fontSize: 16, fontWeight: 700, margin: "3px 0 1px" }}>Morning Prayer</p>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 9.5, margin: "0 0 8px" }}>Ready for today</p>
        <span style={{ display: "inline-block", background: "rgba(46,107,64,0.85)", color: WARM, fontFamily: FONT, fontSize: 10, fontWeight: 600, borderRadius: 999, padding: "5px 14px" }}>Begin prayer →</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <MockCard rgb="96,141,209" emoji="📖" title="Forward Day by Day" sub="Today's reflection" pill="Read" />
        <MockCard rgb="62,124,122" emoji="🕯️" title="Contemplation" sub="A few quiet minutes" pill="Begin" />
      </div>
    </MockPhone>
  );
}

function RuleMock() {
  const row = (emoji: string, label: string, sub: string, on: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9, borderRadius: 11, padding: "10px 11px", background: on ? "rgba(46,107,64,0.28)" : "rgba(22,46,32,0.5)", border: `1px solid ${on ? ACCENT : "rgba(200,212,192,0.14)"}` }}>
      <span style={{ fontSize: 15, flexShrink: 0 }} aria-hidden>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: WARM, fontFamily: FONT, fontSize: 11.5, fontWeight: 600, margin: 0 }}>{label}</p>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 9, margin: "1px 0 0" }}>{sub}</p>
      </div>
      {on && <span style={{ color: "#C8D4C0", fontSize: 12, flexShrink: 0 }} aria-hidden>✓</span>}
    </div>
  );
  return (
    <MockPhone>
      <p style={{ color: ACCENT, fontFamily: FONT, fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase", margin: "2px 0 3px" }}>Shape your rhythm</p>
      <p style={{ color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>How will you pray?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {row("📜", "Praying the Psalms", "The day's appointed psalms", true)}
        {row("🌿", "Morning Devotion", "A short, gentle form", false)}
        {row("📖", "The Daily Office", "Morning & Evening Prayer", false)}
        {row("🕯️", "Contemplative Prayer", "Silence", false)}
      </div>
    </MockPhone>
  );
}

function WaysMock() {
  const opt = (emoji: string, label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9, borderRadius: 11, padding: "10px 11px", background: "rgba(22,46,32,0.55)", border: "1px solid rgba(200,212,192,0.16)" }}>
      <span style={{ fontSize: 15, flexShrink: 0 }} aria-hidden>{emoji}</span>
      <span style={{ color: WARM, fontFamily: FONT, fontSize: 11.5, fontWeight: 600 }}>{label}</span>
    </div>
  );
  return (
    <MockPhone>
      <p style={{ color: ACCENT, fontFamily: FONT, fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase", margin: "2px 0 3px" }}>Morning Prayer</p>
      <p style={{ color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>How to pray</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {opt("📱", "Digital Slideshow")}
        {opt("📖", "Physical BCP")}
        {opt("🎧", "Listen")}
        {opt("📺", "Watch — National Cathedral")}
      </div>
    </MockPhone>
  );
}

function GatheredMock() {
  return (
    <MockPhone>
      <p style={{ color: ACCENT, fontFamily: FONT, fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase", margin: "2px 0 3px" }}>Today, in one place</p>
      <p style={{ color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>Your daily rhythm</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <MockCard rgb="46,107,64" emoji="📜" title="Morning Psalms" sub="Prayed today" done />
        <MockCard rgb="96,141,209" emoji="📖" title="Forward Day by Day" sub="CAC & FDD reflections" pill="Read" />
        <MockCard rgb="62,124,122" emoji="🕯️" title="Contemplation" sub="10 min today" pill="Begin" />
        <MockCard rgb="124,116,196" emoji="🌙" title="Evening Prayer" sub="Mark the day's end" pill="Later" />
      </div>
    </MockPhone>
  );
}

function ReturnMock() {
  return (
    <MockPhone>
      {/* Notification */}
      <div style={{ borderRadius: 12, background: "rgba(20,40,28,0.9)", border: "1px solid rgba(200,212,192,0.18)", padding: "10px 11px", marginBottom: 10, display: "flex", gap: 9, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden>🕯️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: WARM, fontFamily: FONT, fontSize: 11, fontWeight: 700 }}>Phoebe</span>
            <span style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 9 }}>now</span>
          </div>
          <p style={{ color: WARM, fontFamily: FONT, fontSize: 11, fontWeight: 600, margin: "2px 0 1px" }}>Time for Morning Prayer</p>
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 9.5, margin: 0, lineHeight: 1.35 }}>A few quiet minutes to begin the day.</p>
        </div>
      </div>
      <p style={{ color: ACCENT, fontFamily: FONT, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 6px" }}>A record of returning</p>
      <div style={{ display: "flex", gap: 4, marginBottom: 7 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 24, borderRadius: 6, background: i < 6 ? "rgba(46,107,64,0.7)" : "rgba(200,212,192,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: i < 6 ? WARM : SAGE_DIM, fontFamily: FONT }}>{["S", "M", "T", "W", "T", "F", "S"][i]}</div>
        ))}
      </div>
      <p style={{ color: SAGE, fontFamily: FONT, fontSize: 9.5, margin: 0 }}>Kept 6 of the last 7 days</p>
    </MockPhone>
  );
}

function CircleMock() {
  const face = (initials: string, bg: string) => (
    <div style={{ width: 22, height: 22, borderRadius: 999, background: bg, border: "2px solid #091A10", marginLeft: -6, display: "flex", alignItems: "center", justifyContent: "center", color: "#C8D4C0", fontSize: 8, fontFamily: FONT, fontWeight: 600 }}>{initials}</div>
  );
  return (
    <MockPhone>
      <p style={{ color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700, margin: "2px 0 1px" }}>Prayer List 🙏🏽</p>
      <p style={{ color: SAGE, fontFamily: FONT, fontSize: 9, margin: "0 0 10px" }}>Carried alongside a few others</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <MockCard rgb="96,140,180" emoji="🕊️" title="For my mother's healing" sub="On my list — private" />
        <MockCard rgb="46,107,64" emoji="🙏" title="From Anabelle" sub="For baby Davy in the NICU" pill="Amen" />
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 10, paddingLeft: 6 }}>
        {face("JC", "#1A4A2E")}{face("AH", "#2A3A5A")}{face("MW", "#3A2A4A")}
        <span style={{ color: SAGE, fontFamily: FONT, fontSize: 9, marginLeft: 10 }}>3 praying with you</span>
      </div>
    </MockPhone>
  );
}

const MOCKS: Record<string, () => ReactElement> = {
  home: HomeMock,
  rule: RuleMock,
  ways: WaysMock,
  gathered: GatheredMock,
  return: ReturnMock,
  circle: CircleMock,
};

type MockKey = keyof typeof MOCKS;

type Slide =
  | { kind: "title"; eyebrow: string; headline: string; sub: string; mock?: MockKey }
  | { kind: "statement"; eyebrow?: string; headline: string; body: string[] }
  | { kind: "feature"; label: string; headline: string; body: string; mock: MockKey }
  | { kind: "quote"; text: string; attribution?: string }
  | { kind: "closing"; headline: string; body: string[]; featured: string };

const SLIDES: Slide[] = [
  {
    kind: "title",
    eyebrow: "Phoebe",
    headline: "A technology of holding",
    sub: "Built on monastic life and the rule of life — to help a person build a daily habit of prayer, and be held by it rather than left to sustain it alone.",
    mock: "home",
  },
  {
    kind: "statement",
    eyebrow: "Where tools begin",
    headline: "We assume the first tools were weapons.",
    body: [
      "Spears, blades, the axe — tools for hunting and winning. It is the story we inherit, and it quietly flatters the idea that underneath everything we are conquerors.",
      "But the basket, the sling, the pouch likely came first: tools for holding, for carrying more than two hands could carry home. They simply rotted and returned to the earth — the way things that hold tend to do.",
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
      "Building Phoebe, one thread kept returning: people wanted help building a daily habit of prayer. I was not the only one hungry for ritual.",
    ],
  },
  {
    kind: "feature",
    label: "Shape a rule of life",
    headline: "From the Psalms to the full offices.",
    body: "A short questionnaire configures your daily practice across a wide range — and then holds that rhythm for you.",
    mock: "rule",
  },
  {
    kind: "feature",
    label: "Met however meets you",
    headline: "One office, prayed your way.",
    body: "Guided through your own Book of Common Prayer, on the app, read aloud, or live from Washington National Cathedral. The same prayer, met however meets you that day.",
    mock: "ways",
  },
  {
    kind: "feature",
    label: "Held in one place",
    headline: "Your scattered practice, gathered.",
    body: "Pray the Psalms, and that day's Forward Day by Day or CAC reflection opens next, with your contemplation timer waiting. One place to hold whatever shape your practice takes.",
    mock: "gathered",
  },
  {
    kind: "feature",
    label: "A gentle return",
    headline: "Carried back, one day at a time.",
    body: "A quiet nudge to keep the hour — not a streak to feel guilty about breaking, but a way through the fragile beginning. A record of returning, not a score to defend.",
    mock: "return",
  },
  {
    kind: "feature",
    label: "Not alone",
    headline: "Held alongside a few others.",
    body: "Keep your own prayer list, and share what you're carrying with a small circle walking the same direction — and know they are being held.",
    mock: "circle",
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
    const Mock = slide.mock ? MOCKS[slide.mock] : null;
    return (
      <div className="flex flex-col items-center text-center" style={{ gap: 18 }}>
        <p style={{ color: ACCENT, fontFamily: FONT, fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase" }}>{slide.eyebrow}</p>
        <h1 style={{ color: WARM, fontFamily: FONT, fontSize: "clamp(30px, 7vw, 52px)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", maxWidth: 600 }}>{slide.headline}</h1>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15.5, lineHeight: 1.55, maxWidth: 440 }}>{slide.sub}</p>
        {Mock && <div style={{ marginTop: 12 }}><Mock /></div>}
      </div>
    );
  }
  if (slide.kind === "quote") {
    return (
      <div className="flex flex-col items-center text-center" style={{ gap: 22 }}>
        <span aria-hidden style={{ color: ACCENT, fontFamily: SERIF, fontSize: 64, lineHeight: 0.5, marginBottom: 8 }}>“</span>
        <p style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(21px, 4.2vw, 30px)", lineHeight: 1.5, maxWidth: 600, whiteSpace: "pre-line" }}>{slide.text}</p>
        {slide.attribution && <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 13, letterSpacing: "0.06em", marginTop: 4 }}>— {slide.attribution}</p>}
      </div>
    );
  }
  if (slide.kind === "feature") {
    const Mock = MOCKS[slide.mock];
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center" style={{ gap: 32, width: "100%" }}>
        <div className="flex flex-col text-left" style={{ gap: 14, maxWidth: 380, flex: 1 }}>
          <span className="self-start" style={{ color: WARM, fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 13px", borderRadius: 999, background: "rgba(46,107,64,0.32)", border: `1px solid ${ACCENT}` }}>{slide.label}</span>
          <h2 style={{ color: WARM, fontFamily: FONT, fontSize: "clamp(24px, 5vw, 38px)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.01em" }}>{slide.headline}</h2>
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 16, lineHeight: 1.6 }}>{slide.body}</p>
        </div>
        <div style={{ flexShrink: 0, width: "100%", maxWidth: 250 }}><Mock /></div>
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
      <h2 style={{ color: WARM, fontFamily: FONT, fontSize: "clamp(25px, 5.2vw, 38px)", fontWeight: 700, lineHeight: 1.18, letterSpacing: "-0.01em" }}>{slide.headline}</h2>
      {slide.body.map((p, i) => (
        <p key={i} style={{ color: SAGE, fontFamily: FONT, fontSize: 16, lineHeight: 1.6 }}>{p}</p>
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

      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto", padding: "16px 28px" }}>
        <button aria-label="Previous" onClick={prev} style={{ position: "fixed", left: 0, top: 56, bottom: 64, width: "28%", background: "none", border: "none", cursor: i > 0 ? "pointer" : "default", zIndex: 1 }} />
        <button aria-label="Next" onClick={next} style={{ position: "fixed", right: 0, top: 56, bottom: 64, width: "28%", background: "none", border: "none", cursor: i < total - 1 ? "pointer" : "default", zIndex: 1 }} />
        <div key={i} style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 760, display: "flex", justifyContent: "center", animation: "vd-fade 0.45s ease", margin: "auto 0" }}>
          <SlideView slide={SLIDES[i]} />
        </div>
      </div>

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
