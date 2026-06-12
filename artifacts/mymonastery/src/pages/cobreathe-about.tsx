import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";

// Learn more about Cobreathing — a single scrollable slide: the opening of
// Laurel Kearns' essay, quoted, under the essay's title. Set in Space Grotesk.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

export default function CobreatheAboutPage() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full pb-24">
        <Link href="/cobreathe" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("cobreathe.title", { defaultValue: "Cobreathe" })}
        </Link>

        {/* Title — the essay's title, in quotes. */}
        <h1 className="text-[26px] font-bold leading-snug mb-1.5" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          “Con-spiring Together: Breathing for Justice”
        </h1>
        <p className="text-sm mb-7" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          Laurel Kearns
        </p>

        {/* The quote — scroll through and read. */}
        <div className="space-y-5" style={{ color: "rgba(240,237,230,0.92)", fontFamily: SPACE_GROTESK, fontSize: 16, lineHeight: 1.7 }}>
          <p>
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
          <p>
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
        </div>
      </div>
    </Layout>
  );
}
