import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { openExternal } from "@/lib/openExternal";

// Learn more about Cobreathing — the opening of Laurel Kearns' essay as a
// slideshow (like the offices), one paragraph per slide, then a final slide
// that overviews the practice. Shown before the breath on a user's first time.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

const ESSAY_TITLE = "Con-spiring Together: Breathing for Justice";
const ESSAY_URL = "https://www.academia.edu/80143703/Con_spiring_Together_Breathing_for_Justice";
export const COBREATHE_INTRO_SEEN_KEY = "phoebe:cobreathe-intro-seen";

// The essay's opening — one paragraph per slide, verbatim.
const ESSAY_SLIDES: string[] = [
  "Take a deep breath, and another. Our lives depend on it. The trees depend on it. The air depends on it.",
  "The average human takes between 17,280 and 23,040 breaths a day, twelve to sixteen per minute resting. The giant tortoise only takes four per minute; the hummingbird, 250. No matter how frequent, simply understood, each breath involves inhaling air, converting the oxygen, and exhaling carbon dioxide.",
  "But it is not just we animals that breathe; plants breathe in their own way, taking in the air, and through photosynthesis, breaking it down so they can use the carbon dioxide, and exhaling most of the oxygen produced. This process is called transpiration; for animals, it is called respiration. Basically, all living creatures need each other in order for this exchange that creates our air to work; plants and animals, humans and trees, con-spiring.",
  "This is a new/old way to understand conspire: to breathe together, stemming from the same Latin root, spirare, to breathe, as in respire/respiration and plant transpiration. But it also means to work together. Thus we conspire, respire, inspire, breathe together, a potent symbol of reciprocity and communion, and of what living in a planetary context demands.",
  "Not only do plants and animals breathe, but the planet also breathes, building up carbon concentrations in the winter months when the leaves are off the trees, and ideally absorbing it all when they leaf out in the spring. Yet that balance has been disrupted; the planet can no longer “clear” its “lungs.” Climate change and air pollution bring the need for conspiring, among humans, and with the planet, into an even sharper focus.",
];

export default function CobreatheAboutPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [i, setI] = useState(0);
  const overviewIndex = ESSAY_SLIDES.length; // the final slide
  const last = overviewIndex;
  const onOverview = i === overviewIndex;

  const beginPractice = () => {
    try { localStorage.setItem(COBREATHE_INTRO_SEEN_KEY, "1"); } catch { /* private mode */ }
    setLocation("/cobreathe?start=1");
  };

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full flex flex-col" style={{ minHeight: "72vh" }}>
        <Link href="/cobreathe" className="inline-flex items-center gap-1.5 text-sm mb-5" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("cobreathe.title", { defaultValue: "Cobreathe" })}
        </Link>

        {/* Essay title — in quotes, persistent across slides. */}
        <p className="text-[12px] font-semibold mb-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontStyle: "italic" }}>
          “{ESSAY_TITLE}”
        </p>
        <p className="text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}>
          Laurel Kearns
        </p>

        {/* Slide body */}
        <div className="flex-1 flex flex-col items-center justify-center py-8" style={{ overflowY: "auto" }}>
          {onOverview ? (
            <div className="w-full" style={{ maxWidth: 480 }}>
              <p className="text-[26px] font-bold mb-3" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                The practice
              </p>
              <p className="mb-4" style={{ color: "rgba(240,237,230,0.92)", fontFamily: SPACE_GROTESK, fontSize: 16.5, lineHeight: 1.6 }}>
                Once a day, hold twelve slow breaths in one shared rhythm — four seconds in, a held pause, six out. The circle is paced by the same clock for everyone, so anyone breathing in that moment is breathing with you. It counts toward your contemplation goal.
              </p>
              <p className="mb-5" style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 15, lineHeight: 1.6 }}>
                When you finish, you'll see how many people kept the breath today — a small, bodily recognition that the work of justice is work we can only do together.
              </p>
              <button
                type="button"
                onClick={() => openExternal(ESSAY_URL)}
                className="text-[12.5px] underline"
                style={{ color: "rgba(143,175,150,0.85)", fontFamily: SPACE_GROTESK, background: "none", border: "none", padding: 0, cursor: "pointer", fontStyle: "italic" }}
              >
                From “{ESSAY_TITLE}” by Laurel Kearns — read the full essay →
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center" style={{ maxWidth: 480 }}>
              <p
                className="text-center"
                style={{ color: "rgba(240,237,230,0.94)", fontFamily: SPACE_GROTESK, fontSize: 18.5, lineHeight: 1.55 }}
              >
                “{ESSAY_SLIDES[i]}”
              </p>
              <p
                className="text-center mt-4 text-[12.5px] italic"
                style={{ color: "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK }}
              >
                from “Con-spiring Together”
              </p>
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {Array.from({ length: ESSAY_SLIDES.length + 1 }, (_, idx) => (
            <span
              key={idx}
              style={{
                width: 6, height: 6, borderRadius: 999,
                background: idx === i ? "#A8C5A0" : "rgba(143,175,150,0.3)",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        {/* Back / Continue / Begin */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setI((n) => Math.max(0, n - 1))}
            disabled={i === 0}
            className="text-sm px-4 py-2"
            style={{ color: i === 0 ? "transparent" : SAGE, background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", fontFamily: SPACE_GROTESK }}
          >
            ← {t("common.back", { defaultValue: "Back" })}
          </button>
          <button
            type="button"
            onClick={() => (i < last ? setI((n) => n + 1) : beginPractice())}
            className="rounded-full px-7 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
          >
            {onOverview
              ? <>{t("cobreathe.begin", { defaultValue: "Begin" })} <span aria-hidden>→</span></>
              : <>{t("common.continue", { defaultValue: "Continue" })} <span aria-hidden>→</span></>}
          </button>
        </div>
      </div>
    </Layout>
  );
}
