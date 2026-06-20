import { useState } from "react";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { openExternal } from "@/lib/openExternal";
import { primeAudio } from "@/lib/amenFeedback";

// The Co-Breathe onboarding SLIDESHOW — a tap-through deck drawn from Laurel
// Kearns' "Con-spiring Together: Breathing for Justice": conspire = to breathe
// together; ruach as the one breath animating all creation; reciprocal
// respiration with the green world; and "I can't breathe" as the cry that binds
// Earth justice to social justice. Tap the right side to advance, the left to go
// back; the last slide begins the breath.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const ESSAY_TITLE = "Con-spiring Together: Breathing for Justice";
const ESSAY_URL = "https://www.academia.edu/80143703/Con_spiring_Together_Breathing_for_Justice";
export const COBREATHE_INTRO_SEEN_KEY = "phoebe:cobreathe-intro-seen";

type Slide = { eyebrow: string; title: string; body: string };
const SLIDES: Slide[] = [
  {
    eyebrow: "Co-Breathe",
    title: "To conspire is to breathe together",
    body: "“Conspire” comes from the Latin con-spirare — to breathe with. Before it ever meant a plot, it meant a shared breath. To pray together is to conspire in the oldest sense: to draw one breath as one body.",
  },
  {
    eyebrow: "One breath",
    title: "The breath that animates all things",
    body: "Scripture calls it ruach — the breath, the wind, the Spirit that hovered over the waters at the beginning and is breathed into every living thing. The same breath moves through you, through your neighbor, through all that lives.",
  },
  {
    eyebrow: "The green world",
    title: "We breathe each other",
    body: "Every second breath you take is the gift of the forests and the phytoplankton — carbon in, oxygen out. You breathe what the trees exhale; they breathe what you exhale. Respiration is reciprocal, a quiet covenant with the green world.",
  },
  {
    eyebrow: "For justice",
    title: "“I can't breathe”",
    body: "The cry that binds Earth justice to social justice. Polluted air settles over sacrifice-zone neighborhoods; breath is taken by violence. To pray for breath is to pray for those whose breath is threatened — and to refuse the world that takes it.",
  },
  {
    eyebrow: "The practice",
    title: "A small, bodily prayer",
    body: "Once a day, hold twelve slow breaths in one shared rhythm — a few seconds in, a held pause, a longer breath out. The timer is paced by the same clock for everyone, so anyone breathing in that moment is breathing with you.",
  },
];

export default function CobreatheAboutPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [i, setI] = useState(0);
  const last = SLIDES.length - 1;

  const beginPractice = () => {
    primeAudio(); // unlock audio during this tap so the breath's swell tones sound
    try { localStorage.setItem(COBREATHE_INTRO_SEEN_KEY, "1"); } catch { /* private mode */ }
    setLocation("/cobreathe?start=1");
  };
  const next = () => { if (i < last) setI(i + 1); else beginPractice(); };
  const prev = () => { if (i > 0) setI(i - 1); };

  const s = SLIDES[i]!;
  const onLast = i === last;

  return (
    <Layout>
      <div style={{ position: "relative", minHeight: "78vh", display: "flex", flexDirection: "column" }}>
        {/* Close → home */}
        <div className="flex justify-end">
          <button
            onClick={() => setLocation("/dashboard")}
            aria-label={t("common.close", { defaultValue: "Close" })}
            style={{ width: 40, height: 40, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(240,237,230,0.7)", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tap zones — left third = back, right two-thirds = next. The content
            sits above them (pointer-events) so links/buttons still work. */}
        <button aria-label="Previous" onClick={prev} style={{ position: "absolute", top: 56, bottom: 88, left: 0, width: "33%", background: "transparent", border: "none", cursor: i > 0 ? "pointer" : "default", zIndex: 1 }} />
        <button aria-label="Next" onClick={next} style={{ position: "absolute", top: 56, bottom: 88, right: 0, width: "67%", background: "transparent", border: "none", cursor: "pointer", zIndex: 1 }} />

        {/* Slide */}
        <div className="flex-1 flex flex-col justify-center text-center" style={{ maxWidth: 540, margin: "0 auto", width: "100%", padding: "0 6px", position: "relative", zIndex: 2, pointerEvents: "none" }}>
          <p key={`e${i}`} className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
            {s.eyebrow}
          </p>
          <h1 key={`t${i}`} style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(28px, 8vw, 40px)", lineHeight: 1.12, letterSpacing: "-0.02em", marginBottom: 18, animation: "office-enter 0.5s ease both" }}>
            {s.title}
          </h1>
          <p key={`b${i}`} style={{ color: "rgba(240,237,230,0.9)", fontFamily: SERIF, fontSize: 17.5, lineHeight: 1.62, animation: "office-enter 0.6s ease both" }}>
            {s.body}
          </p>

          {onLast && (
            <div style={{ pointerEvents: "auto", marginTop: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <button
                onClick={beginPractice}
                className="w-full rounded-2xl py-4 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ maxWidth: 360, background: "#2D5E3F", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 700, border: "none", cursor: "pointer" }}
              >
                {t("cobreathe.begin_short", { defaultValue: "Begin the breath" })} <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                onClick={() => openExternal(ESSAY_URL)}
                className="text-[12.5px] underline"
                style={{ color: "rgba(143,175,150,0.85)", fontFamily: SPACE_GROTESK, background: "none", border: "none", padding: 0, cursor: "pointer", fontStyle: "italic" }}
              >
                {t("cobreathe.about_essay", { title: ESSAY_TITLE, defaultValue: `From “${ESSAY_TITLE}” by Laurel Kearns — read the full essay →` })}
              </button>
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2" style={{ paddingBottom: 8, position: "relative", zIndex: 2 }}>
          {SLIDES.map((_, n) => (
            <span key={n} aria-hidden style={{ width: n === i ? 22 : 7, height: 7, borderRadius: 999, background: n === i ? "#A8C5A0" : "rgba(143,175,150,0.3)", transition: "width 0.3s ease, background 0.3s ease" }} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
