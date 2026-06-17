import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { DEFAULT_TOTAL_BREATHS } from "@/components/CobreatheBreath";

// ── CobreatheSummary ─────────────────────────────────────────────────────────
//
// The Cobreathe CONCLUDING screen — shown identically whether the breath ran on
// the standalone /cobreathe page (reached from the contemplation card) or as the
// prayer-mode / office slideshow overlay (CobreatheOverlay). Both render THIS
// one component so the two closes can never drift apart again.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

export function CobreatheSummary({
  weekBreaths,
  others,
  onContinue,
  continueLabel,
  continueDisabled = false,
  fadeOut = false,
  onFadeOutComplete,
  fadeIn = false,
  onEntered,
  nearCount = 0,
  nearFellows = [],
  companions = [],
}: {
  // This week's running breath tally (per-device).
  weekBreaths: number;
  // Others who have breathed today (excluding the caller).
  others: number;
  // Garden-mates you breathed WITH — those who breathed today plus anyone caught
  // breathing live alongside you this sit. Rendered as faces + first names.
  companions?: Array<{ userId: number; name: string | null; avatarUrl: string | null }>;
  // "Same air" (opt-in, beta) — the peak number who were breathing in your
  // coarse area during the sit, and any Fellows among them. 0 → nothing shown.
  nearCount?: number;
  nearFellows?: Array<{ userId: number; name: string; avatarUrl: string | null; band: string }>;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  // When true the screen fades to 0 — the overlay uses this to dissolve onto the
  // office slide it advanced underneath; onFadeOutComplete fires when the fade
  // finishes. The standalone page leaves this off (it navigates away instead).
  fadeOut?: boolean;
  onFadeOutComplete?: () => void;
  // When true, the summary fades IN (opacity 0→1) instead of appearing
  // instantly. The host keeps the breath screen mounted underneath until
  // onEntered fires, so the breath→summary hand-off is a dissolve, not a hard
  // cut. (The standalone page leaves this off — it has no breath to dissolve
  // from once it returns to its Layout.)
  fadeIn?: boolean;
  onEntered?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: fadeIn ? 0 : 1 }}
      animate={{ opacity: fadeOut ? 0 : 1 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      onAnimationComplete={() => { if (fadeOut) onFadeOutComplete?.(); else onEntered?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        // STATIC gradient — the drifting AnimatedBackground was removed here
        // because its blobs popped in as the summary mounted ("the background
        // glitches in"). A still gradient gives depth with nothing to animate.
        background: "radial-gradient(120% 80% at 50% 30%, #122E20 0%, #0A1C14 65%)",
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        overflow: "hidden",
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 max-w-xl mx-auto relative">
        <div className="text-[46px] mb-3">🌍</div>
        {/* Breaths this session — the headline number. */}
        <h2 className="text-[2.1rem] font-bold leading-none mb-1.5" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          {DEFAULT_TOTAL_BREATHS} {t("cobreathe.breaths_word", { defaultValue: "breaths" })}
        </h2>
        {/* Breaths so far this week, and who you breathed with today. */}
        <p className="text-[13px] tracking-wide mb-7" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          {weekBreaths} {t("cobreathe.breaths_this_week", { defaultValue: "breaths this week" })}
          {others > 0 ? ` · ${t("cobreathe.summary_with_today", { defaultValue: `with ${others} ${others === 1 ? "other" : "others"} today` })}` : ""}
        </p>
        {/* Who you breathed with — garden faces (today's breathers + anyone caught
            breathing live alongside you), so the first to finish still sees them. */}
        {companions.length > 0 && (() => {
          const names = companions.map((c) => (c.name ?? "").trim().split(/\s+/)[0]).filter(Boolean);
          const shown = names.slice(0, 2);
          const extra = companions.length - shown.length;
          const line = shown.length === 0 ? ""
            : extra > 0 ? `${shown.join(", ")}, and ${extra} other${extra === 1 ? "" : "s"}`
            : shown.join(" and ");
          return (
            <div className="flex flex-col items-center mb-7 -mt-3">
              <div className="flex items-center mb-2">
                {companions.slice(0, 6).map((c, i) => (
                  <div
                    key={c.userId}
                    className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{ width: 32, height: 32, marginLeft: i === 0 ? 0 : -8, border: "1.5px solid #0A1C14", background: "rgba(62,124,122,0.45)", zIndex: 10 - i }}
                  >
                    {c.avatarUrl
                      ? <img src={c.avatarUrl} alt={c.name ?? ""} className="w-full h-full object-cover" />
                      : <span style={{ color: WARM, fontSize: 11, fontWeight: 700, fontFamily: SPACE_GROTESK }}>{((c.name ?? "·").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")) || "·"}</span>}
                  </div>
                ))}
              </div>
              {line && (
                <p className="text-[13.5px]" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
                  {t("cobreathe.summary_breathed_with", { names: line, defaultValue: `You breathed with ${line}.` })}
                </p>
              )}
            </div>
          );
        })()}

        {/* "Same air" after-glow — the felt realization, anonymous for strangers,
            named for Fellows. Only when someone was actually nearby. */}
        {nearCount > 0 && (() => {
          const bandWord = (b: string) => b === "near" ? "near you" : b === "blocks" ? "a few blocks away" : "across town";
          const fellow = nearFellows[0];
          const strangers = Math.max(0, nearCount - nearFellows.length);
          return (
            <div className="mb-7 -mt-3 flex flex-col items-center">
              {nearFellows.length > 0 && (
                <div className="flex items-center mb-2">
                  {nearFellows.slice(0, 4).map((f, i) => (
                    f.avatarUrl ? (
                      <img key={f.userId} src={f.avatarUrl} alt={f.name} style={{ width: 30, height: 30, borderRadius: 999, objectFit: "cover", border: "1.5px solid rgba(10,28,20,0.9)", marginLeft: i === 0 ? 0 : -6 }} />
                    ) : (
                      <span key={f.userId} style={{ width: 30, height: 30, borderRadius: 999, background: "#1A4A2E", color: "#A8C5A0", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(10,28,20,0.9)", marginLeft: i === 0 ? 0 : -6, fontFamily: SPACE_GROTESK }}>{(f.name[0] ?? "?").toUpperCase()}</span>
                    )
                  ))}
                </div>
              )}
              <p className="text-[14px] leading-relaxed px-2" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
                {fellow
                  ? `You breathed the same air as ${nearCount} ${nearCount === 1 ? "person" : "people"} near you — including ${fellow.name}, ${bandWord(fellow.band)}.`
                  : `You breathed the same air as ${nearCount} ${nearCount === 1 ? "person" : "people"} near you.`}
              </p>
              {fellow && strangers > 0 && (
                <p className="text-[12.5px] leading-relaxed px-2 mt-1" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
                  and {strangers} {strangers === 1 ? "other" : "others"} nearby you don't know yet — held in the same air.
                </p>
              )}
            </div>
          );
        })()}

        {/* The climate-justice thanks. */}
        <p className="text-[14px] leading-relaxed mb-9" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
          {t("cobreathe.summary_thanks", { defaultValue: "Thank you for praying for climate justice." })}
        </p>
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          className="rounded-xl py-3 px-8 active:scale-[0.98] transition-transform"
          style={{
            background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(140,195,160,0.5)",
            fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          {continueLabel ?? t("common.continue", { defaultValue: "Continue" })}
        </button>
      </div>
    </motion.div>
  );
}
