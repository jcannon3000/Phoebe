import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";

// Learn more about Cobreathing — the opening of Laurel Kearns' essay, presented
// as a slideshow (like the offices): the essay's title, then a few sentences
// per slide. Set in Space Grotesk.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

const ESSAY_TITLE = "Con-spiring Together: Breathing for Justice";

// One slide per chunk — only so much per page.
const SLIDES: string[] = [
  "Take a deep breath, and another. Our lives depend on it. The trees depend on it. The air depends on it.",
  "The average human takes between 17,280 and 23,040 breaths a day — twelve to sixteen per minute at rest. The giant tortoise takes only four per minute; the hummingbird, 250.",
  "Each breath inhales air, converts the oxygen, and exhales carbon dioxide. But it is not just we animals that breathe; plants breathe in their own way — taking in the air and, through photosynthesis, exhaling most of the oxygen.",
  "For plants it is called transpiration; for animals, respiration. All living creatures need each other for the exchange that creates our air — plants and animals, humans and trees, con-spiring.",
  "This is a new/old way to understand conspire: to breathe together, from the same Latin root, spirare, to breathe — as in respire and transpiration. But it also means to work together.",
  "Thus we conspire, respire, inspire, breathe together — a potent symbol of reciprocity and communion, and of what living in a planetary context demands.",
  "Not only do plants and animals breathe; the planet breathes too — building up carbon in winter when the leaves are off the trees, and ideally absorbing it again when they leaf out in spring.",
  "Yet that balance has been disrupted; the planet can no longer “clear” its “lungs.” Climate change and air pollution bring the need for conspiring — among humans, and with the planet — into even sharper focus.",
];

export default function CobreatheAboutPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [i, setI] = useState(0);
  const last = SLIDES.length - 1;

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full flex flex-col" style={{ minHeight: "70vh" }}>
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
        <div className="flex-1 flex items-center justify-center py-8">
          <p
            className="text-center"
            style={{ color: "rgba(240,237,230,0.94)", fontFamily: SPACE_GROTESK, fontSize: 21, lineHeight: 1.55, maxWidth: 480 }}
          >
            {SLIDES[i]}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {SLIDES.map((_, idx) => (
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

        {/* Back / Continue */}
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
            onClick={() => (i < last ? setI((n) => n + 1) : setLocation("/cobreathe"))}
            className="rounded-full px-7 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
          >
            {i < last
              ? <>{t("common.continue", { defaultValue: "Continue" })} <span aria-hidden>→</span></>
              : t("common.done", { defaultValue: "Done" })}
          </button>
        </div>
      </div>
    </Layout>
  );
}
