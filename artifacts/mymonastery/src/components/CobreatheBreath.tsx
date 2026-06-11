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
const SAGE = "#8FAF96";
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

export function CobreatheBreath({
  onReachTarget,
  onEnd,
  totalBreaths = DEFAULT_TOTAL_BREATHS,
  othersToday,
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
}) {
  const { t } = useTranslation();
  const circleRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  // Anchor points (fixed at mount): when the user arrived, and the next clean
  // cycle boundary where the count begins. There is NO end anchor — the rhythm
  // runs on until the user chooses to finish.
  const startRef = useRef(Date.now());
  const countStartRef = useRef(Math.ceil(startRef.current / CYCLE_MS) * CYCLE_MS);
  const reachedRef = useRef(false);

  // Smooth circle: a rAF loop writes the transform straight to the DOM from the
  // global clock — no React re-render per frame, perfectly synced for all.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const pos = Date.now() % CYCLE_MS;
      const s = scaleAt(pos);
      if (circleRef.current) circleRef.current.style.transform = `scale(${s})`;
      if (haloRef.current) haloRef.current.style.transform = `scale(${s * 1.22})`;
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
      if (!reachedRef.current && completed >= totalBreaths) {
        reachedRef.current = true;
        onReachTarget?.(Math.round((Date.now() - startRef.current) / 1000));
      }
      setTick((n) => n + 1);
    }, 150);
    return () => clearInterval(id);
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

  return (
    <div className="flex flex-col items-center justify-between flex-1 py-6" style={{ minHeight: "70vh" }}>
      <p
        className="text-center text-[15px] px-8 leading-relaxed"
        style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic", minHeight: 48 }}
      >
        {intention
          ? t(`cobreathe.intention.${intention.key}`, { defaultValue: intention.text })
          : t("cobreathe.settle", { defaultValue: "Settle in, and find the rhythm — others are already breathing." })}
      </p>

      <div className="flex flex-col items-center justify-center flex-1 my-6">
        <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
          {/* Outer halo */}
          <div
            ref={haloRef}
            style={{
              position: "absolute", width: 170, height: 170, borderRadius: "50%",
              background: "rgba(62,124,122,0.12)",
              transform: `scale(${SMALL * 1.22})`,
              willChange: "transform",
            }}
          />
          {/* Breath circle */}
          <div
            ref={circleRef}
            style={{
              position: "absolute", width: 150, height: 150, borderRadius: "50%",
              background: "radial-gradient(circle at 38% 32%, rgba(143,175,150,0.55), rgba(46,107,64,0.85))",
              border: "1px solid rgba(143,175,150,0.5)",
              boxShadow: "0 0 60px rgba(62,124,122,0.35)",
              transform: `scale(${SMALL})`,
              willChange: "transform",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 600 }}>
              {phaseLabel}
            </span>
          </div>
        </div>
        <p className="mt-8 text-[13px]" style={{ color: reachedNow ? "rgba(110,180,130,0.9)" : "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
          {!counting
            ? t("cobreathe.finding_rhythm", { defaultValue: "Finding the rhythm…" })
            : reachedNow
              ? t("cobreathe.kept_keep_going", { count: totalBreaths, defaultValue: `🌿 ${totalBreaths} breaths kept — keep going as long as you like` })
              : t("cobreathe.breath_counter", { current: breathNum, total: totalBreaths, defaultValue: `Breath ${breathNum} of ${totalBreaths}` })}
        </p>
        {othersToday != null && othersToday > 0 && (
          <p className="mt-1.5 text-[12px]" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SERIF, fontStyle: "italic" }}>
            {t("cobreathe.breathing_with_you", { count: othersToday, defaultValue: `${othersToday} ${othersToday === 1 ? "person is" : "people are"} breathing with you today` })}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onEnd(Math.round((Date.now() - startRef.current) / 1000), reachedRef.current)}
        className="text-[13px] py-2 px-6"
        style={{
          color: reachedNow ? "#F0EDE6" : "rgba(143,175,150,0.55)",
          fontWeight: reachedNow ? 600 : 400,
          fontFamily: SPACE_GROTESK, background: "none", border: "none", cursor: "pointer",
        }}
      >
        {reachedNow
          ? t("cobreathe.finish", { defaultValue: "Finish" })
          : t("cobreathe.end_early", { defaultValue: "End early" })}
      </button>
    </div>
  );
}
