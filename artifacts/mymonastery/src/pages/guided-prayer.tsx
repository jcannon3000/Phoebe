import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { markGuidedPrayerPrayed } from "@/lib/cacReadState";

// ── Simple Guided Prayer (PACT) ─────────────────────────────────────────────
// A four-movement outline — Praise, Confession, Thanksgiving, Supplication —
// as a guided flow, modeled directly on pages/examen.tsx's shape: one movement
// per slide, the user's own pace, no timer.
//
// SIDE-SCOPED, like Psalms: a per-side alternative to the BCP office
// (/guided-prayer?side=morning|evening). markGuidedPrayerPrayed(side) both
// stamps the local per-side day-flag AND posts a devotion-surface
// prayer_session (see lib/cacReadState.ts) so it credits office-history-week /
// the streak / practice-week exactly like Praying the Psalms does — no
// separate prayer-session surface needed.

const FONT = "'Space Grotesk', sans-serif";
const BG = "#0C1F12";

type Movement = {
  n: number;
  title: string;
  lead: string;
  body: string;
};

// Built inside the component so it picks up live translations (a top-level
// const would freeze the language at module-load) — same reasoning as
// useMovements() in pages/examen.tsx.
function useMovements(): Movement[] {
  const { t } = useTranslation();
  return [
    { n: 1, title: t("guided_prayer.m1_title"), lead: t("guided_prayer.m1_lead"), body: t("guided_prayer.m1_body") },
    { n: 2, title: t("guided_prayer.m2_title"), lead: t("guided_prayer.m2_lead"), body: t("guided_prayer.m2_body") },
    { n: 3, title: t("guided_prayer.m3_title"), lead: t("guided_prayer.m3_lead"), body: t("guided_prayer.m3_body") },
    { n: 4, title: t("guided_prayer.m4_title"), lead: t("guided_prayer.m4_lead"), body: t("guided_prayer.m4_body") },
  ];
}

export default function GuidedPrayerPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const MOVEMENTS = useMovements();
  const [, setLocation] = useLocation();
  // step 0 = intro, 1..4 = movements, 5 = closing.
  const [step, setStep] = useState(0);
  const side: "morning" | "evening" = (() => {
    try {
      const s = new URLSearchParams(window.location.search).get("side");
      return s === "evening" ? "evening" : "morning";
    } catch { return "morning"; }
  })();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Opening swell once, when the user begins (leaving the intro).
  useEffect(() => {
    if (step === 1) {
      try { playOpeningSwell(); } catch { /* non-fatal */ }
    }
    // The closing gets the resolving submit feedback (swell + haptic).
    if (step === MOVEMENTS.length + 1) {
      try { triggerSubmitFeedback(); } catch { /* non-fatal */ }
      // Reaching the closing = THIS side's Simple Guided Prayer is prayed
      // today — stamps only `side`, so praying the morning form doesn't
      // mark the evening one done (a user can have it on both sides).
      try { markGuidedPrayerPrayed(side); } catch { /* non-fatal */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (isLoading || !user) return null;

  const isIntro = step === 0;
  const isClosing = step === MOVEMENTS.length + 1;
  const movement = !isIntro && !isClosing ? MOVEMENTS[step - 1] : null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: BG, color: "#F0EDE6", fontFamily: FONT }}
    >
      {/* Top bar — back exits to the offices picker, the same place Guided
          Prayer is reached from. On a movement slide, Back steps one
          movement instead of leaving, so a discreet ✕ on the right always
          offers a one-tap exit. */}
      <header
        className="px-5 pb-2 flex items-center justify-between"
        style={{ paddingTop: "max(1.25rem, calc(var(--safe-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={() => {
            if (step > 0 && step < MOVEMENTS.length + 1) setStep((s) => s - 1);
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
          {t("guided_prayer.back")}
        </button>
        {step > 0 && step < MOVEMENTS.length + 1 && (
          <button
            type="button"
            onClick={() => setLocation("/offices")}
            aria-label={t("guided_prayer.exit", { defaultValue: "Exit" })}
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

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
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
                {t("guided_prayer.eyebrow")}
              </p>
              <h1
                className="text-3xl font-semibold leading-tight mb-3"
                style={{ color: "#F0EDE6" }}
              >
                {t("guided_prayer.title")}
              </h1>
              <p
                className="text-[15px] leading-relaxed mb-8"
                style={{ color: "#8FAF96" }}
              >
                {t("guided_prayer.intro_body")}
              </p>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {t("guided_prayer.begin")}
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
                {t("guided_prayer.movement_n_of_m", { n: movement.n, total: MOVEMENTS.length })}
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
                {movement.n === MOVEMENTS.length ? t("guided_prayer.amen") : t("guided_prayer.continue")}
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
                🙌
              </p>
              <h2
                className="text-2xl font-semibold leading-tight mb-3"
                style={{ color: "#F0EDE6" }}
              >
                {t("guided_prayer.day_is_held")}
              </h2>
              <p
                className="text-[15px] leading-relaxed mb-8"
                style={{ color: "#8FAF96" }}
              >
                {t("guided_prayer.closing_body")}
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
      </main>
    </div>
  );
}
