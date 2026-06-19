import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { openExternal } from "@/lib/openExternal";
import { primeAudio } from "@/lib/amenFeedback";

// A ONE-PAGE intro to Cobreathe, shown before a new user's first breath: what
// the practice is, and the why (Laurel Kearns' "conspire = breathe together").
// Not a slideshow — a single calm screen with a Begin.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

const ESSAY_TITLE = "Con-spiring Together: Breathing for Justice";
const ESSAY_URL = "https://www.academia.edu/80143703/Con_spiring_Together_Breathing_for_Justice";
export const COBREATHE_INTRO_SEEN_KEY = "phoebe:cobreathe-intro-seen";

export default function CobreatheAboutPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const beginPractice = () => {
    primeAudio(); // unlock audio during this tap so the breath's swell tones sound
    try { localStorage.setItem(COBREATHE_INTRO_SEEN_KEY, "1"); } catch { /* private mode */ }
    setLocation("/cobreathe?start=1");
  };

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full flex flex-col" style={{ minHeight: "74vh" }}>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.home", { defaultValue: "Home" })}
        </Link>

        <div className="flex-1 flex flex-col justify-center" style={{ maxWidth: 520 }}>
          <p className="text-[12px] uppercase tracking-[0.18em] mb-2" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
            {t("cobreathe.title", { defaultValue: "Cobreathe" })}
          </p>
          <h1 className="text-[28px] font-bold mb-4" style={{ color: WARM, fontFamily: SPACE_GROTESK, letterSpacing: "-0.01em" }}>
            {t("cobreathe.about_heading", { defaultValue: "Breathing together, for justice" })}
          </h1>

          <p className="mb-4" style={{ color: "rgba(240,237,230,0.92)", fontFamily: SPACE_GROTESK, fontSize: 16.5, lineHeight: 1.6 }}>
            {t("cobreathe.about_practice", { defaultValue: "Once a day, hold twelve slow breaths in one shared rhythm — a few seconds in, a held pause, a longer breath out. The circle is paced by the same clock for everyone, so anyone breathing in that moment is breathing with you. It counts toward your contemplation goal." })}
          </p>
          <p className="mb-4" style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 15.5, lineHeight: 1.6 }}>
            {t("cobreathe.about_why", { defaultValue: "To “conspire” is, at root, to breathe together. We breathe with one another, with the trees, with a planet whose own breath — carbon in, oxygen out — has been thrown out of balance. This is a small, bodily prayer for one another and for climate justice." })}
          </p>
          <p className="mb-5" style={{ color: "rgba(143,175,150,0.8)", fontFamily: SPACE_GROTESK, fontSize: 14.5, lineHeight: 1.6 }}>
            {t("cobreathe.about_after", { defaultValue: "When you finish, you'll see how many people kept the breath today." })}
          </p>

          <button
            type="button"
            onClick={() => openExternal(ESSAY_URL)}
            className="text-[12.5px] underline self-start"
            style={{ color: "rgba(143,175,150,0.85)", fontFamily: SPACE_GROTESK, background: "none", border: "none", padding: 0, cursor: "pointer", fontStyle: "italic" }}
          >
            {t("cobreathe.about_essay", { title: ESSAY_TITLE, defaultValue: `From “${ESSAY_TITLE}” by Laurel Kearns — read the full essay →` })}
          </button>
        </div>

        <button
          type="button"
          onClick={beginPractice}
          className="w-full rounded-full py-3.5 mt-6 text-[15px] font-semibold transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
        >
          {t("cobreathe.begin", { defaultValue: "Begin" })} <span aria-hidden>→</span>
        </button>
      </div>
    </Layout>
  );
}
