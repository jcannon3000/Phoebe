import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { playOpeningSwell, primeAudio } from "@/lib/amenFeedback";

// ── CobreatheBreath ─────────────────────────────────────────────────────────
//
// The animated breath at the heart of Cobreathe — a circle that swells on the
// inhale, rests, and falls on the exhale. Reused by the /cobreathe page and
// the prayer-mode pause slide so the ceremony is identical everywhere.
//
// SYNCHRONIZED: the breath phase is a pure function of WALL-CLOCK TIME, not of
// when the user pressed Begin. `Date.now() % CYCLE_MS` anchors every cycle to
// the Unix epoch, so any two people breathing at the same instant — anywhere
// in the world, with roughly correct device clocks — are inhaling and exhaling
// together, in the same rhythm. That shared rhythm is the whole point: not
// just the same practice, but the same breath.
//
// Because the rhythm is global, a session JOINS the ongoing breath rather than
// starting its own. We let the user settle in until the next clean cycle
// boundary (the "find the rhythm" pre-roll — they breathe along immediately,
// it just isn't counted), then count `totalBreaths` whole breaths, each one
// beginning on an inhale.

const WARM = "#F0EDE6";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

// Breath pacing — a simple in / out breath, 12s each: a long, slow inhale
// and an equally long exhale, no holds. 24s per cycle; twelve cycles ≈ 4:48.
const INHALE_MS = 12000;
const EXHALE_MS = 12000;
// Each phase (in, out) is one PHASE_MS slice of the cycle — used to derive a
// globally-synced octave that rotates 0→1→2→3 across phases.
const PHASE_MS = INHALE_MS;
export const CYCLE_MS = INHALE_MS + EXHALE_MS;
export const DEFAULT_TOTAL_BREATHS = 12;

// Glow scale endpoints (relative to its base): collapsed at full exhale,
// expanded at full inhale.
const SMALL = 0.82;
const BIG = 1.42;

type Phase = "in" | "out";

// One line per breath, shown as the cycle begins. A small arc through Kearns'
// essay: etymology → interconnection → planetary + ruach → justice → communion.
const INTENTIONS: Array<{ key: string; text: string }> = [
  { key: "conspire", text: "To conspire — con spirare — is to breathe together." },
  { key: "inspire", text: "Inspire, respire, expire — all of it is breath." },
  { key: "shared_air", text: "The air in your lungs has passed through every living thing." },
  { key: "reciprocal", text: "Trees breathe out what you breathe in. You breathe out what they breathe in." },
  { key: "planet", text: "The planet breathes too — exhaling in winter, drawing it back in spring." },
  { key: "ruach", text: "Ruach — breath, wind, Spirit. One word. One breath." },
  { key: "cannot_breathe", text: "Breathe with those who cannot breathe freely." },
  { key: "no_one_alone", text: "No one breathes alone." },
  { key: "borrowed", text: "Every breath is borrowed from the whole." },
  { key: "communion", text: "Breath given, breath returned — a quiet communion." },
  { key: "commit", text: "To breathe together is to be bound to one another." },
  { key: "justice", text: "Let this breath become work for justice." },
];

// Smooth ease-in-out so the circle accelerates and settles rather than
// moving linearly — reads as a body breathing, not a metronome.
function easeInOut(p: number): number {
  return (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, p)))) / 2;
}

// Continuous scale for a position within the global cycle [0, CYCLE_MS).
// Simple breath: rise (in) → fall (out), no holds.
function scaleAt(pos: number): number {
  if (pos < INHALE_MS) return SMALL + (BIG - SMALL) * easeInOut(pos / INHALE_MS);
  return BIG - (BIG - SMALL) * easeInOut((pos - INHALE_MS) / EXHALE_MS);
}

function phaseAt(pos: number): Phase {
  return pos < INHALE_MS ? "in" : "out";
}

