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
import { useQuery } from "@tanstack/react-query";
import { useRhythmState } from "@/hooks/useRhythmState";
import { getSideLevel } from "@/lib/officePrefs";
import { apiRequest } from "@/lib/queryClient";

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

// Reuses the same unified matrix WeeklyGridCard reads from — no new
// server work. Only Turn has no server field (opening the app isn't logged
// anywhere); its 7-day history comes from the same local per-day stamp
// useTurnedToday() writes, read back for the prior 6 days too.
type PracticeWeekDay = { ymd: string; morning: boolean; evening: boolean; compline: boolean; contemplation: boolean; reflection: boolean; examen: boolean; cobreathe: boolean };

function readTurnedOn(ymd: string): boolean {
  try { return localStorage.getItem(`phoebe:turn-opened:${ymd}`) === "1"; } catch { return false; }
}

export function WayOfLoveTurnLearnPray() {
  const rhythm = useRhythmState();
  const turned = useTurnedToday();
  const hidden = useHiddenPref();
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const { data: week } = useQuery<{ days: PracticeWeekDay[] }>({
    queryKey: ["/api/me/practice-week", tz],
    queryFn: () => apiRequest("GET", "/api/me/practice-week"),
    staleTime: 60_000,
  });

  // Same "don't paint until the done-state queries have settled" guard every
  // other rhythm surface uses — otherwise Learn/Pray would flash "Not yet"
  // on a slow first load.
  if (!rhythm.ready || hidden) return null;

  // Historical days don't carry which OfficeLevel was chosen that day, only
  // whether the side was kept — so, like the rest of this card, Learn's
  // history reads the CURRENT side choices back across the week. A side
  // switched mid-week will misjudge older days; an acceptable approximation
  // for a lightweight status mirror, not a source of truth.
  const morningIsScripture = SCRIPTURE_LEVELS.has(getSideLevel("morning") ?? "");
  const eveningIsScripture = SCRIPTURE_LEVELS.has(getSideLevel("evening") ?? "");
  const learnedOn = (d: PracticeWeekDay) => d.reflection || (morningIsScripture && d.morning) || (eveningIsScripture && d.evening);
  const prayedOn = (d: PracticeWeekDay) => d.morning || d.evening || d.compline || d.contemplation || d.examen || d.cobreathe;

  const learnFromReflection = rhythm.reflections.some((r) => r.done);
  const learnFromMorning = rhythm.morningDone && morningIsScripture;
  const learnFromEvening = rhythm.eveningDone && eveningIsScripture;
  const learned = learnFromReflection || learnFromMorning || learnFromEvening;
  const prayed = rhythm.doneCount > 0;

  const rows: Array<{ emoji: string; label: string; done: boolean; rgb: string; historyFor: (d: PracticeWeekDay) => boolean }> = [
    { emoji: "🔄", label: "Turn", done: turned, rgb: "46,107,64", historyFor: (d) => readTurnedOn(d.ymd) },
    { emoji: "📖", label: "Learn", done: learned, rgb: "96,141,209", historyFor: learnedOn },
    { emoji: "🙏🏽", label: "Pray", done: prayed, rgb: "150,120,180", historyFor: prayedOn },
  ];
  const days = week?.days ?? [];
  const dayInitials = days.map((d) => {
    const wd = new Date(`${d.ymd}T12:00:00`).getDay();
    return Number.isNaN(wd) ? "" : ["S", "M", "T", "W", "T", "F", "S"][wd];
  });

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
      {/* Past 7 days — one dot row per practice, echoing the onboarding
          mock's grid. Skipped until the week query lands (no flash of an
          empty grid). */}
      {days.length > 0 && (
        <div className="mt-4">
          <p className="text-center text-[10.5px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
            Past 7 Days
          </p>
          {(() => {
            const COLS = "28px repeat(7, 1fr)";
            return (
              <div style={{ display: "grid", rowGap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                  <div />
                  {dayInitials.map((ch, i) => (
                    <span
                      key={i}
                      className="text-center text-[10.5px] font-semibold"
                      style={{ color: i === dayInitials.length - 1 ? "rgba(240,237,230,0.7)" : "rgba(143,175,150,0.45)", fontFamily: FONT }}
                    >
                      {ch}
                    </span>
                  ))}
                </div>
                {rows.map((r) => (
                  <div key={r.label} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                    <span className="text-[13px] leading-none" aria-hidden>{r.emoji}</span>
                    {days.map((d, i) => {
                      const kept = r.historyFor(d);
                      const isToday = i === days.length - 1;
                      return (
                        <span key={d.ymd} className="flex justify-center">
                          <span
                            title={`${r.label} · ${d.ymd}`}
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: kept ? `rgba(${r.rgb},0.7)` : "transparent",
                              border: kept ? "none" : "1px solid rgba(143,175,150,0.28)",
                              outline: isToday ? "1.5px solid rgba(240,237,230,0.55)" : "none",
                              outlineOffset: 2,
                            }}
                          />
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
