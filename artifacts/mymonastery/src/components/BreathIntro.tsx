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
 * SAME RINGS, OWN CLOCK. The colours, radii, stroke, frost mask and globe box
 * all come from lib/breathRings — the module Creation Prayer's breath draws
 * from — so the two cannot drift apart. What is deliberately different is time:
 * that breath rides the server clock so the world breathes together; this one
 * starts on an inhale the moment it appears, because nobody is waiting on it.
 *
 * It only breathes, counts and says when it is done. Whether it appears at all,
 * and what happens afterwards, belong to OpeningSplash (components/layout.tsx).
 * No sound and no haptics: this is the first thing someone meets on opening the
 * app, and it should be quiet.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { CenteredGlobe } from "@/components/CenteredGlobe";
import {
  INHALE_MS, EXHALE_MS, CYCLE_MS,
  RING_IN, RING_OUT, RING_GLOW, RING_R, RING_CIRC, RING_SW,
  SESSION_RING, SESSION_R, SESSION_CIRC, SESSION_TRACK, BREATH_RING_MASK,
  breathGlobeBoxPx,
} from "@/lib/breathRings";

const WARM = "#F0EDE6";
const TEXT_DIM = "rgba(182,210,188,0.72)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type Readout = { inhale: boolean; breath: number };

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
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const totalMs = breaths * CYCLE_MS;

  const readoutAt = (now: number): Readout => {
    const since = Math.max(0, now - startedAt);
    return { inhale: since % CYCLE_MS < INHALE_MS, breath: Math.min(breaths, Math.floor(since / CYCLE_MS) + 1) };
  };
  const [readout, setReadout] = useState<Readout>(() => readoutAt(Date.now()));

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
  // across all three breaths. Only the two words re-render, and only when they
  // actually change — twice a breath.
  useEffect(() => {
    let raf = 0;
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
        if (!doneRef.current) { doneRef.current = true; onDoneRef.current("complete"); }
        return;
      }
      const pos = since % CYCLE_MS;
      const inhale = pos < INHALE_MS;
      setOffsets(
        inhale ? pos / INHALE_MS : 1,
        inhale ? 0 : (pos - INHALE_MS) / EXHALE_MS,
        since / totalMs,
      );
      const next = readoutAt(now);
      setReadout((cur) => (cur.inhale === next.inhale && cur.breath === next.breath ? cur : next));
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
      <p
        style={{
          position: "absolute", left: 28, right: 28, top: "22%", margin: 0,
          color: WARM, fontFamily: SPACE_GROTESK, fontSize: "clamp(20px, 5.8vw, 25px)", lineHeight: 1.5,
          textAlign: "center", textShadow: "0 2px 18px rgba(8,30,18,0.6)", textWrap: "balance",
        }}
      >
        {t("breath_intro.invite", { defaultValue: "Take three breaths before you enter" })}
      </p>

      {/* The rings and the globe — the same drawing as Creation Prayer's breath,
          centred on the golden-ratio line (61.8%) as that screen is. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", left: "50%", top: "61.8%", width: boxPx, height: boxPx,
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
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            filter: "drop-shadow(0 0 13px rgba(90,150,110,0.55)) drop-shadow(0 0 14px rgba(8,30,18,0.6))",
          }}
        >
          <CenteredGlobe px={boxPx} glyph="🌍" />
        </div>
      </div>

      {/* Breathe In / Breathe Out on the left, "n of 3" on the right — the same
          bottom row as Creation Prayer, lifted to leave room for Skip. */}
      <div
        style={{
          position: "absolute", left: 28, right: 28,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)",
          display: "flex", alignItems: "flex-end", gap: 14,
        }}
      >
        <span
          aria-live="polite"
          style={{
            flex: 1, minWidth: 0, color: WARM, fontFamily: SPACE_GROTESK, fontSize: 15.2, fontWeight: 600,
            letterSpacing: "0.04em", textShadow: "0 2px 18px rgba(8,30,18,0.6)", whiteSpace: "nowrap",
          }}
        >
          {readout.inhale
            ? t("cobreathe.phase_in", { defaultValue: "Breathe In" })
            : t("cobreathe.phase_out", { defaultValue: "Breathe Out" })}
        </span>
        <span
          style={{
            flex: 1, textAlign: "right", color: TEXT_DIM, fontFamily: SPACE_GROTESK, fontSize: 15.2,
            fontWeight: 600, letterSpacing: "0.04em",
          }}
        >
          {t("cobreathe.breath_counter", { current: readout.breath, total: breaths, defaultValue: `${readout.breath} of ${breaths}` })}
        </span>
      </div>

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