// ── The breath ─────────────────────────────────────────────────────────────
// A soft radial-gradient glow (no hard circle edge) that swells AND brightens
// on the inhale and recedes on the exhale — bigger + stronger, then smaller.
// The rAF loop drives transform scale + opacity each frame (GPU-composited, so
// it stays glass-smooth). A larger, fainter gradient behind it gives depth and
// the subtle colour difference.
const CIRCLE_BASE = 300;
// Centre brighter green fading out to nothing — a glow, not a disc. Many
// gradual stops + a fully-transparent outer edge so there is no hard ring and
// no banding: the alpha steps down a little at a time and reaches 0 well inside
// the element box (so the blur below never clips a visible edge).
const GLOW = "radial-gradient(circle, rgba(130,196,150,0.52) 0%, rgba(118,186,142,0.38) 20%, rgba(100,168,124,0.25) 38%, rgba(78,142,98,0.15) 54%, rgba(58,120,76,0.08) 70%, rgba(46,107,64,0.03) 84%, rgba(46,107,64,0) 94%)";
// Larger, cooler, fainter halo behind it for depth + a hint of colour shift.
const HALO = "radial-gradient(circle, rgba(110,180,150,0.13) 0%, rgba(92,158,138,0.08) 30%, rgba(74,140,128,0.05) 52%, rgba(58,120,96,0.02) 72%, rgba(46,107,64,0) 88%)";
// The field starts darker (settling in, before sync) and warms a touch greener
// once the session goes live — a quiet swell that marks joining the global
// breath. CSS-transitioned between the two.
const FIELD_DIM = "#040D08";          // before sync — near-black green
const FIELD_LIVE = "#0B2014";         // live — a touch lighter/greener

