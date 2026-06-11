import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

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

// ── The bloom ────────────────────────────────────────────────────────────────
// A soft, layered bloom of translucent green blades that swells on the inhale
// and recedes on the exhale, slowly turning. Two offset rings of broad,
// rounded blades overlap (screen-blended) into a luminous flower of light —
// no flat radial gradient, so nothing bands. Geometry is computed once.
function bladePath(r1: number, w: number, c: number): string {
  return `M 0 -6 C ${w} ${-r1 * 0.32 + c}, ${w * 0.7} ${-r1 * 0.84}, 0 ${-r1} ` +
    `C ${-w * 0.7} ${-r1 * 0.84}, ${-w} ${-r1 * 0.32 - c}, 0 -6 Z`;
}
const BLOOM_BLADES: Array<{ d: string; grad: number; ang: number }> = (() => {
  const out: Array<{ d: string; grad: number; ang: number }> = [];
  const ring = (count: number, offset: number, r1: number, w: number, curve: number, bias: number) => {
    for (let i = 0; i < count; i++) {
      out.push({ d: bladePath(r1, w, curve), grad: (i + bias) % 3, ang: (360 / count) * i + offset });
    }
  };
  ring(6, 0, 104, 48, 16, 2);   // back ring — broad
  ring(6, 30, 82, 34, 12, 0);   // front ring — narrower, offset, brighter
  return out;
})();
const BLOOM_GRADS = [
  ["#EAF7D2", "#46864A"],
  ["#CFEFA8", "#347140"],
  ["#A9DE88", "#276636"],
];

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
  // The breath is a soft green bloom that swells on the inhale and recedes on
  // the exhale, turning slowly, over a deep-green field.
  const bloomRef = useRef<SVGGElement>(null);
  const bloom2Ref = useRef<SVGGElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

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

  // A rAF loop writes transforms straight to the DOM from the global clock —
  // no React re-render per frame, perfectly synced for everyone, and only
  // transform/opacity (GPU-composited) so the swell stays glass-smooth.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      const pos = now % CYCLE_MS;
      const s = scaleAt(pos);
      // 0 at rest (full exhale) → 1 at full inhale.
      const p = (s - SMALL) / (BIG - SMALL);
      const rot = (now / 1000 * 3) % 360; // a slow, steady turn
      if (bloomRef.current) {
        bloomRef.current.setAttribute("transform", `scale(${(0.7 + s * 0.55).toFixed(4)}) rotate(${rot.toFixed(3)})`);
        bloomRef.current.style.opacity = String(0.55 + p * 0.4);
      }
      // A larger, fainter bloom turning the other way, a touch behind the
      // beat — gives the light depth and a slow, living parallax.
      if (bloom2Ref.current) {
        const rot2 = -(now / 1000 * 1.7) % 360;
        bloom2Ref.current.setAttribute("transform", `scale(${(0.95 + s * 0.62).toFixed(4)}) rotate(${rot2.toFixed(3)})`);
        bloom2Ref.current.style.opacity = String(0.14 + p * 0.20);
      }
      // The core glows brighter and swells slightly as the breath fills.
      if (dotRef.current) {
        dotRef.current.setAttribute("transform", `scale(${(0.7 + s * 0.55).toFixed(4)})`);
        dotRef.current.style.opacity = String(0.28 + p * 0.30);
      }
      // The phase word breathes a hair with the bloom.
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
      const since = Date.now() - countStartRef.current;
      const completed = since >= 0 ? Math.floor(since / CYCLE_MS) : 0;
      // Only credit the breath if the session stayed visible — a backgrounded
      // tab/app that "completed" the count while away doesn't count.
      if (!reachedRef.current && !invalidRef.current && completed >= totalBreaths) {
        reachedRef.current = true;
        onReachTarget?.(Math.round((Date.now() - startRef.current) / 1000));
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
        background: "radial-gradient(circle at 50% 42%, #0E2A1E 0%, #0A1C14 55%, #06120C 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        paddingTop: "calc(env(safe-area-inset-top) + 28px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
      }}
    >
      {/* The breath — a soft layered green bloom, centered, swelling on the
          inhale and receding on the exhale, turning slowly. Built from
          overlapping translucent blades (screen-blended) so it glows without
          any flat gradient to band. Driven by the global clock, so everyone
          breathing at this moment sees the same bloom at the same size. */}
      <svg
        width="384" height="384" viewBox="-180 -180 360 360"
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none", overflow: "visible" }}
        aria-hidden="true"
      >
        <defs>
          {/* Generous filter region so the blur isn't clipped at full inhale —
              that clipping is what showed as straight edges on the bloom. */}
          <filter id="cb-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <radialGradient id="cb-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#CFEFB8" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#6FB85F" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#6FB85F" stopOpacity="0" />
          </radialGradient>
          {BLOOM_GRADS.map((g, i) => (
            <linearGradient key={i} id={`cb-bl${i}`} x1="0" y1="0" x2="0.45" y2="1">
              <stop offset="0%" stopColor={g[0]} stopOpacity="0.78" />
              <stop offset="100%" stopColor={g[1]} stopOpacity="0.4" />
            </linearGradient>
          ))}
        </defs>
        <circle cx="0" cy="0" r="120" fill="url(#cb-core)" />
        <g ref={bloom2Ref} filter="url(#cb-soft)" style={{ mixBlendMode: "screen" }} opacity={0.14}>
          {BLOOM_BLADES.map((b, i) => (
            <path key={`b2-${i}`} d={b.d} fill={`url(#cb-bl${b.grad})`} transform={`rotate(${b.ang})`} />
          ))}
        </g>
        <g ref={bloomRef} filter="url(#cb-soft)" style={{ mixBlendMode: "screen" }}>
          {BLOOM_BLADES.map((b, i) => (
            <path key={i} d={b.d} fill={`url(#cb-bl${b.grad})`} transform={`rotate(${b.ang})`} />
          ))}
        </g>
        <circle ref={dotRef} cx="0" cy="0" r="16" fill="#CFEFA8" opacity="0.36" />
      </svg>

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
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(182,210,188,0.55)", fontFamily: SPACE_GROTESK }}>
          🌬️ {t("cobreathe.title", { defaultValue: "Cobreathe" })}
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

      {/* Phase word — center, over the glow */}
      <div className="flex flex-col items-center" style={{ position: "relative" }}>
        <div ref={labelRef} style={{ willChange: "transform" }}>
          <span
            style={{
              color: WARM, fontFamily: SPACE_GROTESK, fontSize: 26, fontWeight: 600,
              letterSpacing: "0.04em", textShadow: "0 2px 18px rgba(8,30,18,0.6)",
            }}
          >
            {phaseLabel}
          </span>
        </div>
        <p className="mt-6 text-[13px]" style={{ color: reachedNow ? "rgba(126,210,140,0.95)" : TEXT_DIM, fontFamily: SPACE_GROTESK }}>
          {!counting
            ? t("cobreathe.finding_rhythm", { defaultValue: "Waiting for the next breath to begin together…" })
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
          : t("cobreathe.end_early", { defaultValue: "End early" })}
      </button>
    </div>
  );
}
