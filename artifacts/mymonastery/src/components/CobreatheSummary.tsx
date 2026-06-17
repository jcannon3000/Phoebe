import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { AnimatedBackground } from "@/components/AnimatedBackground";
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
}: {
  // This week's running breath tally (per-device).
  weekBreaths: number;
  // Others who have breathed today (excluding the caller).
  others: number;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  // When true the screen fades to 0 — the overlay uses this to dissolve onto the
  // office slide it advanced underneath; onFadeOutComplete fires when the fade
  // finishes. The standalone page leaves this off (it navigates away instead).
  fadeOut?: boolean;
  onFadeOutComplete?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: 1 }}
      animate={{ opacity: fadeOut ? 0 : 1 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      onAnimationComplete={() => { if (fadeOut) onFadeOutComplete?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "#0A1C14",
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        overflow: "hidden",
      }}
    >
      <AnimatedBackground base="#0A1C14" variant="pronounced" />
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
        {/* Breathing with the planet + the climate-justice thanks. */}
        <p className="text-[16px] leading-relaxed mb-3" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
          {t("cobreathe.summary_planet", { defaultValue: "One breath, drawn with the whole creation — the forests exhaling, the seas, every lung on the planet rising and falling as one." })}
        </p>
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
