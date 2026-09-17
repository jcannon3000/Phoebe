/**
 * Three breaths before the home — the moment after the native app-open splash.
 *
 * Owner, 2026-09-16: "What if we build an intro after the splash open where it
 * would invite the user to take three breathes before entering. Use the
 * breathing together ui, and then after three it would fade into the home
 * screen. it doesnt need to be synced to the global breathe", then "have a skip
 * button at the bottom" and "have the circles ui the same as breathing
 * together".
 *
 * SAME RINGS, OWN CLOCK. The colours, radii, stroke, frost mask, ring box and
 * the per-breath haptic all come from lib/breathRings — the module Creation
 * Prayer's breath draws from — so the two cannot drift apart. What is
 * deliberately different is time: that breath rides the server clock so the
 * world breathes together; this one starts on an inhale the moment it appears,
 * because nobody is waiting on it.
 *
 * Also different, by the owner's word (2026-09-16): no globe in the middle
 * ("take globe out"), and the rings sit at the screen's vertical centre ("move
 * the circles to the verticle center") rather than on Creation Prayer's
 * golden-ratio line. Haptics as Creation Prayer has them ("make sure there are
 * haptics on the intro breathing"); still no sound.
 *
 * Pared back the same evening (owner): the Creator / Sustainer / Redeemer names
 * that sat under the rings for one pass came out ("On the splash take out the
 * sustainer redeemer... part"), and so did Creation Prayer's "n of 3" counter
 * ("take out the 1 of 3"), and "Breathe In / Breathe Out" moved from the bottom
 * row into the names' place under the rings, centred, in italic Georgia ("where
 * the sustainer text is have it do breath in and out italic georgia centered
 * there"), still rising and falling with each half-breath. What is left is the
 * invitation above the rings, the phase word the same distance below, and Skip.
 *
 * It only breathes and says when it is done. Whether it appears at all,
 * and what happens afterwards, belong to OpeningSplash (components/layout.tsx).
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  INHALE_MS, EXHALE_MS, CYCLE_MS,
  RING_IN, RING_OUT, RING_GLOW, RING_R, RING_CIRC, RING_SW,
  SESSION_RING, SESSION_R, SESSION_CIRC, SESSION_TRACK, BREATH_RING_MASK,
  breathGlobeBoxPx, breathHaptic,
} from "@/lib/breathRings";

const WARM = "#F0EDE6";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
/** The invitation above the rings and the phase word below sit this far from them (of the screen's height). */
const TEXT_GAP = "8%";

