import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { DEFAULT_TOTAL_BREATHS } from "@/components/CobreatheBreath";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { EARTH_PHOTOS } from "@/lib/earthPhotos";
import { collectForToday } from "@/lib/creationLiturgy";

// ── CobreatheSummary ─────────────────────────────────────────────────────────
//
// The Cobreathe CONCLUDING screen — shown identically whether the breath ran on
// the standalone /cobreathe page (reached from the contemplation card) or as the
// prayer-mode / office slideshow overlay (CobreatheOverlay). Both render THIS
// one component so the two closes can never drift apart again.
//
// UI mirrors the CONTEMPLATION closing slide (ContemplationTimer's end-of-sit
// screen, owner direction 2026-07-02): the same tiny uppercase eyebrow → big
// italic-serif headline → quiet italic sub-line → small stat line → rounded
// pill CTA, adapted to Co-Breathe's content (the breath count, week tally,
// companions). Only the presentation changed — props, fades, and the
// logging/completion flow around it are untouched.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

export function CobreatheSummary({
  breathsTaken = DEFAULT_TOTAL_BREATHS,
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
  // How many breaths the user actually took this sit (open-ended — can exceed
  // the 12-breath target). Defaults to the target for callers that don't track it.
  breathsTaken?: number;
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
  // A still landscape behind the close — the SAME treatment as the
  // contemplation end-of-sit screen (wide web photo / bundled EARTH on native,
  // washed heavily in the home green so the text stays legible). This is the
  // "make the closing slide look like the contemplation close" the owner asked
  // for; the two-overlapping-circles motif is gone.
  const bgPhoto = useMemo(
    () => pickWideBackground() ?? (EARTH_PHOTOS.length > 0 ? EARTH_PHOTOS[Math.floor(Math.random() * EARTH_PHOTOS.length)]! : null),
    [],
  );
  return (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: fadeIn ? 0 : 1 }}
      animate={{ opacity: fadeOut ? 0 : 1 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      onAnimationComplete={() => { if (fadeOut) onFadeOutComplete?.(); else onEntered?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "#0A1C14",
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        // Scrollable so a longer collect fits below the fold on small screens.
        overflowY: "auto", overflowX: "hidden",
      }}
    >
      {/* Full-bleed landscape + green wash — mirrors ContemplationTimer's close. */}
      {bgPhoto && (
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <img src={bgPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(9,26,16, 0.550) 0%, rgba(9,26,16, 0.792) 55%, rgba(9,26,16, 0.946) 100%)" }} />
        </div>
      )}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 max-w-xl mx-auto relative" style={{ zIndex: 1 }}>
        {/* Eyebrow — same shape as the contemplation close's tiny uppercase line. */}
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}>
          {t("cobreathe.summary_eyebrow", { defaultValue: "Creation Prayer complete" })}
        </p>
        {/* Breaths this session — the headline, in the contemplation close's big
            italic serif (was a bold Space Grotesk number). */}
        <p className="text-[26px] leading-[1.3] font-medium italic mb-2" style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}>
          {breathsTaken} {t("cobreathe.breaths_word", { defaultValue: "breaths" })}
        </p>
        {/* The climate-justice thanks — the quiet italic sub-line, where the
            contemplation close carries "carry the quiet with you". */}
        <p className="text-[13px] mb-6" style={{ color: "rgba(143,175,150,0.65)", fontFamily: SERIF, fontStyle: "italic", maxWidth: 300 }}>
          {t("cobreathe.summary_thanks", { defaultValue: "Thank you for breathing with all creation." })}
        </p>
        {/* The day's COLLECT — a Season of Creation prayer to close with (owner).
            Rotates daily through the whole set. */}
        {(() => {
          const c = collectForToday();
          return (
            <div className="mb-7" style={{ maxWidth: 400 }}>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2.5" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}>
                {c.title}
              </p>
              <p className="text-[14.5px] leading-relaxed" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
                {c.text}
              </p>
              {c.attribution && (
                <p className="text-[11px] mt-2.5" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
                  {c.attribution}
                </p>
              )}
            </div>
          );
        })()}
        {/* Breaths so far this week, and who you breathed with today — the small
            stat line, in the contemplation close's goal-progress slot. */}
        <p className="text-[12px] mb-6" style={{ color: "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK }}>
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
            <div className="flex flex-col items-center mb-6">
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
            <div className="mb-6 flex flex-col items-center">
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

        {/* CTA — the contemplation close's rounded pill (was a squarer button).
            Same handler/label/disabled wiring as before. */}
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          className="rounded-full px-10 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{
            background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)",
            fontFamily: SPACE_GROTESK, cursor: "pointer", opacity: continueDisabled ? 0.5 : 1,
          }}
        >
          {continueLabel ?? t("common.continue", { defaultValue: "Continue" })}
        </button>
      </div>
    </motion.div>
  );
}