// Fisher–Yates shuffle — used to put the photo library in a fresh order each
// session so the same faces and places don't arrive in the same sequence twice.
function shuffle<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function CobreatheBreath({
  onReachTarget,
  onEnd,
  totalBreaths = DEFAULT_TOTAL_BREATHS,
  othersToday,
  todayCount,
  backgroundImage,
  photos,
}: {
  // Fired ONCE, when the target number of breaths has been kept. The breath
  // does NOT stop here — people can keep breathing as long as they like.
  onReachTarget?: (secondsKept: number) => void;
  // Fired when the user taps the end button. reachedTarget says whether they
  // got through the full set (Finish) or backed out early (End early).
  onEnd: (secondsKept: number, reachedTarget: boolean) => void;
  totalBreaths?: number;
  // How many others have breathed with them today — shown live under the
  // counter so the practice feels held in company, not alone.
  othersToday?: number;
  // Everyone who has breathed today (incl. the caller once recorded) — shown
  // as the participation detail under the title.
  todayCount?: number;
  // Optional photo behind the breath (e.g. the /cobreathe page). A dark green
  // wash sits over it so the glow, globe, and text stay legible.
  backgroundImage?: string;
  // A library of photos of life on earth. Instead of a static background, ONE
  // photo at a time fades up on the inhale and down on the exhale, then the next
  // one takes its place at the bottom of the breath — the world breathing. The
  // set is shuffled once per session and rotated through, one photo per breath.
  // No captions: the images speak for themselves.
  photos?: string[];
}) {
  const { t } = useTranslation();
  // The breath is a single solid green circle that swells on the inhale and
  // contracts on the exhale, over a solid deep-green field. A faint ring sits
  // behind it for depth.
  const circleRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  // Two stacked photo layers that crossfade, plus a group wrapper whose opacity
  // breathes with the cycle. The rAF loop ping-pongs between A and B: each breath
  // the incoming layer fades in over the outgoing (never a hard switch), and each
  // photo slowly zooms in (Ken Burns push) the whole time it's shown. Srcs are
  // assigned via refs from the rAF clock (not React render) so the swap can't
  // race the 150ms tick. `lastIdx` tracks the current breath; `preloaded` marks
  // when we've decoded the next photo onto the hidden layer.
  const photoGroupRef = useRef<HTMLDivElement>(null);
  const photoARef = useRef<HTMLImageElement>(null);
  const photoBRef = useRef<HTMLImageElement>(null);
  const photoLastIdxRef = useRef<number>(-1);
  const photoPreloadedRef = useRef<number>(-1);
  // The photo library, shuffled once per session (stable across re-renders).
  // We rotate through it one photo per breath; the rAF loop fades the current
  // photo up on the inhale and down on the exhale.
  const photoOrderRef = useRef<string[]>([]);
  if (photoOrderRef.current.length === 0 && photos && photos.length > 0) {
    photoOrderRef.current = shuffle(photos);
  }
  const photoOrder = photoOrderRef.current;

  // Prime the audio subsystem on mount so the per-breath swell tones sound. (No
  // fade-in: the scene is held still at rest until synced, so nothing flashes.)
  useEffect(() => {
    primeAudio();
  }, []);

  // Anchor points (fixed at mount): when the user arrived, and the next clean
  // cycle boundary where the count begins. There is NO end anchor — the rhythm
  // runs on until the user chooses to finish.
  const startRef = useRef(Date.now());
  const countStartRef = useRef(Math.ceil(startRef.current / CYCLE_MS) * CYCLE_MS);
  const reachedRef = useRef(false);
  // Presence gate: a breath only counts if the page/app stayed open and
  // visible the whole time. If the tab is backgrounded / the app is
  // sent to the background long enough that you couldn't have been
  // breathing along, the session is invalidated — the clock keeps
  // turning, but it won't record. `endedRef` guards a single onEnd.
  const invalidRef = useRef(false);
  const endedRef = useRef(false);
  // Timestamp of the previous count tick — a large gap means the timer was
  // suspended (app/tab backgrounded), even if visibilitychange hasn't fired
  // its handler yet on resume. Used to invalidate before the reach check.
  const lastTickRef = useRef(0);
  // Phase at the previous frame — used to fire a soft haptic + tone at the
  // start of each of the four box-breathing phases. null until the first frame
  // so we don't buzz mid-phase on mount.
  const lastPhaseRef = useRef<Phase | null>(null);

  // A rAF loop writes transforms straight to the DOM from the global clock —
  // no React re-render per frame, perfectly synced for everyone, and only
  // transform/opacity (GPU-composited) so the swell stays glass-smooth.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      const pos = now % CYCLE_MS;
      const isCounting = now - countStartRef.current >= 0;
      // Phase transitions (inhale ↔ exhale): a soft haptic on each, but the
      // swell TONE sounds only at the start of the inhale (once synced) — one
      // note per breath. The octave ROTATES through three slide octaves
      // (0,1,2), derived from the global clock (floor(now / PHASE_MS) % 3), so
      // everyone breathing at this instant hears the same tone, in unison.
      const phase = phaseAt(pos);
      if (lastPhaseRef.current === null) {
        lastPhaseRef.current = phase;
      } else if (phase !== lastPhaseRef.current) {
        lastPhaseRef.current = phase;
        if (isCounting) {
          try {
            window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } }));
          } catch { /* no native shell on web — silent */ }
          // Sound ONLY on the inhale (the start of each breath), not the
          // exhale — one tone per breath. And only the three lower slide
          // octaves (0,1,2), cycled from the global clock so everyone
          // breathing at this instant hears the same tone.
          if (phase === "in") {
            const octave = Math.floor(now / PHASE_MS) % 3;
            try { playOpeningSwell(octave); } catch { /* audio locked — non-fatal */ }
          }
        }
      }
      const s = scaleAt(pos);
      // 0 at rest (full exhale / bottom hold) → 1 at full inhale / top hold.
      const p = (s - SMALL) / (BIG - SMALL);
      // Don't breathe until synced — while "Syncing", hold the scene STILL at
      // rest (p=0) so nothing pulses in/out. The count begins on a clean cycle
      // boundary (p=0), so the breath starts from this exact rest state with no
      // jump.
      const pAnim = isCounting ? p : 0;
      // Everything below scales RADIALLY from the centre (translate -50%,-50%
      // only) — purely in/out, no vertical drift, all centred on the globe.
      if (circleRef.current) {
        circleRef.current.style.transform = `translate(-50%, -50%) scale(${(0.66 + pAnim * 0.86).toFixed(4)})`;
        circleRef.current.style.opacity = String(0.3 + pAnim * 0.45);
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(-50%, -50%) scale(${(0.82 + pAnim * 0.98).toFixed(4)})`;
        ringRef.current.style.opacity = String(0.18 + pAnim * 0.34);
      }
      // The globe stays a STEADY size — it no longer swells with the breath
      // (only the glow behind it breathes). Left untouched here so it holds at
      // its base scale/opacity.
      // The photo of life on earth fades UP on the inhale and DOWN on the
      // exhale — brightest at the top of the breath, receding into the dark
      // field at the bottom (where it's swapped for the next one, so the change
      // is never seen). A gentle ease via pAnim, capped so the glow/globe/text
      // stay legible over it.
      // ── Breathing photo: crossfade between photos + slow zoom-in ─────────
      // The whole group's opacity breathes (up on inhale, down on exhale). The
      // two layers ping-pong: the incoming photo fades IN over the outgoing at
      // the breath boundary (a crossfade, never a hard cut), and each photo
      // slowly pushes in (scale 1 → 1+ZOOM) the entire time it's shown.
      const order = photoOrderRef.current;
      if (order.length > 0) {
        const ZOOM = 0.10;          // total scale push per photo while shown
        const CROSSFADE_MS = 3500;  // how long the incoming photo takes to arrive
        const idx = isCounting
          ? Math.max(0, Math.floor((now - countStartRef.current) / CYCLE_MS))
          : 0;
        const a = photoARef.current;
        const b = photoBRef.current;
        // New breath: the incoming layer was preloaded last cycle; make sure it
        // holds the right photo (covers the very first breath, where it wasn't).
        if (idx !== photoLastIdxRef.current) {
          photoLastIdxRef.current = idx;
          const incoming = (idx % 2 === 0) ? a : b;
          const url = order[idx % order.length];
          if (incoming && incoming.getAttribute("src") !== url) incoming.src = url;
          photoPreloadedRef.current = -1;
        }
        const activeIsA = idx % 2 === 0;
        const activeEl = activeIsA ? a : b;
        const prevEl = activeIsA ? b : a;
        const zoomP = pos / CYCLE_MS;                                  // 0→1 across the breath
        const cross = idx === 0 ? 1 : Math.min(1, pos / CROSSFADE_MS); // incoming fade-in weight
        if (activeEl) {
          activeEl.style.opacity = cross.toFixed(4);
          activeEl.style.transform = `scale(${(1 + zoomP * ZOOM).toFixed(4)})`;
          activeEl.style.zIndex = "2";
        }
        if (prevEl) {
          // Sits underneath at full opacity, continuing its zoom from where the
          // active layer left off so the push reads as one continuous motion.
          prevEl.style.opacity = "1";
          prevEl.style.transform = `scale(${(1 + ZOOM + zoomP * ZOOM).toFixed(4)})`;
          prevEl.style.zIndex = "1";
        }
        // The group breathes: visible from the first moment (0.5 floor),
        // brightening to full at the top of the inhale.
        if (photoGroupRef.current) photoGroupRef.current.style.opacity = (0.5 + pAnim * 0.5).toFixed(4);
        // Once the crossfade is done (incoming fully covers the old), preload the
        // NEXT photo onto the now-hidden layer so it's decoded before its turn.
        if (cross >= 1 && photoPreloadedRef.current !== idx && prevEl) {
          const nextUrl = order[(idx + 1) % order.length];
          if (prevEl.getAttribute("src") !== nextUrl) prevEl.src = nextUrl;
          photoPreloadedRef.current = idx;
        }
      }
      // The phase word breathes a hair with the circle (only once synced).
      if (labelRef.current) labelRef.current.style.transform = `scale(${0.97 + pAnim * 0.06})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // A slow tick drives the phase word + counter and fires onReachTarget once
  // the target set is complete. (The circle itself is rAF-smooth above.)
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      // Presence guard, evaluated BEFORE the reach check so a backgrounded
      // session can never record. Two signals, covering both platforms:
      //   • document.hidden — a hidden web tab still fires throttled ticks.
      //   • a >1.5s gap since the last tick — the timer was suspended (iOS app
      //     backgrounded), which can race ahead of the visibilitychange handler
      //     on resume.
      const gap = lastTickRef.current ? now - lastTickRef.current : 0;
      lastTickRef.current = now;
      if (!reachedRef.current &&
          ((typeof document !== "undefined" && document.hidden) || gap > 1500)) {
        invalidRef.current = true;
      }
      const since = now - countStartRef.current;
      const completed = since >= 0 ? Math.floor(since / CYCLE_MS) : 0;
      // Only credit the breath if the session stayed open + visible the whole
      // time — a backgrounded tab/app that "completed" the count doesn't count.
      if (!reachedRef.current && !invalidRef.current && completed >= totalBreaths) {
        reachedRef.current = true;
        // The payoff when all twelve breaths are kept: a big celebration swell
        // haptic (crescendo → hold → fade) paired with Phoebe's swell tone — a
        // richer moment than the soft per-breath taps.
        try {
          window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "celebration" } }));
        } catch { /* no native shell on web — silent */ }
        try { playOpeningSwell(); } catch { /* audio locked — non-fatal */ }
        onReachTarget?.(Math.round((now - startRef.current) / 1000));
      }
      setTick((n) => n + 1);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Presence: if the page is hidden (tab switched, app backgrounded) for more
  // than a brief blip before the breath completes, the breath can't have been
  // kept — invalidate it, and end the session without recording when the user
  // returns. (A quick <1.2s flicker is tolerated.) Once the target is reached
  // the breath is already credited, so later backgrounding is fine.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        hiddenAt = Date.now();
      } else {
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        if (away > 1200 && !reachedRef.current) invalidRef.current = true;
        if (invalidRef.current && !reachedRef.current && !endedRef.current) {
          endedRef.current = true;
          onEnd(Math.round((Date.now() - startRef.current) / 1000), false);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    // iOS Capacitor: the native shell also signals app resume/suspend.
    window.addEventListener("phoebe:appactive", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("phoebe:appactive", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = Date.now();
  const pos = now % CYCLE_MS;
  const phase = phaseAt(pos);
  const phaseLabel =
    phase === "in"
      ? t("cobreathe.phase_in", { defaultValue: "Breathe in" })
      : t("cobreathe.phase_out", { defaultValue: "Breathe out" });

  // Where are we in the count? Negative during the pre-roll; uncapped after,
  // so the count keeps climbing past the target while they keep breathing.
  const sinceCount = now - countStartRef.current;
  const counting = sinceCount >= 0;
  // While syncing (before the count begins), the centre word reads "Syncing"
  // with an animated ellipsis instead of "Breathe in / out".
  const syncDots = ".".repeat(Math.floor(now / 450) % 4);
  const centerLabel = counting ? phaseLabel : `${t("cobreathe.syncing", { defaultValue: "Syncing" })}${syncDots}`;
  const completed = counting ? Math.floor(sinceCount / CYCLE_MS) : 0;
  const breathNum = completed + 1;
  const reachedNow = counting && completed >= totalBreaths;
  const hasPhotos = photoOrder.length > 0;
  const intention = counting ? INTENTIONS[(breathNum - 1) % INTENTIONS.length] : null;

  // Soft sage tones that sit calmly on the deep-green field.
  const TEXT_DIM = "rgba(182,210,188,0.72)";
  const TEXT_FAINT = "rgba(182,210,188,0.48)";

  // Portal to <body> so the full-screen overlay escapes any transformed
  // ancestor (page transitions, etc.) that would otherwise trap its fixed
  // positioning and let the app header show through at the top — the "edge of
  // the darkness." At body level it truly covers the whole screen.
  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 80, overflow: "hidden",
        // With a photo, a deep-green wash sits over it (a touch lighter once the
        // session goes live); otherwise the solid breath field as before.
        ...(backgroundImage
          ? {
              backgroundColor: FIELD_DIM,
              backgroundImage: `linear-gradient(${counting ? "rgba(8,32,20,0.62), rgba(4,13,8,0.72)" : "rgba(4,13,8,0.74), rgba(4,13,8,0.82)"}), url(${backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              transition: "background-image 1.6s ease",
            }
          : {
              background: counting ? FIELD_LIVE : FIELD_DIM,
              transition: "background-color 1.6s ease",
            }),
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        paddingTop: "calc(env(safe-area-inset-top) + 28px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
      }}
    >
      {/* The breath — a soft radial-gradient glow (no hard edge) that swells
          AND brightens on the inhale and recedes on the exhale. Driven by the
          global clock, so everyone breathing at this moment sees the same glow
          at the same size. A larger, fainter halo behind it gives depth and a
          subtle colour shift. Transform + opacity only — perfectly smooth. */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          ref={ringRef}
          style={{
            position: "absolute", top: "50%", left: "50%",
            width: CIRCLE_BASE, height: CIRCLE_BASE, borderRadius: "50%",
            background: HALO,
            transform: "translate(-50%, -50%) scale(1)",
            filter: "blur(20px)",
            willChange: "transform, opacity",
          }}
        />
        <div
          ref={circleRef}
          style={{
            position: "absolute", top: "50%", left: "50%",
            width: CIRCLE_BASE, height: CIRCLE_BASE, borderRadius: "50%",
            background: GLOW,
            transform: "translate(-50%, -50%) scale(1)",
            filter: "blur(14px)",
            willChange: "transform, opacity",
          }}
        />
      </div>

      {/* The breathing photos — images of life on earth, full-bleed behind the
          breath. Two stacked layers crossfade so the change from one photo to
          the next is never a hard cut; each photo slowly zooms in (Ken Burns
          push) the whole time it's shown. The group's opacity breathes: up on
          the inhale, down on the exhale. The rAF loop drives all of it (srcs,
          opacity, zoom). A deep-green wash over the top keeps the glow, globe
          and text legible. No captions — the images speak for themselves. */}
      {hasPhotos && (
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
          <div ref={photoGroupRef} style={{ position: "absolute", inset: 0, willChange: "opacity" }}>
            <img
              ref={photoARef}
              alt=""
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", opacity: 0, transformOrigin: "center",
                willChange: "transform, opacity",
              }}
            />
            <img
              ref={photoBRef}
              alt=""
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", opacity: 0, transformOrigin: "center",
                willChange: "transform, opacity",
              }}
            />
          </div>
          {/* Legibility wash — a deep green-to-black veil over the photos. Kept
              darker toward the bottom (behind the counter text) but lighter up
              top so the brighter image actually reads. */}
          <div
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(6,24,16,0.18) 0%, rgba(5,18,12,0.28) 45%, rgba(4,13,8,0.55) 100%)",
            }}
          />
        </div>
      )}

      {/* Cancel — top-right, exits the breath (no count unless already kept). */}
      <button
        type="button"
        aria-label={t("common.cancel", { defaultValue: "Cancel" })}
        onClick={() => onEnd(Math.round((Date.now() - startRef.current) / 1000), reachedRef.current)}
        style={{
          position: "absolute", top: "calc(env(safe-area-inset-top) + 16px)", right: 16,
          width: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(182,210,188,0.22)",
          color: TEXT_DIM, fontSize: 16, lineHeight: 1, cursor: "pointer", zIndex: 2,
        }}
      >
        ✕
      </button>

      {/* Title + participation + intention — top */}
      <div className="flex flex-col items-center" style={{ position: "relative", maxWidth: 460 }}>
        <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(182,210,188,0.55)", fontFamily: SPACE_GROTESK }}>
          🌬️ {t("cobreathe.title", { defaultValue: "Cobreathe" })}
          {/* Live indicator — appears the moment the session joins the global
              breath (counting), a small pulsing red dot + LIVE, like a live
              broadcast badge. */}
          {counting && (
            <span className="inline-flex items-center gap-1">
              <span className="rounded-full animate-pulse" style={{ width: 7, height: 7, background: "#E5484D", boxShadow: "0 0 6px rgba(229,72,77,0.8)" }} />
              <span style={{ color: "#E58A8D", letterSpacing: "0.16em" }}>{t("cobreathe.synced", { defaultValue: "Synced" })}</span>
            </span>
          )}
        </p>
        {todayCount != null && todayCount > 0 && (
          <p className="text-[12px] mt-1" style={{ color: TEXT_FAINT, fontFamily: SPACE_GROTESK }}>
            {t("cobreathe.breathed_today_count", { count: todayCount, defaultValue: `${todayCount} ${todayCount === 1 ? "person has" : "people have"} breathed today` })}
          </p>
        )}
      </div>

      {/* Phase word + counter — BELOW the gradient now (it used to sit centred
          over the glow), clearing the globe that now holds the middle. */}
      <div
        className="flex flex-col items-center"
        style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, 0)",
          marginTop: CIRCLE_BASE * 0.78, zIndex: 2,
        }}
      >
        <div ref={labelRef} style={{ willChange: "transform" }}>
          <span
            style={{
              color: WARM, fontFamily: SPACE_GROTESK, fontSize: 26, fontWeight: 600,
              letterSpacing: "0.14em", textShadow: "0 2px 18px rgba(8,30,18,0.6)",
            }}
          >
            {centerLabel}
          </span>
        </div>
        <p className="mt-6 text-[13px] text-center" style={{ color: reachedNow ? "rgba(126,210,140,0.95)" : TEXT_DIM, fontFamily: SPACE_GROTESK, maxWidth: 300 }}>
          {!counting
            ? t("cobreathe.finding_rhythm", { defaultValue: "Syncing with the global breath…" })
            : reachedNow
              ? t("cobreathe.breath_counter_past", { current: breathNum, defaultValue: `🌿 Breath ${breathNum} — keep going as long as you like` })
              : t("cobreathe.breath_counter", { current: breathNum, total: totalBreaths, defaultValue: `Breath ${breathNum} of ${totalBreaths}` })}
        </p>
        {othersToday != null && othersToday > 0 && (
          <p className="mt-1.5 text-[12px] text-center" style={{ color: TEXT_FAINT, fontFamily: SERIF, fontStyle: "italic", maxWidth: 300 }}>
            {t("cobreathe.breathing_with_you", { count: othersToday, defaultValue: `${othersToday} ${othersToday === 1 ? "person is" : "people are"} breathing with you today` })}
          </p>
        )}
      </div>

      {/* End / Finish — bottom */}
      <button
        type="button"
        onClick={() => onEnd(Math.round((Date.now() - startRef.current) / 1000), reachedRef.current)}
        className="text-[13px] py-2 px-6"
        style={{
          color: reachedNow ? "#EAF6F4" : TEXT_FAINT,
          fontWeight: reachedNow ? 600 : 400,
          fontFamily: SPACE_GROTESK, background: "none", border: "none", cursor: "pointer", position: "relative",
        }}
      >
        {reachedNow
          ? t("cobreathe.finish", { defaultValue: "Finish" })
          : t("common.cancel", { defaultValue: "Cancel" })}
      </button>
    </div>,
    document.body,
  );
}
