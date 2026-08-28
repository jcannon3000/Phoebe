/**
 * /formation-deck — "content consumption → formation", the owner's talk.
 *
 * Built slide-for-slide from the owner's own presentation (12 slides, given
 * as a PDF: "can you build this as a deck on Phoebe for me"): why daily
 * practice is formation rather than content, You Are What You Love, shikake
 * design, and the design→practice→repetition→reorientation→formation ladder
 * that IS Phoebe's theory of the product. Same shell as /vision-deck
 * (dots · tap zones · arrow keys), reached from Admin Tools.
 *
 * The five images ship in public/decks/ — extracted from the owner's own
 * PDF: two book covers shown as the books under discussion, two photographs
 * from Matsumura's Shikake, and John August Swanson's "Daniel in the Lions'
 * Den" (a library artist; his recorded ACT grant covers non-commercial use
 * with attribution, credited on its slide).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.5)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const ACCENT = "rgba(168,197,160,0.55)";

/** A big set-apart quotation — the deck's opening and closing register. */
function Quote({ text, cite }: { text: string; cite?: string }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: 22 }}>
      <span aria-hidden style={{ color: ACCENT, fontFamily: SERIF, fontSize: 64, lineHeight: 0.5, marginBottom: 8 }}>“</span>
      <p className="title-glow-breathe" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(21px, 4.2vw, 30px)", lineHeight: 1.5, maxWidth: 600, margin: 0 }}>
        {text}
      </p>
      {cite && <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 13, letterSpacing: "0.06em", marginTop: 4 }}>— {cite}</p>}
    </div>
  );
}

/** A labelled step in a ↓ flow — the deck's two ladder slides. */
function Step({ label, sub, small }: { label: string; sub: string; small?: boolean }) {
  return (
    <div>
      <p className="title-glow-breathe" style={{ color: WARM, fontFamily: FONT, fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.01em", fontSize: small ? "clamp(17px, 3.4vw, 24px)" : "clamp(25px, 5.2vw, 38px)", margin: 0 }}>
        {label}
      </p>
      <p style={{ color: SAGE, fontFamily: FONT, fontSize: small ? "clamp(13.5px, 2.5vw, 15.5px)" : 16, lineHeight: 1.6, margin: "6px 0 0" }}>{sub}</p>
    </div>
  );
}
function Arrow() {
  return <p aria-hidden style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 20, margin: "10px 0", lineHeight: 1 }}>↓</p>;
}

function DeckImage({ src, alt, credit, maxH = "58vh" }: { src: string; alt: string; credit?: string; maxH?: string }) {
  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      <img
        src={src}
        alt={alt}
        style={{ maxWidth: "100%", maxHeight: maxH, objectFit: "contain", borderRadius: 10, boxShadow: "0 26px 70px rgba(0,0,0,0.6)" }}
      />
      {credit && (
        <figcaption style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.5, marginTop: 12 }}>{credit}</figcaption>
      )}
    </figure>
  );
}

