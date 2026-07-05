import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatedBackground } from "@/components/AnimatedBackground";

// ── Why shape a rhythm? — a short "technology of holding" prelude shown ONCE,
// before a brand-new author reaches the preset picker. Most people don't arrive
// knowing why a daily practice matters or where it leads; these four slides name
// the goal (to be held by a practice, not left to sustain it alone) so the
// customizer isn't a stick shift you must already know how to drive.
//
// Draws on the essay behind Phoebe: the earliest tools were containers, not
// weapons; ritual is one such technology of holding (Byung-Chul Han: "ritual is
// to time what a home is to space"); the monastery's bell held people so they
// didn't have to sustain the practice alone.

const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const BG = "#0C1F12";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Slide = { emoji: string; head: string; body: string };

export function RhythmWhyIntro({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const SLIDES: Slide[] = [
    {
      emoji: "🧺",
      head: t("rhythm_why.s1_head", { defaultValue: "The first tools weren't weapons" }),
      body: t("rhythm_why.s1_body", { defaultValue: "Before the spear there was the basket, the pouch, the sling that carried a child — tools for holding. They rotted and returned to the earth, the way things that hold tend to do." }),
    },
    {
      emoji: "🔔",
      head: t("rhythm_why.s2_head", { defaultValue: "Ritual is one of them" }),
      body: t("rhythm_why.s2_body", { defaultValue: "Ritual is to time what a home is to space. Take away the small daily ones and the day loses its edges — it becomes a flow you are carried along by, without being carried by anything." }),
    },
    {
      emoji: "🕯️",
      head: t("rhythm_why.s3_head", { defaultValue: "In the monastery, the bell rang and you went" }),
      body: t("rhythm_why.s3_body", { defaultValue: "No one sustained the practice alone — the rhythm held them. Outside those walls the shape is yours to keep, and it is so easily lost, especially in a season of change." }),
    },
    {
      emoji: "🌿",
      head: t("rhythm_why.s4_head", { defaultValue: "Phoebe is a bell, not a whip" }),
      body: t("rhythm_why.s4_body", { defaultValue: "Choose a rhythm small enough to keep, and let it hold you — through the many seasons of a life." }),
    },
  ];

  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];
  const advance = () => { if (last) onDone(); else setI((n) => n + 1); };

  // Desktop keyboard nav — ArrowRight advances (finishing on the last slide,
  // same as a tap), ArrowLeft steps back. The ref keeps the listener bound once
  // while seeing the current advance closure (it captures `last`).
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); advanceRef.current(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      onClick={advance}
      style={{ position: "relative", minHeight: "100dvh", display: "flex", flexDirection: "column", padding: "0 26px", cursor: "pointer", isolation: "isolate" }}
    >
      <AnimatedBackground base={BG} variant="subtle" />

      <button
        onClick={(e) => { e.stopPropagation(); onDone(); }}
        style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 16px)", right: 22, zIndex: 2, background: "none", border: "none", color: SAGE_DIM, fontSize: 14, fontFamily: FONT, cursor: "pointer" }}
      >
        {t("rhythm_why.skip", { defaultValue: "Skip" })}
      </button>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", maxWidth: 380, margin: "0 auto" }}>
        <span key={`e${i}`} style={{ fontSize: 46, animation: "rwiFade 520ms ease" }} aria-hidden>{s.emoji}</span>
        <h1 key={`h${i}`} style={{ color: CREAM, fontSize: 25, fontWeight: 700, fontFamily: FONT, lineHeight: 1.3, margin: "22px 0 0", animation: "rwiFade 620ms ease" }}>
          {s.head}
        </h1>
        <p key={`b${i}`} style={{ color: SAGE, fontSize: 15.5, fontFamily: FONT, lineHeight: 1.62, margin: "16px 0 0", animation: "rwiFade 720ms ease" }}>
          {s.body}
        </p>
      </div>

      <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 30px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", gap: 7 }}>
          {SLIDES.map((_, n) => (
            <span key={n} style={{ width: n === i ? 20 : 7, height: 7, borderRadius: 4, background: n === i ? SAGE : "rgba(143,175,150,0.3)", transition: "width 220ms ease, background 220ms ease" }} />
          ))}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); advance(); }}
          style={{ width: "100%", maxWidth: 340, padding: "15px 0", borderRadius: 999, border: "none", background: last ? CREAM : "rgba(46,107,64,0.28)", color: last ? "#12261A" : CREAM, fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
        >
          {last ? t("rhythm_why.begin", { defaultValue: "Shape your rhythm" }) : t("rhythm_why.next", { defaultValue: "Next" })}
        </button>
      </div>

      <style>{`@keyframes rwiFade { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
