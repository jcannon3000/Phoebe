import { useState, useEffect, useMemo } from "react";
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
const BG = "#0C1F12";

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

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{ background: BG, color: "#F0EDE6", fontFamily: FONT, isolation: "isolate", overflow: "hidden" }}
    >
      {/* Ambient drifting glow, matching Contemplation/Cobreathe — plus a still
          landscape photo (wide on web, a bundled leaf on native) washed under a
          dark vignette so movement text stays legible over it. */}
      <AnimatedBackground base={BG} variant="subtle" />
      {backdropPhoto && (
        <>
          <img src={backdropPhoto} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35, zIndex: 0 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(180deg, rgba(8,22,15,0.55) 0%, rgba(8,22,15,0.7) 45%, rgba(8,22,15,0.86) 100%)" }} />
        </>
      )}
      {/* Top bar — back exits to the offices picker, the same place
          the Examen is reached from. On a movement slide, Back steps
          one movement instead of leaving, so a discreet ✕ on the right
          always offers a one-tap exit (no need to step back through each
          movement to escape). */}
      <header
        className="px-5 pb-2 flex items-center justify-between"
        style={{ position: "relative", zIndex: 1, paddingTop: "max(1.25rem, calc(var(--safe-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={() => {
            if (step > 0 && step < 6) setStep((s) => s - 1);
            else setLocation("/offices");
          }}
          className="text-sm"
          style={{
            color: "rgba(143,175,150,0.8)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: FONT,
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
              width: 32, height: 32, background: "rgba(46,107,64,0.16)",
              border: "1px solid rgba(46,107,64,0.32)", color: "rgba(200,212,192,0.85)",
              fontSize: 17, lineHeight: 1, cursor: "pointer",
            }}
          >
            ×
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12" style={{ position: "relative", zIndex: 1 }}>
        <div
          className="w-full max-w-md"
          style={{
            borderRadius: 28, padding: "40px 30px",
            background: "rgba(9,26,16,0.34)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(46,107,64,0.30)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
        <AnimatePresence mode="wait">
          {isIntro && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="w-full max-w-md text-center"
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: "rgba(143,175,150,0.55)" }}
              >
                {t("examen.eyebrow")}
              </p>
              <h1
                className="text-3xl font-semibold leading-tight mb-3"
                style={{ color: "#F0EDE6" }}
              >
                {t("examen.title")}
              </h1>
              <p
                className="text-[15px] leading-relaxed mb-8"
                style={{ color: "#8FAF96" }}
              >
                {t("examen.intro_body")}
              </p>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {t("examen.begin")}
              </button>
            </motion.div>
          )}

          {movement && (
            <motion.div
              key={`movement-${movement.n}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="w-full max-w-md text-center"
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-widest mb-4"
                style={{ color: "rgba(143,175,150,0.55)" }}
              >
                {t("examen.movement_n_of_m", { n: movement.n, total: MOVEMENTS.length })}
              </p>
              <h2
                className="title-glow-breathe text-3xl font-semibold leading-tight mb-2"
                style={{ color: "#F0EDE6" }}
              >
                {movement.title}
              </h2>
              <p
                className="text-base italic mb-6"
                style={{ color: "#A8C5A0", fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {movement.lead}
              </p>
              <p
                className="text-[16px] leading-relaxed mb-9"
                style={{ color: "rgba(240,237,230,0.92)" }}
              >
                {movement.body}
              </p>
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {movement.n === MOVEMENTS.length ? t("examen.amen") : t("examen.continue")}
              </button>
              {/* Movement dots — quiet progress, no numbers shouting. */}
              <div className="flex items-center justify-center gap-1.5 mt-8">
                {MOVEMENTS.map((m) => (
                  <span
                    key={m.n}
                    className="block rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      background: m.n <= movement.n
                        ? "#6FAF85"
                        : "rgba(46,107,64,0.3)",
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {isClosing && (
            <motion.div
              key="closing"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full max-w-md text-center"
            >
              <p className="text-[40px] mb-4" aria-hidden>
                🌿
              </p>
              <h2
                className="text-2xl font-semibold leading-tight mb-3"
                style={{ color: "#F0EDE6" }}
              >
                {t("examen.day_is_held")}
              </h2>
              <p
                className="text-[15px] leading-relaxed mb-8"
                style={{ color: "#8FAF96" }}
              >
                {t("examen.closing_body")}
              </p>
              <button
                type="button"
                onClick={() => setLocation("/dashboard")}
                className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {t("common.done")}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