export function BreathIntro({
  startedAt,
  breaths,
  onDone,
}: {
  /** Epoch ms the first inhale began. Stored, so a remounted splash resumes the same breaths. */
  startedAt: number;
  breaths: number;
  onDone: (how: "complete" | "skip") => void;
}) {
  const { t } = useTranslation();
  const ringInRef = useRef<SVGCircleElement>(null);
  const ringOutRef = useRef<SVGCircleElement>(null);
  const sessionRingRef = useRef<SVGCircleElement>(null);
  const phaseWordRef = useRef<HTMLParagraphElement>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const totalMs = breaths * CYCLE_MS;

  const inhaleAt = (now: number): boolean => Math.max(0, now - startedAt) % CYCLE_MS < INHALE_MS;
  const [inhaleWord, setInhaleWord] = useState<boolean>(() => inhaleAt(Date.now()));

  const [boxPx, setBoxPx] = useState<number>(() => {
    try { return breathGlobeBoxPx(window.innerWidth); } catch { return 158; }
  });
  useEffect(() => {
    const onResize = () => { try { setBoxPx(breathGlobeBoxPx(window.innerWidth)); } catch { /* ignore */ } };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize); };
  }, []);

  // The rings, driven straight on the DOM each frame exactly as Creation
  // Prayer's are: the light ring draws forward over the inhale and HOLDS; the
  // dark ring sweeps forward over it on the exhale; the inner ring fills once
  // across all three breaths. Only the phase word re-renders, and only when it
  // actually changes — twice a breath.
  useEffect(() => {
    let raf = 0;
    // HAPTICS AS CREATION PRAYER HAS THEM: a soft swell as each inhale begins
    // and a 1.618× stronger one as each exhale begins, then that breath's own
    // payoff swell once all three are kept. The first inhale gets its haptic
    // only on a fresh start — a splash remounting mid-breath (see OpeningSplash)
    // picks up silently rather than buzzing out of step.
    let lastInhale: boolean | null = null;
    let lastBreath = 0;
    {
      const since = Math.max(0, Date.now() - startedAt);
      if (since < 400) breathHaptic(false);
      lastInhale = since % CYCLE_MS < INHALE_MS;
      lastBreath = Math.floor(since / CYCLE_MS);
    }
    const setOffsets = (fIn: number, fOut: number, fSession: number) => {
      if (ringInRef.current) ringInRef.current.style.strokeDashoffset = (RING_CIRC * (1 - fIn)).toFixed(2);
      if (ringOutRef.current) ringOutRef.current.style.strokeDashoffset = (RING_CIRC * (1 - fOut)).toFixed(2);
      if (sessionRingRef.current) sessionRingRef.current.style.strokeDashoffset = (SESSION_CIRC * (1 - fSession)).toFixed(2);
    };
    const loop = () => {
      const now = Date.now();
      const since = Math.max(0, now - startedAt);
      if (since >= totalMs) {
        // Rest on the last exhale, rings full, while the splash fades away —
        // never snap back to empty under the fade.
        setOffsets(1, 1, 1);
        if (!doneRef.current) {
          doneRef.current = true;
          try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "breath-complete" } })); } catch { /* web */ }
          onDoneRef.current("complete");
        }
        return;
      }
      const pos = since % CYCLE_MS;
      const inhale = pos < INHALE_MS;
      // Up from nothing at the start of each half-breath, down to nothing at
      // the turn — the same curve as Creation Prayer's phase word.
      const rise = Math.sin(Math.PI * (inhale ? pos / INHALE_MS : (pos - INHALE_MS) / EXHALE_MS)).toFixed(4);
      if (phaseWordRef.current) phaseWordRef.current.style.opacity = rise;
      const breathIdx = Math.floor(since / CYCLE_MS);
      // A turn of the breath — including the start of the next breath's inhale,
      // which a frame that skips the whole exhale (a stalled tab) would miss if
      // this compared the phase alone.
      if (inhale !== lastInhale || breathIdx !== lastBreath) {
        lastInhale = inhale;
        lastBreath = breathIdx;
        if (!doneRef.current) breathHaptic(!inhale);
      }
      setOffsets(
        inhale ? pos / INHALE_MS : 1,
        inhale ? 0 : (pos - INHALE_MS) / EXHALE_MS,
        since / totalMs,
      );
      setInhaleWord(inhaleAt(now));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, totalMs]);

  const skip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current("skip");
  };

  return (
    <motion.div
      // Fades in over the splash's own photograph, in place — never rises.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Anchored by its BOTTOM edge a TEXT_GAP above the rings, mirroring the
          phase word below them, so the two stay balanced about the circles
          whatever the screen height (and however many lines this wraps to). */}
      <p
        style={{
          position: "absolute", left: 28, right: 28, bottom: `calc(50% + ${boxPx / 2}px + ${TEXT_GAP})`, margin: 0,
          color: WARM, fontFamily: SPACE_GROTESK, fontSize: "clamp(20px, 5.8vw, 25px)", lineHeight: 1.5,
          textAlign: "center", textShadow: "0 2px 18px rgba(8,30,18,0.6)", textWrap: "balance",
        }}
      >
        {t("breath_intro.invite", { defaultValue: "Take three breaths before you enter" })}
      </p>

      {/* The rings — the same drawing as Creation Prayer's breath, without its
          globe, at the screen's vertical centre (owner). */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", left: "50%", top: "50%", width: boxPx, height: boxPx,
          transform: "translate(-50%, -50%)", pointerEvents: "none",
        }}
      >
        <svg
          aria-hidden="true"
          width={boxPx} height={boxPx} viewBox="0 0 128 128"
          style={{
            position: "absolute", inset: 0, transform: "rotate(-90deg)", pointerEvents: "none",
            backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
            WebkitMaskImage: BREATH_RING_MASK, maskImage: BREATH_RING_MASK,
          }}
        >
          <circle cx={64} cy={64} r={RING_R} fill="none" stroke={RING_OUT} strokeWidth={RING_SW} strokeOpacity={0.9}
            style={{ filter: `drop-shadow(0 0 4px ${RING_GLOW})` }} />
          <circle ref={ringInRef} cx={64} cy={64} r={RING_R} fill="none" stroke={RING_IN} strokeWidth={RING_SW} strokeLinecap="round" strokeOpacity={0.85}
            style={{ strokeDasharray: RING_CIRC, strokeDashoffset: RING_CIRC, willChange: "stroke-dashoffset", filter: `drop-shadow(0 0 5px ${RING_GLOW})` }} />
          <circle ref={ringOutRef} cx={64} cy={64} r={RING_R} fill="none" stroke={RING_OUT} strokeWidth={RING_SW} strokeLinecap="round" strokeOpacity={0.9}
            style={{ strokeDasharray: RING_CIRC, strokeDashoffset: RING_CIRC, willChange: "stroke-dashoffset", filter: `drop-shadow(0 0 4px ${RING_GLOW})` }} />
          <circle cx={64} cy={64} r={SESSION_R} fill="none" stroke={SESSION_TRACK} strokeWidth={RING_SW} />
          <circle ref={sessionRingRef} cx={64} cy={64} r={SESSION_R} fill="none" stroke={SESSION_RING} strokeWidth={RING_SW} strokeLinecap="round" strokeOpacity={0.8}
            style={{ strokeDasharray: SESSION_CIRC, strokeDashoffset: SESSION_CIRC, willChange: "stroke-dashoffset", filter: `drop-shadow(0 0 5px ${RING_GLOW})` }} />
        </svg>
      </div>

      {/* Breathe In / Breathe Out — under the rings, centred, italic Georgia
          (owner), faded up and down each half-breath by the loop above. */}
      <p
        ref={phaseWordRef}
        aria-live="polite"
        style={{
          position: "absolute", left: 28, right: 28, top: `calc(50% + ${boxPx / 2}px + ${TEXT_GAP})`, margin: 0,
          color: WARM, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(20px, 5.8vw, 25px)", lineHeight: 1.5,
          textAlign: "center", textShadow: "0 2px 18px rgba(8,30,18,0.6)",
          opacity: 0, willChange: "opacity",
        }}
      >
        {inhaleWord
          ? t("cobreathe.phase_in", { defaultValue: "Breathe In" })
          : t("cobreathe.phase_out", { defaultValue: "Breathe Out" })}
      </p>

      <button
        type="button"
        onClick={skip}
        style={{
          position: "absolute", left: 0, right: 0, marginInline: "auto", width: "fit-content",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
          // The splash root blocks taps while the breaths run; this is the one
          // thing on it that must be tappable.
          pointerEvents: "auto",
          // Glowing text, no pill — the same treatment as the splash's Enter.
          padding: "14px 30px", background: "none", border: "none",
          color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 600, letterSpacing: "0.06em",
          textShadow: "0 0 18px rgba(240,237,230,0.55), 0 0 42px rgba(168,197,160,0.35)",
          cursor: "pointer",
        }}
      >
        {t("breath_intro.skip", { defaultValue: "Skip" })}
      </button>
    </motion.div>
  );
}
