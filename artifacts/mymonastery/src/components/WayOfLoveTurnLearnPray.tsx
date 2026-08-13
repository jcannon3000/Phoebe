/**
 * "Turn · Learn · Pray" — the first three of the Way of Love's daily
 * practices, read directly off what the user has already done today rather
 * than logged separately — there's nothing new to tap here, this is a
 * status mirror. Sits under the daily rhythm on the home, bringing back the
 * "Your prayer rhythm" card's visual language from the onboarding tour
 * (owner) as a live card, styled to match WeeklyRhythm's "This week" band
 * directly below it.
 *
 *   Turn  — opening Phoebe at all today. Stamped the moment this card first
 *           mounts for the local day, so it reads true the instant you're
 *           looking at the home — showing up IS turning.
 *   Learn — a reflection was read (CAC/FDD/SSJE/VTS) OR a side whose chosen
 *           practice actually carries scripture (the Office, a Devotion, or
 *           Praying the Psalms — not Contemplation/Examen/PACT, which don't)
 *           was kept today.
 *   Pray  — any anchor at all was kept today.
 */
import { useEffect, useState } from "react";
import { useRhythmState } from "@/hooks/useRhythmState";
import { getSideLevel } from "@/lib/officePrefs";

const WARM = "#F0EDE6";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Settings → Home display exposes an on/off toggle for this card, stored
// under the same key settings.tsx writes (HIDE_TLP_KEY there).
const HIDE_KEY = "phoebe:hide-turn-learn-pray";

function readHidden(): boolean {
  try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
}

// Live-updates when the toggle flips, without a reload — same pattern the
// header's Daily Progress pill uses for its own hide toggle.
function useHiddenPref(): boolean {
  const [hidden, setHidden] = useState(readHidden);
  useEffect(() => {
    const onChange = () => setHidden(readHidden());
    window.addEventListener("phoebe:prefs-changed", onChange);
    return () => window.removeEventListener("phoebe:prefs-changed", onChange);
  }, []);
  return hidden;
}

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Stamp + read "did I open the app today" — set once, the first time this
// card mounts on a given local day. No server round-trip: opening the app
// IS the local fact being recorded, so there's nothing to sync.
function useTurnedToday(): boolean {
  const [turned, setTurned] = useState(false);
  useEffect(() => {
    const key = `phoebe:turn-opened:${localDay()}`;
    try {
      if (!localStorage.getItem(key)) localStorage.setItem(key, "1");
    } catch { /* private mode / quota — still true for this session */ }
    setTurned(true);
  }, []);
  return turned;
}

// Which office levels actually carry scripture on their own (a real
// lectionary lesson or the appointed Psalms) — Contemplation, the Examen,
// Simple Guided Prayer (PACT), and a custom practice don't, so a side set to
// one of those must not count toward Learn just because it was kept.
const SCRIPTURE_LEVELS = new Set(["office", "devotion", "psalms", "fdd"]);

export function WayOfLoveTurnLearnPray() {
  const rhythm = useRhythmState();
  const turned = useTurnedToday();
  const hidden = useHiddenPref();

  // Same "don't paint until the done-state queries have settled" guard every
  // other rhythm surface uses — otherwise Learn/Pray would flash "Not yet"
  // on a slow first load.
  if (!rhythm.ready || hidden) return null;

  const learnFromReflection = rhythm.reflections.some((r) => r.done);
  const learnFromMorning = rhythm.morningDone && SCRIPTURE_LEVELS.has(getSideLevel("morning") ?? "");
  const learnFromEvening = rhythm.eveningDone && SCRIPTURE_LEVELS.has(getSideLevel("evening") ?? "");
  const learned = learnFromReflection || learnFromMorning || learnFromEvening;
  const prayed = rhythm.doneCount > 0;

  const rows: Array<{ emoji: string; label: string; done: boolean }> = [
    { emoji: "🌱", label: "Turn", done: turned },
    { emoji: "📖", label: "Learn", done: learned },
    { emoji: "🙏🏽", label: "Pray", done: prayed },
  ];

  return (
    <div className="mt-7">
      {/* Same header treatment as "This week" (WeeklyRhythm) directly below. */}
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>
          Turn · Learn · Pray
        </h3>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="relative w-full flex rounded-3xl overflow-hidden"
            style={{
              background: "rgba(26,52,36,0.27)",
              backdropFilter: "blur(11.34px)",
              WebkitBackdropFilter: "blur(11.34px)",
              border: "1px solid rgba(200,212,192,0.35)",
            }}
          >
            <div className="w-1 flex-shrink-0" style={{ background: `rgba(46,107,64,${r.done ? 0.7 : 0.3})` }} />
            <div className="flex-1 px-4 py-3.5 flex items-center gap-3">
              <span className="text-xl flex-shrink-0" aria-hidden>{r.emoji}</span>
              <p className="flex-1 text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{r.label}</p>
              <span
                className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
                style={r.done
                  ? { background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(126,210,140,0.5)" }
                  : { background: "transparent", color: "rgba(182,210,188,0.6)", border: "1px solid rgba(143,175,150,0.25)" }}
              >
                {r.done ? "Completed ✓" : "Not yet"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
