import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { DEFAULT_TOTAL_BREATHS } from "@/components/CobreatheBreath";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { EARTH_PHOTOS } from "@/lib/earthPhotos";
import { collectForToday } from "@/lib/creationLiturgy";
import { CompanionFaces, companionNamesLine } from "@/components/CompanionFaces";

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

export function CobreatheSummary({
  breathsTaken = DEFAULT_TOTAL_BREATHS,
  placeBreathsMonth,
  placeBreathsAllTime,
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
  placeName,
  placeBreathsToday,
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
  /** The designated place this breath was prayed at, and how many breaths have
   *  been kept there today (this one included). Owner: choosing a place has to
   *  SHOW you the place's numbers — otherwise the choice tells you nothing. */
  placeName?: string | null;
  placeBreathsToday?: number;
  /** …and the same place's longer story. Owner: the place gets its OWN slide
   *  with three categories — today, this month, all time — rather than one
   *  line tacked onto the breaths page. */
  placeBreathsMonth?: number;
  placeBreathsAllTime?: number;
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

  /**
   * Slide 0 = the collect, slide 1 = the PLACE's story, slide 2 = your breaths.
   *
   * Owner: "not just as an extra line on the current closing page, but after
   * the closing collect, a new slide that has three different categories of
   * how many breaths today, this month, in all time." So the place's numbers
   * left the breaths page — where they were one line, and only today's count —
   * and became a slide of their own, directly after the collect.
   *
   * Skipped entirely when no place was chosen: an empty slide asking you to
   * admire three zeroes is worse than no slide.
   */
  const hasPlaceStory = !!placeName && (
    typeof placeBreathsToday === "number"
    || typeof placeBreathsMonth === "number"
    || typeof placeBreathsAllTime === "number"
  );
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const afterCollect = (): 1 | 2 => (hasPlaceStory ? 1 : 2);

  // Owner report: "Creation Prayer has been getting stuck on the last slide and
  // not closing." The overlay caller (CobreatheOverlay) hands off through this
  // exact sequence: Continue → fadeOut=true → wait for THIS component's fade-out
  // transition to call onFadeOutComplete via framer's onAnimationComplete. That
  // callback is not guaranteed — reduced-motion settings, a backgrounded
  // WebView, or the animation getting interrupted can all leave it un-fired,
  // and there is no other path off this screen once continueDisabled has
  // grayed out the button. A bounded fallback timer forces the close so a
  // missed callback is a slightly-early cut, never a permanently stuck screen.
  const closedRef = useRef(false);
  useEffect(() => {
    if (!fadeOut || !onFadeOutComplete) return;
    closedRef.current = false;
    const id = setTimeout(() => {
      if (!closedRef.current) { closedRef.current = true; onFadeOutComplete(); }
    }, 1200); // transition is 600ms; double it as a safety margin
    return () => clearTimeout(id);
  }, [fadeOut, onFadeOutComplete]);

  return (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: fadeIn ? 0 : 1 }}
      animate={{ opacity: fadeOut ? 0 : 1 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      onAnimationComplete={() => {
        if (fadeOut) { if (!closedRef.current) { closedRef.current = true; onFadeOutComplete?.(); } }
        else onEntered?.();
      }}
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
              onClick={() => setStep(afterCollect())}
              className="rounded-full px-9 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98] mt-9 self-start"
              style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
            >
              {t("cobreathe.summary_amen", { defaultValue: "Amen" })}
            </button>
          </motion.div>
        ) : step === 1 ? (
          /**
           * ── Slide 2: THE PLACE'S STORY — today, this month, all time. ──
           *
           * Owner asked for "three different categories", and for the place to
           * stop being a footnote on the breaths page. Counts only: NO NAMES,
           * here or anywhere (owner: "don't show the names of people who
           * prayed at a location"). Choosing a place is a devotional act, not
           * a check-in — the number says a place was kept and that you weren't
           * alone in it, which belongs to everyone; who exactly was there
           * belongs to them.
           */
          <motion.div
            key="place"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="flex-1 flex flex-col items-center justify-center text-center px-8 max-w-xl mx-auto relative w-full"
            style={{ zIndex: 1 }}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
              {t("cobreathe.place_eyebrow", { defaultValue: "Breathed here" })}
            </p>
            <p className="mb-8" style={{ color: WARM, fontFamily: SERIF, fontSize: 26, lineHeight: 1.3 }}>
              {placeName}
            </p>
            <div className="w-full flex flex-col gap-3 mb-9">
              {([
                [t("cobreathe.place_today", { defaultValue: "Today" }), placeBreathsToday],
                [t("cobreathe.place_month", { defaultValue: "This month" }), placeBreathsMonth],
                [t("cobreathe.place_all_time", { defaultValue: "All time" }), placeBreathsAllTime],
              ] as Array<[string, number | undefined]>).map(([label, n]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between rounded-2xl px-5 py-4"
                  style={{ background: "rgba(240,237,230,0.06)", border: "1px solid rgba(200,212,192,0.16)" }}
                >
                  <span className="text-[13px]" style={{ color: "rgba(200,212,192,0.8)", fontFamily: SPACE_GROTESK }}>{label}</span>
                  <span style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 22, fontWeight: 600 }}>
                    {typeof n === "number" ? n.toLocaleString() : "—"}
                    <span className="text-[12px] ml-1.5" style={{ color: "rgba(143,175,150,0.7)", fontWeight: 400 }}>
                      {t("cobreathe.breaths_word", { defaultValue: "breaths" })}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-full px-9 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
            >
              {t("common.continue", { defaultValue: "Continue" })}
            </button>
          </motion.div>
        ) : (
          /* ── Slide 3: the breaths + who you breathed with. ── */
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

            {/* The place's own tally. Being told the number is the point of
                having chosen somewhere — "one" reads as being the first, which
                is a real and good thing to be told, so it isn't hidden. */}
            {/* NO NAMES. Owner: "don't show the names of people who prayed at
                a location."

                This listed everyone who had breathed there today, by name and
                face. Choosing a place is a devotional act, not a check-in, and
                someone praying at their seminary chapel at seven in the
                morning hasn't agreed to appear on a list for whoever opens the
                app next. The COUNT above still says a place was used and that
                you weren't alone in it, which is the part that belongs to
                everyone; who exactly was there belongs to them. */}
            {/* (The place's line USED to sit here. It's a slide of its own now,
                before this one, with all three counts — owner: "not just as an
                extra line on the current closing page." Kept only for a rule
                with no place chosen, where there is no slide to move it to.) */}
            {placeName && !hasPlaceStory && typeof placeBreathsToday === "number" && (
              <p className="text-[12.5px] mb-6" style={{ color: "rgba(200,212,192,0.85)", fontFamily: SPACE_GROTESK }}>
                {placeBreathsToday <= 1
                  ? t("cobreathe.place_first_today", { place: placeName, defaultValue: `The first breath at ${placeName} today` })
                  : t("cobreathe.place_breaths_today", { count: placeBreathsToday, place: placeName, defaultValue: `${placeBreathsToday} breaths at ${placeName} today` })}
              </p>
            )}

            {/* Who you breathed with — the garden-mates you breathed with. */}
            {(
              <>
                {others > 0 && (
                  <p className="text-[12px] mb-6" style={{ color: "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK }}>
                    {t("cobreathe.summary_with_today", { defaultValue: `with ${others} ${others === 1 ? "other" : "others"} today` })}
                  </p>
                )}
                {companions.length > 0 && (() => {
                  const line = companionNamesLine(companions);
                  return (
                    <div className="flex flex-col items-center mb-6">
                      <div className="mb-2">
                        <CompanionFaces companions={companions} edgeColor="#0A1C14" />
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
