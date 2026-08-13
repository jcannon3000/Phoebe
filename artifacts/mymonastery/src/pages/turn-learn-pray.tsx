/**
 * Turn / Learn / Pray detail page — reached by tapping the weekly dot card
 * on the home. The card itself leads (same component, same live state), then
 * one explanation card per practice below it, so a curious tap answers "what
 * counts as each of these?" without leaving the app.
 */
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { WayOfLoveTurnLearnPray } from "@/components/WayOfLoveTurnLearnPray";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_BORDER = "rgba(200,212,192,0.35)";

const EXPLANATIONS: Array<{ letter: string; title: string; blurb: string }> = [
  {
    letter: "T",
    title: "Turn",
    blurb: "Showing up at all. Opening Phoebe today is Turn — there's nothing else to do for it. It's the first, smallest step of the Way of Love: turning toward God before anything else happens.",
  },
  {
    letter: "L",
    title: "Learn",
    blurb: "Reading something that carries Scripture. A reflection (CAC, Forward Day by Day, or SSJE), or a side whose chosen practice is the Office, a Devotion, or Praying the Psalms — Contemplation, the Examen, and Simple Guided Prayer don't count here, since they're not built around a passage.",
  },
  {
    letter: "P",
    title: "Pray",
    blurb: "Keeping any anchor at all today — Morning or Evening Prayer, Compline, Contemplation, Creation Prayer, the Examen, whatever you've set. One kept anchor is enough to fill Pray for the day.",
  },
];

export default function TurnLearnPrayPage() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return null;
  if (!user) { setLocation("/"); return null; }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="inline-flex items-center gap-1.5 text-sm mb-5"
          style={{ color: SAGE, background: "none", border: "none", cursor: "pointer" }}
        >
          <ChevronLeft size={14} /> {t("common.back", { defaultValue: "Back" })}
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: FAINT, fontFamily: FONT }}>
          Way of Love
        </p>
        <h1 className="text-2xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
          Turn · Learn · Pray
        </h1>
        <p className="text-[14px] mt-2 mb-2 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
          The first three of the Episcopal Church's seven Way of Love practices — the daily spine underneath the weekly ones (Worship, Bless, Go, Rest).
        </p>

        {/* Same card as the home — a status mirror, not a new place to log
            anything. Its own tap target still points here, which is a
            harmless no-op re-navigation on this page. */}
        <WayOfLoveTurnLearnPray />

        <div className="mt-8 flex flex-col gap-3">
          {EXPLANATIONS.map((e) => (
            <div
              key={e.letter}
              className="relative flex rounded-3xl overflow-hidden"
              style={{ background: "rgba(46,107,64,0.07)", border: `1px solid ${CARD_BORDER}` }}
            >
              <div className="w-1.5 flex-shrink-0" style={{ background: "rgba(110,180,130,0.72)" }} />
              <div className="flex-1 px-5 py-5">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex-shrink-0 flex items-center justify-center rounded-full text-[13px] font-semibold"
                    style={{ width: 26, height: 26, background: "rgba(110,180,130,0.18)", color: WARM, fontFamily: FONT }}
                  >
                    {e.letter}
                  </span>
                  <p className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>{e.title}</p>
                </div>
                <p className="text-[13.5px] mt-2 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
                  {e.blurb}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
