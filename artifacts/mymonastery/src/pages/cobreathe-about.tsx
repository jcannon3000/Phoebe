import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";

// Learn more about Cobreathing — the teaching behind the practice, lifted off
// the Cobreathe intro so that screen stays focused on the breath itself. The
// con-spire framing, the opening of Laurel Kearns' essay, and the "why breath"
// justice grounding live here, reached via a "Learn more about cobreathing"
// pill on the intro.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

export default function CobreatheAboutPage() {
  const { t } = useTranslation();
  const [quoteOpen, setQuoteOpen] = useState(false);

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full pb-24">
        <Link href="/cobreathe" className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("cobreathe.title", { defaultValue: "Cobreathe" })}
        </Link>

        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          {t("cobreathe.about_title", { defaultValue: "About cobreathing" })}
        </h1>
        <p className="text-sm mb-5" style={{ color: SAGE }}>
          {t("cobreathe.about_subtitle", { defaultValue: "An embodied prayer for justice" })}
        </p>

        {/* Framing — to conspire is to breathe together. */}
        <div
          className="rounded-2xl p-5 mb-4"
          style={{ background: "rgba(62,124,122,0.10)", border: "1px solid rgba(62,124,122,0.28)" }}
        >
          <p className="text-[15px] leading-relaxed mb-3" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
            {t("cobreathe.framing_1", { defaultValue: "To conspire — con spirare — is, literally, to breathe together." })}
          </p>
          <p className="text-[13.5px] leading-relaxed" style={{ color: SAGE, fontFamily: SERIF }}>
            {t("cobreathe.framing_2", { defaultValue: "Once a day, hold twelve slow breaths in one shared rhythm — the circle is paced by the same clock for everyone, so anyone breathing in that moment is breathing with you. When you finish, you'll learn how many people kept the breath today: a small, bodily recognition that we are interconnected, and that the work of justice is work we can only do together." })}
          </p>
        </div>

        {/* From the essay — the opening of Kearns' chapter, quoted verbatim. */}
        <div
          className="rounded-2xl p-5 mb-4"
          style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(46,107,64,0.20)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            {t("cobreathe.essay_label", { defaultValue: "From the essay" })}
          </p>
          <blockquote className="text-[14px] leading-relaxed" style={{ color: WARM, fontFamily: SERIF, margin: 0 }}>
            {quoteOpen ? (
              <>
                <p className="mb-3">
                  Take a deep breath, and another. Our lives depend on it. The trees depend on it. The air
                  depends on it. The average human takes between 17,280 and 23,040 breaths a day, twelve to
                  sixteen per minute resting. The giant tortoise only takes four per minute; the hummingbird,
                  250. No matter how frequent, simply understood, each breath involves inhaling air, converting
                  the oxygen, and exhaling carbon dioxide. But it is not just we animals that breathe; plants
                  breathe in their own way, taking in the air, and through photosynthesis, breaking it down so
                  they can use the carbon dioxide, and exhaling most of the oxygen produced. This process is
                  called transpiration; for animals, it is called respiration. Basically, all living creatures
                  need each other in order for this exchange that creates our air to work; plants and animals,
                  humans and trees, con-spiring.
                </p>
                <p className="mb-3">
                  This is a new/old way to understand conspire: to breathe together, stemming from the same
                  Latin root, <em>spirare</em>, to breathe, as in respire/respiration and plant transpiration.
                  But it also means to work together. Thus we conspire, respire, inspire, breathe together, a
                  potent symbol of reciprocity and communion, and of what living in a planetary context demands.
                  Not only do plants and animals breathe, but the planet also breathes, building up carbon
                  concentrations in the winter months when the leaves are off the trees, and ideally absorbing
                  it all when they leaf out in the spring. Yet that balance has been disrupted; the planet can
                  no longer “clear” its “lungs.” Climate change and air pollution bring the need for conspiring,
                  among humans, and with the planet, into an even sharper focus.
                </p>
              </>
            ) : (
              <p className="mb-3">
                Take a deep breath, and another. Our lives depend on it. The trees depend on it. The air
                depends on it…
              </p>
            )}
          </blockquote>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px]" style={{ color: "rgba(143,175,150,0.75)", fontFamily: SERIF, fontStyle: "italic" }}>
              — Laurel Kearns, “Con-spiring Together: Breathing for Justice”
            </p>
            <button
              type="button"
              onClick={() => setQuoteOpen((v) => !v)}
              className="text-[12px] font-semibold flex-shrink-0"
              style={{ color: SAGE, fontFamily: SPACE_GROTESK, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {quoteOpen
                ? t("cobreathe.essay_less", { defaultValue: "Show less" })
                : t("cobreathe.essay_more", { defaultValue: "Read the opening →" })}
            </button>
          </div>
        </div>

        {/* Why breath? — the justice grounding. */}
        <div className="mt-4">
          <h2 className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            {t("cobreathe.why_title", { defaultValue: "Why breath?" })}
          </h2>
          <div className="space-y-3">
            {[
              { emoji: "🌿", key: "why_ruach", text: "In Hebrew scripture, ruach is one word for breath, wind, and Spirit — the same breath of God animating all creation. Air is not empty; it is shared." },
              { emoji: "🌳", key: "why_trees", text: "Plants breathe out what we breathe in, and we return the gift. Every breath rehearses our dependence on the green world — and on each other." },
              { emoji: "✊🏾", key: "why_justice", text: "\"I can't breathe\" names both police violence and the polluted air poor communities and communities of color are made to live in. To breathe freely is a justice issue. We breathe with those who cannot." },
            ].map((row) => (
              <div
                key={row.key}
                className="rounded-xl p-4 flex gap-3"
                style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(46,107,64,0.18)" }}
              >
                <span className="text-xl leading-none mt-0.5">{row.emoji}</span>
                <p className="text-[13px] leading-relaxed" style={{ color: SAGE, fontFamily: SERIF }}>
                  {t(`cobreathe.${row.key}`, { defaultValue: row.text })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
