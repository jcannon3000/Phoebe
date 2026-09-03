import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { markGuidedPrayerPrayed, VTS_TODAY_URL, isVtsPublishingDay, recordVtsOpened } from "@/lib/cacReadState";
import { useRhythmState } from "@/hooks/useRhythmState";
import { openExternal } from "@/lib/openExternal";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { getSideLevel } from "@/lib/officePrefs";
import { PracticeSwitcher } from "@/components/PracticeSwitcher";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { useActivePrayerIntentions } from "@/hooks/usePrayerIntentions";
import { usePrayerListEnabled } from "@/hooks/usePrayerRequests";

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
const SERIF = "Georgia, 'Times New Roman', serif";
const BG = "#0C1F12";
const WARM = "#F0EDE6";
// Same Kearns/office chrome as the Examen, but PACT keeps its terracotta
// identity — the hairline, eyebrow and dots are warmed; everything else
// (frosting, wash, metrics) is the shared recipe.
const ACCENT = "rgba(206,158,143,0.5)";
const EYEBROW = "rgba(206,158,143,0.75)";
const DOT_ON = "#C99384";
const DOT_OFF = "rgba(168,108,96,0.32)";
// The Kearns/office frosted-pill recipe (CobreatheHowToIntro.tsx:242).
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

/**
 * The amen that makes you wait — prayer-mode's AmenButton, in this deck's pill.
 *
 * Three seconds before the tap is accepted, with the wash filling underneath.
 * Owner: "the slides as if that has the amen timing." The reason is the same
 * one prayer-mode records: without it, tappers rip through a person's prayer
 * list in a few seconds, and each prayer stops being a moment.
 *
 * KEYED by the slide at the call site, so it remounts per prayer and the timer
 * is always fresh-false — the bug prayer-mode's own note warns about is "the
 * first one works and then no others", which is exactly what a shared, unkeyed
 * instance produces.
 *
 * The 3s here and the 3s in index.css's .amen-progress-fill are one duration
 * in two languages; they're kept together deliberately (see that rule's note).
 */
function HeldAmenPill({ label, onAmen }: { label: string; onAmen: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReady(true);
      // The soft "light" haptic marks the reveal; the tap itself gets the
      // medium one below — two different feels for two different moments.
      try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } })); } catch { /* non-fatal */ }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        if (!ready) return;
        try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } })); } catch { /* non-fatal */ }
        onAmen();
      }}
      // aria-disabled, not disabled: a disabled button leaves the
      // accessibility tree and can't say why it won't respond.
      aria-disabled={!ready}
      className="rounded-full py-3 px-12 relative overflow-hidden active:scale-[0.99]"
      style={{ ...PILL, cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.75, transition: "opacity 360ms ease-out" }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 amen-progress-fill"
        style={{
          background: "rgba(46,107,64,0.45)",
          pointerEvents: "none",
          opacity: ready ? 0 : 1,
          transition: "opacity 360ms ease-out",
        }}
      />
      <span style={{ position: "relative" }}>{label}</span>
    </button>
  );
}

