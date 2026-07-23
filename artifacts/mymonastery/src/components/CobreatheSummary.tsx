import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
// TWO slides now: (1) the day's COLLECT, big + LEFT-aligned in the format of an
// office liturgy slide, sealed with Amen; (2) the breaths slide — the count, the
// week tally, and who you breathed with (naming your parish's priest when they
// also breathed today). Only the presentation changed — props, fades, and the
// logging/completion flow around it are untouched.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "·";
}

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
  // A still landscape behind the close — the SAME treatment as the contemplation
  // end-of-sit screen (wide web photo / bundled EARTH on native, washed heavily
  // in the home green so the text stays legible).
  const bgPhoto = useMemo(
    () => pickWideBackground() ?? (EARTH_PHOTOS.length > 0 ? EARTH_PHOTOS[Math.floor(Math.random() * EARTH_PHOTOS.length)]! : null),
    [],
  );
  const collect = useMemo(() => collectForToday(), []);

  // Slide 0 = the collect (prayer), slide 1 = the breaths + who you breathed with.
  const [step, setStep] = useState<0 | 1>(0);

  // Name the parish priest/leader if they also co-breathed today (null for
  // non-parish users, or when no leader breathed). Fails soft.
  const { data: leaderData } = useQuery<{ leaderName: string | null; leaderAvatarUrl: string | null }>({
    queryKey: ["/api/parish/breathed-with-leader-today"],
    queryFn: () => apiRequest("GET", "/api/parish/breathed-with-leader-today"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const leaderName = leaderData?.leaderName?.trim() || null;
  const leaderAvatarUrl = leaderData?.leaderAvatarUrl ?? null;

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

      <AnimatePresence mode="wait">
        {step === 0 ? (
          /* ── Slide 1: the COLLECT, office-liturgy format — big, LEFT-aligned. ── */
          <motion.div
            key="prayer"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="flex-1 flex flex-col justify-center px-7 max-w-xl mx-auto w-full relative"
            style={{ zIndex: 1 }}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-4 text-left" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
              {collect.title}
            </p>
            <p className="text-left" style={{ color: WARM, fontFamily: SERIF, fontSize: 24, lineHeight: 1.5, letterSpacing: "0.005em" }}>
              {collect.text}
            </p>
            {collect.attribution && (
              <p className="text-[12px] mt-4 text-left" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
                {collect.attribution}
              </p>
            )}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-full px-9 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98] mt-9 self-start"
              style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
            >
              {t("cobreathe.summary_amen", { defaultValue: "Amen" })}
            </button>
          </motion.div>
        ) : (
          /* ── Slide 2: the breaths + who you breathed with. ── */
          <motion.div
            key="breaths"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="flex-1 flex flex-col items-center justify-center text-center px-8 max-w-xl mx-auto relative"
            style={{ zIndex: 1 }}
          >
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}>
              {t("cobreathe.summary_eyebrow", { defaultValue: "Creation Prayer complete" })}
            </p>
            <p className="text-[26px] leading-[1.3] font-medium italic mb-2" style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}>
              {breathsTaken} {t("cobreathe.breaths_word", { defaultValue: "breaths" })}
            </p>
            <p className="text-[13px] mb-6" style={{ color: "rgba(143,175,150,0.65)", fontFamily: SERIF, fontStyle: "italic", maxWidth: 300 }}>
              {t("cobreathe.summary_thanks", { defaultValue: "Thank you for breathing with all creation." })}
            </p>
            <p className="text-[12px] mb-6" style={{ color: "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK }}>
              {weekBreaths} {t("cobreathe.breaths_this_week", { defaultValue: "breaths this week" })}
            </p>

            {/* Who you breathed with. When your parish's priest also breathed today,
                name them; otherwise fall back to the garden-mates you breathed with. */}
            {leaderName ? (
              <div className="flex flex-col items-center mb-6">
                <div className="flex items-center mb-2">
                  <div className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{ width: 34, height: 34, border: "1.5px solid #0A1C14", background: "rgba(62,124,122,0.55)", zIndex: 20 }}>
                    {leaderAvatarUrl
                      ? <img src={leaderAvatarUrl} alt={leaderName} className="w-full h-full object-cover" />
                      : <span style={{ color: WARM, fontSize: 12, fontWeight: 700, fontFamily: SPACE_GROTESK }}>{initials(leaderName)}</span>}
                  </div>
                  {companions.slice(0, 5).map((c, i) => (
                    <div key={c.userId} className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{ width: 32, height: 32, marginLeft: -8, border: "1.5px solid #0A1C14", background: "rgba(62,124,122,0.45)", zIndex: 19 - i }}>
                      {c.avatarUrl
                        ? <img src={c.avatarUrl} alt={c.name ?? ""} className="w-full h-full object-cover" />
                        : <span style={{ color: WARM, fontSize: 11, fontWeight: 700, fontFamily: SPACE_GROTESK }}>{initials(c.name ?? "·")}</span>}
                    </div>
                  ))}
                </div>
                {/* The priest is themselves one of "today's others", so drop them
                    from the remaining count when we name them. */}
                {(() => {
                  const rest = Math.max(0, others - 1);
                  return (
                    <p className="text-[13.5px]" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
                      {rest > 0
                        ? `You breathe with ${leaderName} and ${rest} ${rest === 1 ? "other" : "others"} today.`
                        : `You breathe with ${leaderName} today.`}
                    </p>
                  );
                })()}
              </div>
            ) : (
              <>
                {others > 0 && (
                  <p className="text-[12px] mb-6" style={{ color: "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK }}>
                    {t("cobreathe.summary_with_today", { defaultValue: `with ${others} ${others === 1 ? "other" : "others"} today` })}
                  </p>
                )}
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
                          <div key={c.userId} className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                            style={{ width: 32, height: 32, marginLeft: i === 0 ? 0 : -8, border: "1.5px solid #0A1C14", background: "rgba(62,124,122,0.45)", zIndex: 10 - i }}>
                            {c.avatarUrl
                              ? <img src={c.avatarUrl} alt={c.name ?? ""} className="w-full h-full object-cover" />
                              : <span style={{ color: WARM, fontSize: 11, fontWeight: 700, fontFamily: SPACE_GROTESK }}>{initials(c.name ?? "·")}</span>}
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
              </>
            )}

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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
