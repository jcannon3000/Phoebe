import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// ── Category page transition ────────────────────────────────────────────────
//
// A gentle, scoped transition for tapping a menu category: the current page
// fades away under a deep-green curtain (cover), we navigate underneath, then
// the curtain fades back out — slower — to reveal the new page rising in.
// Paired with a soft rising chime. Only the menu-category rows use this; all
// other navigation is unaffected.

const BG = "#091A10";
const FADE_EVENT = "phoebe:page-fade";
const COVER_MS = 260;   // current page fades out
const REVEAL_MS = 640;  // new page fades up — deliberately slower

// Soft two-tone rising cue. Self-contained WebAudio; the category tap is a
// user gesture, so creating/resuming the context here is allowed on iOS.
let audioCtx: AudioContext | null = null;
export function playNavSound() {
  try {
    const AC = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx ?? new AC();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(523.25, t);                       // C5
    o.frequency.exponentialRampToValueAtTime(783.99, t + 0.16);  // → G5, a soft rise
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.42);
  } catch {
    /* audio is optional — never block navigation on it */
  }
}

// Play the cue, fade the curtain in, run `navigate` under cover, then reveal.
export function triggerCategoryTransition(navigate: () => void) {
  playNavSound();
  window.dispatchEvent(new CustomEvent(FADE_EVENT, { detail: "cover" }));
  window.setTimeout(() => {
    navigate();
    window.dispatchEvent(new CustomEvent(FADE_EVENT, { detail: "reveal" }));
  }, COVER_MS);
}

export function PageFadeOverlay() {
  const [phase, setPhase] = useState<"hidden" | "cover" | "reveal">("hidden");

  useEffect(() => {
    const onFade = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "cover") {
        setPhase("cover");
      } else if (detail === "reveal") {
        setPhase("reveal");
        window.setTimeout(() => setPhase("hidden"), REVEAL_MS + 60);
      }
    };
    window.addEventListener(FADE_EVENT, onFade);
    return () => window.removeEventListener(FADE_EVENT, onFade);
  }, []);

  if (phase === "hidden") return null;
  const covering = phase === "cover";
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: covering ? 1 : 0 }}
      transition={{ duration: (covering ? COVER_MS : REVEAL_MS) / 1000, ease: covering ? "easeIn" : "easeOut" }}
      style={{ position: "fixed", inset: 0, background: BG, zIndex: 9999, pointerEvents: covering ? "auto" : "none" }}
    />
  );
}
