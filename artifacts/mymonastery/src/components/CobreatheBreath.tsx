import { useState, useEffect, useRef } from "react";
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

// Breath pacing — 4s in, 2s hold, 6s out. The long exhale is the calming
// half; twelve cycles ≈ 2.4 minutes, short enough to keep daily.
const INHALE_MS = 4000;
const HOLD_MS = 2000;
const EXHALE_MS = 6000;
export const CYCLE_MS = INHALE_MS + HOLD_MS + EXHALE_MS;
export const DEFAULT_TOTAL_BREATHS = 12;

// Circle scale endpoints (relative to its 150px base): collapsed at rest /
// full exhale, expanded at full inhale / hold.
const SMALL = 0.82;
const BIG = 1.42;

type Phase = "in" | "hold" | "out";

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
function scaleAt(pos: number): number {
  if (pos < INHALE_MS) return SMALL + (BIG - SMALL) * easeInOut(pos / INHALE_MS);
  if (pos < INHALE_MS + HOLD_MS) return BIG;
  return BIG - (BIG - SMALL) * easeInOut((pos - INHALE_MS - HOLD_MS) / EXHALE_MS);
}

function phaseAt(pos: number): Phase {
  if (pos < INHALE_MS) return "in";
  if (pos < INHALE_MS + HOLD_MS) return "hold";
  return "out";
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
// The world turns between these three globes — one per breath cycle.
const GLOBES = ["🌍", "🌎", "🌏"] as const;

// A soft "radial gradient" of small emojis spiralling out from the globe
// (Apple-style emoji burst). Laid out on a phyllotaxis spiral — the golden
// angle, the same spacing leaves take around a stem — so it reads as a living
// spray, not a rigid ring. Smaller + fainter toward the rim. The whole spiral
// scales with the breath (positions computed once; animated in the rAF loop).
//
// The cast is all of breathing life: plants, ordinary people of many skin tones
// and ages, and small animals — "the air in your lungs has passed through every
// living thing." The emojis are RE-PICKED on every mount (random within each
// category, random starting category, interleaved for balance), so no two
// sessions wear the same faces.
const PLANT_POOL = ["🌿", "🌱", "🍃", "🌾", "☘️", "🌻", "🍀"];
const ANIMAL_POOL = ["🦋", "🐝", "🐦", "🐞", "🐢", "🐌", "🦔", "🐿️", "🐇", "🐠"];
const PEOPLE_POOL = ["🧑🏻", "🧑🏽", "🧑🏿", "👩🏽", "👨🏿", "👩🏻", "👨🏼", "🧒🏾", "👵🏼", "🧓🏽", "👴🏿", "👩🏾", "👨🏽", "🧑🏼"];
const CATEGORY_POOLS = [PLANT_POOL, PEOPLE_POOL, ANIMAL_POOL];
const GOLDEN_ANGLE = 2.399963229728653; // radians (~137.5°)
const PARTICLE_COUNT = 24;
const PARTICLE_LAYOUT = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const f = i / PARTICLE_COUNT;
  const angle = i * GOLDEN_ANGLE;
  const radius = 64 + 112 * Math.sqrt(f); // px from centre — even spiral spread
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    size: 20 - f * 9,        // ~20px near the globe → ~11px at the rim
    opacity: 0.82 - f * 0.58, // fade outward, like a radial gradient
  };
});
// Build a fresh, balanced-but-varied cast: walk the categories in order from a
// random start (plant → people → animal → …) and pick a random emoji within
// each, so every breath opens with a different spiral.
function pickParticleEmojis(): string[] {
  const start = Math.floor(Math.random() * CATEGORY_POOLS.length);
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const pool = CATEGORY_POOLS[(start + i) % CATEGORY_POOLS.length];
    return pool[Math.floor(Math.random() * pool.length)];
  });
}

