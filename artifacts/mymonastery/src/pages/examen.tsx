import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { usePrayerSession } from "@/hooks/usePrayerSession";
import { playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// ── The Daily Examen ────────────────────────────────────────────────────────
// St. Ignatius of Loyola's end-of-day reflective prayer, as a guided
// five-movement flow. A personal practice — no community, no logging
// beyond the prayer-session time row. Pilot-only for now (gated on the
// nav entry in layout.tsx).
//
// The five movements are the classic Ignatian shape: gratitude, asking
// for light, reviewing the day, sorrow, and turning toward tomorrow.
// Each movement is one slide with a calm prompt; the user sets their
// own pace and advances when ready. On mount we play the same opening
// swell the office + prayer-chooser use, so crossing into the Examen
// feels like crossing a threshold.

const FONT = "'Space Grotesk', sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const BG = "#0C1F12";
const WARM = "#F0EDE6";
// Chrome tuned to the Laurel Kearns prayer intro / office deck: a frosted pill
// on a sage hairline. The Examen keeps its green identity, so ACCENT is the
// reference's own sage border.
const ACCENT = "rgba(168,197,160,0.5)";
const EYEBROW = "rgba(143,175,150,0.7)";
const DOT_ON = "#6FAF85";
const DOT_OFF = "rgba(143,175,150,0.28)";
// Exactly the Kearns/office frosted-pill recipe (CobreatheHowToIntro.tsx:242).
const PILL: CSSProperties = {
  background: "rgba(9,26,16,0.42)",
  backdropFilter: "blur(11px)",
  WebkitBackdropFilter: "blur(11px)",
  border: `1px solid ${ACCENT}`,
  color: WARM,
  fontFamily: FONT,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

type Movement = {
  n: number;
  title: string;
  lead: string;
  body: string;
};

// Build the movement list inside the component so it picks up live
// translations (a top-level `const` would freeze the language at module-
// load). Kept identical in shape to the prior MOVEMENTS const.
function useMovements(): Movement[] {
  const { t } = useTranslation();
  return [
    { n: 1, title: t("examen.m1_title"), lead: t("examen.m1_lead"), body: t("examen.m1_body") },
    { n: 2, title: t("examen.m2_title"), lead: t("examen.m2_lead"), body: t("examen.m2_body") },
    { n: 3, title: t("examen.m3_title"), lead: t("examen.m3_lead"), body: t("examen.m3_body") },
    { n: 4, title: t("examen.m4_title"), lead: t("examen.m4_lead"), body: t("examen.m4_body") },
    { n: 5, title: t("examen.m5_title"), lead: t("examen.m5_lead"), body: t("examen.m5_body") },
  ];
}

export default function ExamenPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const MOVEMENTS = useMovements();
  const [, setLocation] = useLocation();
  // step 0 = intro, 1..5 = movements, 6 = closing.
  const [step, setStep] = useState(0);
  // A still landscape backdrop, picked once per mount — a wide photo on web,
  // a bundled leaf on native (pickWideBackground returns null there).
  const backdropPhoto = useMemo(() => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  usePrayerSession(user ? "examen" : null);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Opening swell once, when the user begins (leaving the intro).
  // Fire-and-forget — the helper handles autoplay-policy unlock.
  useEffect(() => {
    if (step === 1) {
      try { playOpeningSwell(); } catch { /* non-fatal */ }
    }
    // The closing gets the resolving submit feedback (swell + haptic).
    if (step === 6) {
      try { triggerSubmitFeedback(); } catch { /* non-fatal */ }
      // Reaching the closing = the Examen is prayed today. Stamps the optional
      // "examen" practice so the Daily-progress anchor (when added) checks off.
      try { markPracticeDoneToday("examen"); } catch { /* non-fatal */ }
    }
  }, [step]);

  if (isLoading || !user) return null;

  const isIntro = step === 0;
  const isClosing = step === 6;
  const movement = !isIntro && !isClosing ? MOVEMENTS[step - 1] : null;

  const isLastMovement = movement != null && movement.n === MOVEMENTS.length;
  // One primary action per slide, in the office's bottom control band.
  const primary = isIntro
    ? { label: t("examen.begin"), onClick: () => setStep(1) }
    : isClosing
      ? { label: t("common.done"), onClick: () => setLocation("/dashboard") }
      : { label: isLastMovement ? t("examen.amen") : t("examen.continue"), onClick: () => setStep((s) => s + 1) };

  return (
    <div
      className="relative"
      style={{ minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, isolation: "isolate", overflow: "hidden" }}
    >
      {/* Backdrop — the Kearns / office treatment: one still landscape held at
          0.22 (CobreatheHowToIntro.tsx:127) under the shared multi-stop dark
          wash (CobreatheHowToIntro.tsx:170, bcp-daily-office.tsx:1783), both on
          zIndex -1 inside the isolated stacking context. NEVER position:fixed
          (iOS flash). No frosted card — the text sits straight on the scenery.
          Falls back to the ambient drift when no photo is available. */}
      {backdropPhoto ? (
        <>
          <motion.img
            src={backdropPhoto}
            alt=""
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.22 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
        </>
      ) : (
        <AnimatedBackground base={BG} variant="subtle" />
      )}
      {/* Top bar — back exits to the offices picker, the same place
          the Examen is reached from. On a movement slide, Back steps
          one movement instead of leaving, so a discreet ✕ on the right
          always offers a one-tap exit (no need to step back through each
          movement to escape). */}
      <header
        className="px-5 pb-2 flex items-center justify-between"
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 2, paddingTop: "max(1.25rem, calc(var(--safe-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={() => {
            if (step > 0 && step < 6) setStep((s) => s - 1);
            else setLocation("/offices");
          }}
          style={{
            color: "rgba(143,175,150,0.8)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 13,
          }}
        >
          {t("examen.back")}
        </button>
        {step > 0 && step < 6 && (
          <button
            type="button"
            onClick={() => setLocation("/offices")}
            aria-label={t("examen.exit", { defaultValue: "Exit" })}
            className="flex items-center justify-center rounded-full"
            style={{
              width: 32, height: 32, background: "rgba(9,26,16,0.42)",
              backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
              border: `1px solid ${ACCENT}`, color: "rgba(240,237,230,0.85)",
              fontSize: 17, lineHeight: 1, cursor: "pointer",
            }}
          >
            ×
          </button>
        )}
      </header>

      {/* Content — vertically centered on the scenery, using the same wrapper
          metrics the Kearns intro uses (CobreatheHowToIntro.tsx:180-185): max
          560 outer / 480 inner, a clamped top pad, and a reserved bottom band
          for the controls. */}
      <main
        className="flex flex-col items-center text-center px-6 w-full"
        style={{
          maxWidth: 560, margin: "0 auto", minHeight: "100dvh", justifyContent: "center",
          paddingTop: "clamp(24px, 6dvh, 72px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 168px)",
          position: "relative", zIndex: 1,
        }}
      >
        <AnimatePresence mode="wait">
          {isIntro && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
                {t("examen.eyebrow")}
              </p>
              <h1 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 16 }}>
                {t("examen.title")}
              </h1>
              <p style={{ color: "rgba(240,237,230,0.86)", margin: 0, fontFamily: FONT, fontSize: "clamp(15.5px, 4.2vw, 18px)", lineHeight: 1.55 }}>
                {t("examen.intro_body")}
              </p>
            </motion.div>
          )}

          {movement && (
            <motion.div
              key={`movement-${movement.n}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
                {t("examen.movement_n_of_m", { n: movement.n, total: MOVEMENTS.length })}
              </p>
              <h2
                className="title-glow-breathe"
                style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 14 }}
              >
                {movement.title}
              </h2>
              <p style={{ color: "rgba(168,197,160,0.92)", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(17px, 4.4vw, 21px)", lineHeight: 1.5, marginBottom: 18 }}>
                {movement.lead}
              </p>
              <p style={{ color: "rgba(240,237,230,0.86)", margin: 0, fontFamily: FONT, fontSize: "clamp(15.5px, 4.2vw, 18px)", lineHeight: 1.55 }}>
                {movement.body}
              </p>
            </motion.div>
          )}

          {isClosing && (
            <motion.div
              key="closing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ fontSize: 40, marginBottom: 18 }} aria-hidden>
                🌿
              </p>
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 16 }}>
                {t("examen.day_is_held")}
              </h2>
              <p style={{ color: "rgba(240,237,230,0.94)", margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(19px, 4.8vw, 24px)", lineHeight: 1.6 }}>
                {t("examen.closing_body")}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom controls — the office band: quiet movement dots where the deck
          puts its "X of Y" counter, then the frosted pill
          (CobreatheHowToIntro.tsx:234-244). */}
      <div className="absolute left-0 right-0 flex flex-col items-center" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", zIndex: 2 }}>
        {movement && (
          <div className="flex items-center justify-center gap-1.5" style={{ marginBottom: 16 }}>
            {MOVEMENTS.map((m) => (
              <span
                key={m.n}
                className="block rounded-full"
                style={{ width: 6, height: 6, background: m.n <= movement.n ? DOT_ON : DOT_OFF }}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={primary.onClick}
          className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={PILL}
        >
          {primary.label}
        </button>
      </div>
    </div>
  );
}