/** The twelve slides, in the owner's own order and words. */
const SLIDES: Array<() => React.ReactElement> = [
  // 1 — the CAC's line, the deck's thesis in someone else's words.
  () => <Quote text="We believe that transformation begins with learning to see and love the world as it is." cite="CAC About Page" />,
  // 2 — the gap the whole talk lives in.
  () => (
    <div style={{ maxWidth: 560, textAlign: "left" }}>
      <Step label="Content consumption" sub="Learning information about love" />
      <Arrow />
      <Step label="Formation" sub="Becoming a more loving person" />
    </div>
  ),
  // 3 — the book behind the argument.
  () => <DeckImage src="/decks/yawyl-cover.jpg" alt="You Are What You Love — The Spiritual Power of Habit, James K. A. Smith" maxH="62vh" />,
  // 4 — Smith's own words.
  () => <Quote text="You are what you love, and your ultimate loves are formed and aimed by your immersion in practices and cultural rituals… Such rituals aren't something that you do; they do something to you." cite="Smith, p. 22." />,
  // 5 — Swanson's Daniel, standing alone (the revised deck lets it speak).
  () => (
    <DeckImage
      src="/decks/swanson-daniel.jpg"
      alt="Daniel in the Lions' Den, John August Swanson"
      maxH="54vh"
      credit="John August Swanson, Daniel in the Lions' Den — Art in the Christian Tradition, Vanderbilt Divinity Library. Used by permission of the artist (non-commercial, with attribution)."
    />
  ),
  // 6 — the frontline.
  () => (
    <div style={{ maxWidth: 620, textAlign: "center" }}>
      <p className="title-glow-breathe" style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(25px, 5.2vw, 38px)", lineHeight: 1.18, letterSpacing: "-0.01em", margin: 0 }}>
        Occasional consumption
      </p>
      <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: "clamp(14px, 2.6vw, 18px)", margin: "10px 0" }}>vs.</p>
      <p className="title-glow-breathe" style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(25px, 5.2vw, 38px)", lineHeight: 1.18, letterSpacing: "-0.01em", margin: 0 }}>
        Habitual immersion
      </p>
      <p style={{ color: SAGE, fontFamily: FONT, fontSize: 16, lineHeight: 1.6, margin: "22px 0 0", fontStyle: "italic" }}>
        The frontline between content consumption and formation
      </p>
    </div>
  ),
  // 7 — the second book.
  () => <DeckImage src="/decks/shikake-cover.jpg" alt="Shikake: The Japanese Art of Shaping Behavior Through Design, Naohiro Matsumura" maxH="60vh" />,
  // 8 — the hoop on the bin.
  () => <DeckImage src="/decks/shikake-hoop-bin.jpg" alt="A garbage bin with a basketball hoop attached" credit="Shikake 5. A garbage bin with a basketball hoop attached. (Matsumura)" maxH="56vh" />,
  // 9 — the diagonal tape on the binders.
  () => <DeckImage src="/decks/shikake-binders.jpg" alt="File binders with one diagonal stripe across their spines, so a misplaced binder shows at a glance" credit="Binders with a diagonal stripe — order made visible. (Matsumura)" maxH="56vh" />,
  // 10 — the design stance.
  () => (
    <div style={{ maxWidth: 620, textAlign: "left" }}>
      <p style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(19px, 3.8vw, 27px)", lineHeight: 1.35, letterSpacing: "-0.01em", margin: 0 }}>
        Rather than relying on motivation or telling people what they <em style={{ fontStyle: "italic" }}>should</em> do, we can design environments that make desired practices easier to begin and easier to sustain.
      </p>
      <ul style={{ color: SAGE, fontFamily: FONT, fontSize: 16, lineHeight: 1.75, margin: "18px 0 0", paddingLeft: 22 }}>
        <li>Lower the barrier to entry</li>
        <li>Reduce friction</li>
        <li>Create invitations and cues</li>
        <li>Make the next step clear</li>
        <li>Encourage people to return</li>
      </ul>
    </div>
  ),
  // 11 — the whole ladder.
  () => (
    <div style={{ maxWidth: 640, textAlign: "left" }}>
      <Step small label="Design" sub="Make the practice easy and inviting." />
      <Arrow />
      <Step small label="Practice" sub="Begin with something small enough to actually do." />
      <Arrow />
      <Step small label="Repetition" sub="Return to it—once a day." />
      <Arrow />
      <Step small label="Reorientation" sub="Once every day, interrupt everything competing for our attention and reorient ourselves toward God and what matters most." />
      <Arrow />
      <Step small label="Formation" sub="Over time, repeated practices shape our attention, desires, and way of seeing and loving the world." />
    </div>
  ),
  // 12 — the close.
  () => <Quote text="You do not think yourself into a new way of living, you live yourself into a new way of thinking." />,
];

export default function FormationDeck() {
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

  const Slide = SLIDES[i]!;

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, overflow: "hidden", isolation: "isolate", display: "flex", flexDirection: "column" }}>
      {leaf && (
        <div style={{ position: "absolute", inset: 0, zIndex: -1 }}>
          <img src={leaf} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.2 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(12,31,18,0.72) 0%, rgba(12,31,18,0.58) 45%, rgba(12,31,18,0.9) 100%)" }} />
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
        <div key={i} style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 760, display: "flex", justifyContent: "center", animation: "fd-fade 0.45s ease", margin: "auto 0" }}>
          <Slide />
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

      <style>{`@keyframes fd-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