export function CobreatheBreath({
  onReachTarget,
  onEnd,
  totalBreaths = DEFAULT_TOTAL_BREATHS,
  othersToday,
  todayCount,
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
}) {
  const { t } = useTranslation();
  // The breath is a single solid green circle that swells on the inhale and
  // contracts on the exhale, over a solid deep-green field. A faint ring sits
  // behind it for depth.
  const circleRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);
  const plantsRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  // A fresh spiral cast for this session — different emojis every time the
  // breath opens. Computed once per mount.
  // The spiral cast — re-picked at the bottom of every breath (see the rAF
  // loop), so each breath rises with a fresh set of emojis.
  const [particleEmojis, setParticleEmojis] = useState<string[]>(pickParticleEmojis);

  // Smooth entrance: the whole field fades in over the first beat instead of
  // snapping on (which flashed the glow/spiral at full strength before the rAF
  // loop settled them — the "you see the edges at first" fumble). Also prime
  // the audio subsystem now so the per-breath swell tones actually sound.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    primeAudio();
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
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
  // Cycle index at the previous frame — used to fire one gentle haptic at the
  // top of every breath (the start of each inhale). null until the first frame
  // so we don't buzz mid-cycle on mount.
  const lastCycleRef = useRef<number | null>(null);

  // A rAF loop writes transforms straight to the DOM from the global clock —
  // no React re-render per frame, perfectly synced for everyone, and only
  // transform/opacity (GPU-composited) so the swell stays glass-smooth.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      const pos = now % CYCLE_MS;
      // Top of each breath — a single soft tap as a new inhale begins, so the
      // body can feel the global rhythm without watching. Fires on the
      // wall-clock cycle boundary (same for everyone breathing now).
      const cyc = Math.floor(now / CYCLE_MS);
      if (lastCycleRef.current === null) {
        lastCycleRef.current = cyc;
      } else if (cyc !== lastCycleRef.current) {
        lastCycleRef.current = cyc;
        try {
          window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } }));
        } catch { /* no native shell on web — silent */ }
        // A swell tone at the top of each breath, rotating up through the
        // octaves (0–4) like the prayer slideshow. Keyed to the global cycle
        // index, so everyone breathing now hears the same octave together.
        try { playOpeningSwell(((cyc % 5) + 5) % 5); } catch { /* audio locked — non-fatal */ }
        // Swap in a fresh emoji cast for the breath that's beginning. The
        // spiral is sunk + faded here (bottom of the exhale), so the new faces
        // appear unseen and rise up on the inhale.
        setParticleEmojis(pickParticleEmojis());
      }
      const s = scaleAt(pos);
      // 0 at rest (full exhale) → 1 at full inhale.
      const p = (s - SMALL) / (BIG - SMALL);
      // The glow grows AND strengthens on the inhale: scale + opacity both
      // rise with the breath. GPU-composited (transform + opacity), so smooth.
      // Pronounced swell: a wide scale range driven straight off breath
      // progress, so the glow visibly shrinks on the exhale (~0.66) and blooms
      // large on the inhale (~1.52) — a far more dramatic pulse than before.
      if (circleRef.current) {
        circleRef.current.style.transform = `translate(-50%, -50%) scale(${(0.66 + p * 0.86).toFixed(4)})`;
        circleRef.current.style.opacity = String(0.3 + p * 0.45);
      }
      // The halo breathes wider and fainter, a beat behind — depth + the subtle
      // colour shift, swinging across an even bigger range than the core.
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(-50%, -50%) scale(${(0.82 + p * 0.98).toFixed(4)})`;
        ringRef.current.style.opacity = String(0.18 + p * 0.34);
      }
      // The world at the centre breathes with the glow — a touch more now.
      if (globeRef.current) {
        globeRef.current.style.transform = `translate(-50%, -50%) scale(${(0.9 + p * 0.24).toFixed(4)})`;
        globeRef.current.style.opacity = String(0.6 + p * 0.4);
      }
      // The plant spiral blooms OUTWARD on the inhale and draws back in on the
      // exhale — the whole spiral scales radially with the breath, a wider swing
      // than the globe so the spray opens and closes around it.
      if (plantsRef.current) {
        // Rise + bloom on the inhale, sink + fade to nothing on the exhale.
        // At the bottom (p≈0) the whole spiral is sunk ~46px and nearly
        // invisible — that's where we swap in a fresh emoji set, so the new
        // faces appear unseen at the bottom and rise up on the next inhale.
        const sink = ((1 - p) * 46).toFixed(1);
        plantsRef.current.style.transform = `translate(-50%, calc(-50% + ${sink}px)) scale(${(0.56 + p * 0.62).toFixed(4)})`;
        plantsRef.current.style.opacity = (0.04 + p * 0.85).toFixed(3);
      }
      // The phase word breathes a hair with the circle.
      if (labelRef.current) labelRef.current.style.transform = `scale(${0.97 + p * 0.06})`;
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
  // The globe turns once a second — 🌍 → 🌎 → 🌏 → 🌍 — so the world keeps
  // visibly spinning. Anchored to wall-clock time, so everyone breathing at
  // this moment sees the same face. (The ~150ms tick re-render below picks up
  // each second's change.)
  const globe = GLOBES[Math.floor(now / 1000) % GLOBES.length];
  const phaseLabel =
    phase === "in" ? t("cobreathe.phase_in", { defaultValue: "Breathe in" })
    : phase === "hold" ? t("cobreathe.phase_hold", { defaultValue: "Hold" })
    : t("cobreathe.phase_out", { defaultValue: "Breathe out" });

  // Where are we in the count? Negative during the pre-roll; uncapped after,
  // so the count keeps climbing past the target while they keep breathing.
  const sinceCount = now - countStartRef.current;
  const counting = sinceCount >= 0;
  const completed = counting ? Math.floor(sinceCount / CYCLE_MS) : 0;
  const breathNum = completed + 1;
  const reachedNow = counting && completed >= totalBreaths;
  const intention = counting ? INTENTIONS[(breathNum - 1) % INTENTIONS.length] : null;

  // Soft sage tones that sit calmly on the deep-green field.
  const TEXT_DIM = "rgba(182,210,188,0.72)";
  const TEXT_FAINT = "rgba(182,210,188,0.48)";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50, overflow: "hidden",
        background: counting ? FIELD_LIVE : FIELD_DIM,
        opacity: entered ? 1 : 0,
        transition: "background-color 1.6s ease, opacity 0.6s ease",
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

      {/* Radial plant spiral — small leaves spraying out from the globe,
          blooming on the inhale and contracting on the exhale. Sits beneath
          the globe so the world stays the centrepiece. */}
      <div
        ref={plantsRef}
        aria-hidden="true"
        style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%) scale(1)",
          pointerEvents: "none", zIndex: 1, willChange: "transform, opacity",
        }}
      >
        {PARTICLE_LAYOUT.map((pt, i) => (
          <span
            key={i}
            style={{
              position: "absolute", left: pt.x, top: pt.y,
              transform: "translate(-50%, -50%)",
              fontSize: pt.size, opacity: pt.opacity, lineHeight: 1,
            }}
          >
            {particleEmojis[i]}
          </span>
        ))}
      </div>

      {/* The world at the centre of the breath — turning between the three
          globes (one per second), sitting in the middle of the gradient and
          breathing gently with it. A little larger now, on top of the spiral. */}
      <div
        ref={globeRef}
        aria-hidden="true"
        style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%) scale(1)",
          fontSize: 72, lineHeight: 1, pointerEvents: "none", zIndex: 2,
          filter: "drop-shadow(0 3px 14px rgba(8,30,18,0.6))",
          willChange: "transform, opacity",
        }}
      >
        {globe}
      </div>

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
        <p
          className="text-center text-[15px] px-10 leading-relaxed mt-5"
          style={{ color: TEXT_DIM, fontFamily: SERIF, fontStyle: "italic", minHeight: 48 }}
        >
          {intention
            ? t(`cobreathe.intention.${intention.key}`, { defaultValue: intention.text })
            : t("cobreathe.settle", { defaultValue: "Everyone breathes to one shared pace, the same for all of us. Settle in — on the next breath, you'll join it." })}
        </p>
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
              letterSpacing: "0.14em", textTransform: "uppercase", textShadow: "0 2px 18px rgba(8,30,18,0.6)",
            }}
          >
            {phaseLabel}
          </span>
        </div>
        <p className="mt-6 text-[13px]" style={{ color: reachedNow ? "rgba(126,210,140,0.95)" : TEXT_DIM, fontFamily: SPACE_GROTESK }}>
          {!counting
            ? t("cobreathe.finding_rhythm", { defaultValue: "Syncing with the global breath…" })
            : reachedNow
              ? t("cobreathe.kept_keep_going", { count: totalBreaths, defaultValue: `🌿 ${totalBreaths} breaths kept — keep going as long as you like` })
              : t("cobreathe.breath_counter", { current: breathNum, total: totalBreaths, defaultValue: `Breath ${breathNum} of ${totalBreaths}` })}
        </p>
        {othersToday != null && othersToday > 0 && (
          <p className="mt-1.5 text-[12px]" style={{ color: TEXT_FAINT, fontFamily: SERIF, fontStyle: "italic" }}>
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
    </div>
  );
}