export default function GuidedPrayerPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const MOVEMENTS = useMovements();
  const [, setLocation] = useLocation();
  // step 0 = intro, 1..4 = movements, 5 = closing.
  const [step, setStep] = useState(0);
  // A still landscape backdrop, picked once per mount — a wide photo on web,
  // a bundled leaf on native (pickWideBackground returns null there).
  const backdropPhoto = useMemo(() => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  // An explicit ?side= (from that side's home card) always wins. Without one —
  // e.g. opened from Practices — do NOT blindly assume morning: that credited
  // Morning Prayer for a 9 PM sit, and could even keep a side the user doesn't
  // have PACT on. Fall back to the side whose window the clock is in, and only
  // to a side that's actually active. Same rule contemplation uses.
  const side: "morning" | "evening" = (() => {
    try {
      const s = new URLSearchParams(window.location.search).get("side");
      if (s === "morning" || s === "evening") return s;
    } catch { /* ignore */ }
    // A side "carries PACT" if it's set to guided-prayer OR to examen — the
    // customizer's evening row is LABELLED "Simple Guided Prayer" but stores
    // the examen level, and this same page serves it. Testing only for
    // guided-prayer meant evening never matched, so the clock branch below was
    // skipped and a 9 PM sit opened from Practices (no ?side=) credited MORNING.
    const carriesPact = (s: "morning" | "evening") => {
      const lvl = getSideLevel(s);
      return lvl === "guided-prayer" || lvl === "examen";
    };
    const morningActive = carriesPact("morning");
    const eveningActive = carriesPact("evening");
    // Only one side carries PACT → that's the one, whatever the hour.
    if (morningActive && !eveningActive) return "morning";
    if (eveningActive && !morningActive) return "evening";
    // Both (or neither) → go by the clock, using the same 5 PM boundary the
    // evening office and the evening home cards use.
    return new Date().getHours() >= 17 ? "evening" : "morning";
  })();

  // Simple Guided Prayer / the Examen (via this page) is open to everyone —
  // signed in or not, same as examen.tsx. It used to bounce a signed-out
  // visitor to "/" and render bare null while auth resolved, which meant
  // tapping into the practice from a guest session (this route is in
  // GUEST_ALLOWED_EXACT / PILOT_ALLOWED_EXACT) could land on a blank screen.
  // The practice needs no account; markGuidedPrayerPrayed/markPracticeDoneToday
  // below work fine for a guest's local, device-only state.

  // Opening swell once, when the user begins (leaving the intro).
  useEffect(() => {
    if (step === 1) {
      try { playOpeningSwell(); } catch { /* non-fatal */ }
    }
    // The closing gets the resolving submit feedback (swell + haptic).
    if (step === MOVEMENTS.length + 1) {
      try { triggerSubmitFeedback(); } catch { /* non-fatal */ }
      // Reaching the closing = THIS side's prayer is prayed today. On evening
      // this screen doubles as the Examen (relabeled "Simple Guided Prayer"
      // but the side's actual anchor level is "examen") — crediting the
      // guided-prayer tracker there is a no-op (sideIsSetTo gates on the REAL
      // level), so the Home card never flipped and no completion swell fired.
      // Credit whichever tracker matches this side's actual configured level.
      //
      // Off-schedule guard (mirrors examen.tsx): the `side` resolution above
      // short-circuits straight to "evening" whenever evening is the ONLY
      // side carrying PACT/Examen, with no clock check — so opening this via
      // Practices at, say, 8 AM would wrongly credit evening's routine hours
      // early. Opening from that side's own home card always carries ?side=
      // (begin-prayer.tsx) and counts at any hour — that IS the scheduled
      // sit. Without ?side=, only credit an "evening" resolution once it's
      // actually evening (same 5 PM boundary the office/Examen use).
      const explicitSide = (() => {
        try {
          const s = new URLSearchParams(window.location.search).get("side");
          return s === "morning" || s === "evening" ? s : null;
        } catch { return null; }
      })();
      const beforeEveningWindow = new Date().getHours() < 17;
      const offScheduleViaPractices = !explicitSide && side === "evening" && beforeEveningWindow;
      if (!offScheduleViaPractices) {
        try {
          if (getSideLevel(side) === "examen") markPracticeDoneToday("examen");
          else markGuidedPrayerPrayed(side);
        } catch { /* non-fatal */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // The "what's next" slide that used to close this prayer is GONE (owner):
  // every slideshow now ends by landing on the home screen, where the card's
  // completion animation plays and the Next list already names what's next —
  // the same ending reading a newsletter has always had.
  // The "what's next" slide is GONE (owner): every slideshow now ends by
  // landing on the home screen, where the card's completion animation plays
  // and the Next list already names what's next — the same ending reading a
  // newsletter has always had. Held at null (rather than deleting the step
  // arithmetic below) so the tail — prayer list, collect — keeps its shape;
  // it simply compacts up into this slot.

  // The reader's own private prayer list, tacked on at the very end — the
  // same way the community intercessions fold into the BCP office. Skipped
  // for the Examen: this page doubles as the Examen when the side's actual
  // configured level is "examen" (relabeled "Simple Guided Prayer" here),
  // and the Examen shouldn't pick up an unrelated tail practice.
  const prayerListEnabled = usePrayerListEnabled();
  const activeIntentions = useActivePrayerIntentions();
  const isExamen = getSideLevel(side) === "examen";
  const showPrayerList = prayerListEnabled && !isExamen && activeIntentions.length > 0;

  /**
   * NO COLLECT. Owner (2026-09-03): "take the collect off simple guided
   * prayer — we don't want it to show on the end of the slideshow."
   *
   * It had been added on the office's precedent (BCP p. 98's "one or more
   * Collects, the Collect of the Day being first"), but Simple Guided Prayer
   * is three minutes of praise, confession, thanksgiving and supplication —
   * not an office — and it should end where its own shape ends.
   *
   * The step arithmetic below still asks about `showCollect`, and it is
   * always false now: the constant keeps every offset honest (the prayer
   * list, the Dean's Commentary and the closing all count from it) rather
   * than being unpicked by hand, which is how an off-by-one lands in a deck.
   * The fetch is gone with it — no request, nothing to render.
   */
  const showCollect = false;

  /**
   * THE DEAN'S COMMENTARY, offered at the end — but only to someone who is
   * actually waiting for it.
   *
   * Owner: "if they're subscribed to The VTS Dean Commentary, let's have a
   * slide that says would you like to read the Dean commentary? Only if they
   * haven't read it yet. And so they could go straight from the simple guided
   * prayer to the Dean's commentary."
   *
   * Three gates, and each one is the difference between an offer and a nag:
   *   • SUBSCRIBED — `reflections` from useRhythmState is the set the reader
   *     actually keeps, which is the same value the home card reads. Deriving
   *     "do they have VTS" any other way is how the card and the slide come to
   *     disagree, which this app has done five times.
   *   • NOT READ YET — the same set carries `done`, so the slide disappears
   *     the moment they read it, wherever they read it from.
   *   • A PUBLISHING DAY — VTS posts on weekdays. Offering it on a Sunday
   *     sends someone to Friday's commentary as if it were today's.
   */
  const { reflections } = useRhythmState();
  const vtsUnread = reflections.some((r) => r.source === "vts" && !r.done);
  const showDeanOffer = vtsUnread && isVtsPublishingDay();

  const isIntro = step === 0;
  const isClosing = step === MOVEMENTS.length + 1;
  // The what's-next slide used to sit here, between the closing and the tail.
  // With it gone the prayer list (and then the collect) follow the closing
  // directly.
  const prayerListStep = MOVEMENTS.length + 2;
  /**
   * ONE PRAYER PER SLIDE, held for the amen — not a list to read past.
   *
   * Owner: "I asked it to look just like when the prayer list is in the
   * offices, the slides as if that has the amen timing." This was a single
   * slide stacking every intention in a scroll box with an "Add to your list"
   * link under it — a management screen at the end of a prayer, which is why
   * the reply was "I didn't ask for this." The prayer SLIDESHOW is the thing
   * it should have been: each intention alone on the screen, and an Amen that
   * won't accept the tap for three seconds, so the slide is a moment rather
   * than something to swipe through.
   *
   * The hold is prayer-mode's AMEN_HOLD_MS and its .amen-progress-fill wash,
   * shared rather than re-timed — index.css keeps the CSS animation and the JS
   * timer in step, and a second copy of the number is how they drift apart.
   */
  const prayerCount = showPrayerList ? activeIntentions.length : 0;
  const prayerIndex = showPrayerList && step >= prayerListStep && step < prayerListStep + prayerCount
    ? step - prayerListStep
    : -1;
  const prayer = prayerIndex >= 0 ? activeIntentions[prayerIndex] : null;
  const collectStep = prayerListStep + prayerCount;
  const isPrayerList = prayer != null;
  /** Last of the tail — after the collect, the way a reading follows prayer. */
  const deanStep = collectStep + (showCollect ? 1 : 0);
  const isDean = showDeanOffer && step === deanStep;
  const movement = !isIntro && !isClosing && !isPrayerList && !isDean ? MOVEMENTS[step - 1] : null;

  const isLastMovement = movement != null && movement.n === MOVEMENTS.length;
  const hasTail = showPrayerList || showCollect || showDeanOffer;
  // One primary action per slide, in the office's bottom control band.
  const primary = isIntro
    ? { label: t("guided_prayer.begin"), onClick: () => setStep(1) }
    : isClosing
      ? (hasTail
          ? { label: t("guided_prayer.continue"), onClick: () => setStep((s) => (s + 1) as typeof step) }
          : { label: t("common.done"), onClick: () => setLocation("/dashboard") })
      : isPrayerList
        // Always "Amen", and always the next thing — the last prayer hands on
        // to the collect when there is one, and otherwise ends the practice.
        // (The advance itself is wired through the held button below, so this
        // onClick is what IT calls once the hold is up.)
        ? (showCollect || showDeanOffer || prayerIndex < prayerCount - 1
            ? { label: t("guided_prayer.amen"), onClick: () => setStep((s) => (s + 1) as typeof step) }
            : { label: t("guided_prayer.amen"), onClick: () => setLocation("/dashboard") })
      /* (The collect's own button went with its slide.) */
      : isDean
        /**
         * "No thank you" is the PRIMARY here, and the offer is the secondary
         * below it. The prayer is finished either way; this slide must not
         * feel like a toll gate on the way out, and making the reading the
         * big green button would make declining it the awkward choice.
         */
        ? { label: t("common.done", { defaultValue: "Done" }), onClick: () => setLocation("/dashboard") }
      : { label: isLastMovement ? t("guided_prayer.amen") : t("guided_prayer.continue"), onClick: () => setStep((s) => s + 1) };

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
      {/* Top bar — back exits to the offices picker, the same place Guided
          Prayer is reached from. On a movement slide, Back steps one
          movement instead of leaving, so a discreet ✕ on the right always
          offers a one-tap exit. */}
      <header
        className="px-5 pb-2 flex items-center justify-between"
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 2, paddingTop: "max(1.25rem, calc(var(--safe-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={() => {
            if (step > 0 && step < MOVEMENTS.length + 1) setStep((s) => s - 1);
            // HOME, not the offices picker — same fix as the Examen's exit.
            // Owner: "when i x out of the examen, it goes to daily prayer, it
            // should go home … make sure this is not happening on simple
            // guided." It was. Simple Guided is reached from the home card,
            // the rhythm list, the Practices menu and the side switcher, so
            // exiting to an office was a guess that was usually wrong. Amen and
            // Done already land on the dashboard.
            else setLocation("/dashboard");
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
          {t("guided_prayer.back")}
        </button>
        {step > 0 && step < MOVEMENTS.length + 1 && (
          <button
            type="button"
            onClick={() => setLocation("/dashboard")}
            aria-label={t("guided_prayer.exit", { defaultValue: "Exit" })}
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
                {isExamen ? t("guided_prayer.examen_eyebrow", { defaultValue: "Review the day with God" }) : t("guided_prayer.eyebrow")}
              </p>
              <h1 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 16 }}>
                {/* This page serves BOTH shapes. Titling it from the page
                    rather than from the practice meant someone who chose the
                    Examen opened a screen headed "Simple Guided Prayer". */}
                {isExamen ? t("rhythm.card_examen", { defaultValue: "The Examen" }) : t("guided_prayer.title")}
              </h1>
              <p style={{ color: "rgba(240,237,230,0.86)", margin: 0, fontFamily: FONT, fontSize: "clamp(15.5px, 4.2vw, 18px)", lineHeight: 1.55 }}>
                {t("guided_prayer.intro_body")}
              </p>
              {/* A different practice, just for today (owner) — swaps this
                  side's anchor for the day and walks into the chosen one. */}
              <div style={{ marginTop: 22 }}>
                <PracticeSwitcher side={side} current={isExamen ? "examen" : "guided-prayer"} />
              </div>
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
                {t("guided_prayer.movement_n_of_m", { n: movement.n, total: MOVEMENTS.length })}
              </p>
              <h2
                className="title-glow-breathe"
                style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 14 }}
              >
                {movement.title}
              </h2>
              <p style={{ color: "rgba(226,186,172,0.92)", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(17px, 4.4vw, 21px)", lineHeight: 1.5, marginBottom: 18 }}>
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
                🙌🏽
              </p>
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 16 }}>
                {t("guided_prayer.day_is_held")}
              </h2>
              <p style={{ color: "rgba(240,237,230,0.94)", margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(19px, 4.8vw, 24px)", lineHeight: 1.6 }}>
                {t("guided_prayer.closing_body")}
              </p>
            </motion.div>
          )}
          {prayer && (
            <motion.div
              key={`prayer-${prayerIndex}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full flex flex-col items-center"
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 18 }}>
                {t("guided_prayer.prayer_list_eyebrow", { defaultValue: "Your Prayer List" })}
              </p>
              {/* The prayer itself, set like every other prayer in the app —
                  the serif italic the office and the slideshow both use, at
                  the size a thing you are praying gets, not the size a row in
                  a list gets. */}
              <p style={{ color: "rgba(240,237,230,0.94)", margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(19px, 4.8vw, 24px)", lineHeight: 1.6 }}>
                {prayer.headline}
              </p>
              {prayer.subline && (
                <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 13, margin: "12px 0 0" }}>
                  {prayer.subline}
                </p>
              )}
              {/* Where you are in the list, when there is more than one — the
                  same quiet dots the movements use, so the tail reads as part
                  of the same deck. */}
              {prayerCount > 1 && (
                <div className="flex items-center justify-center gap-1.5" style={{ marginTop: 22 }}>
                  {activeIntentions.map((_, i) => (
                    <span
                      key={i}
                      className="block rounded-full"
                      style={{ width: 6, height: 6, background: i <= prayerIndex ? DOT_ON : DOT_OFF }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
          {/* The Collect of the Day used to close this deck. Owner: "take the
              collect off simple guided prayer — we don't want it to show on
              the end of the slideshow." Removed with its fetch; see
              showCollect above for why the step arithmetic still names it. */}

          {/* The Dean's Commentary offer — the last slide, and only for a
              reader who keeps it and hasn't read it today. See showDeanOffer. */}
          {isDean && (
            <motion.div
              key="dean"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
                {t("guided_prayer.dean_eyebrow", { defaultValue: "Virginia Theological Seminary" })}
              </p>
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(20px, 5vw, 28px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 14 }}>
                {t("guided_prayer.dean_title", { defaultValue: "Would you like to read the Dean's Commentary?" })}
              </h2>
              <p style={{ color: "rgba(240,237,230,0.9)", margin: 0, fontFamily: FONT, fontSize: "clamp(15px, 4vw, 17px)", lineHeight: 1.6 }}>
                {t("guided_prayer.dean_body", { defaultValue: "Today's has not been read yet." })}
              </p>
              <button
                type="button"
                onClick={() => {
                  // Marks it read and opens it — the same call the home card
                  // makes, so the card, the anchor and this slide can never
                  // disagree about whether today's was read.
                  recordVtsOpened();
                  openExternal(VTS_TODAY_URL, { reader: true });
                }}
                className="rounded-full py-3 px-8 transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{
                  marginTop: 24, background: "rgba(9,26,16,0.42)",
                  backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
                  border: "1px solid rgba(168,197,160,0.5)", color: WARM,
                  fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: "pointer",
                }}
              >
                {t("guided_prayer.dean_open", { defaultValue: "Read it now" })} &rarr;
              </button>
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
        {/* On a prayer slide the pill IS the amen, and it holds — see
            HeldAmenPill. Everywhere else it's the ordinary control. */}
        {prayer ? (
          <HeldAmenPill key={`amen-${prayerIndex}`} label={primary.label} onAmen={primary.onClick} />
        ) : (
          <button
            type="button"
            onClick={primary.onClick}
            className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={PILL}
          >
            {primary.label}
          </button>
        )}
      </div>
    </div>
  );
}
