/**
 * "Weekly Progress" — a 7-day dot grid for the first three of the Way of
 * Love's daily practices (Turn / Learn / Pray), read directly off what the
 * user has already done rather than logged separately — there's nothing new
 * to tap here, this is a status mirror. Sits under the daily rhythm on the
 * home, echoing the "Your prayer rhythm" card's dot-grid from the onboarding
 * tour (owner), styled to match WeeklyGridCard's card treatment.
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
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useRhythmState } from "@/hooks/useRhythmState";
import { getSideLevel } from "@/lib/officePrefs";
import { apiRequest } from "@/lib/queryClient";

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

  // One shared green across all rows — matching the header's Daily Progress
  // pill dots (rgba(110,180,130,...) in layout.tsx) and the CTA pill fills
  // elsewhere on the home, so this card's "kept" color reads as the same
  // accent everywhere rather than a separate per-row palette.
  const KEPT_RGB = "110,180,130";
  const rows: Array<{ emoji: string; label: string; done: boolean; rgb: string; historyFor: (d: PracticeWeekDay) => boolean }> = [
    { emoji: "🔄", label: "Turn", done: turned, rgb: KEPT_RGB, historyFor: (d) => readTurnedOn(d.ymd) },
    { emoji: "📖", label: "Learn", done: learned, rgb: KEPT_RGB, historyFor: learnedOn },
    { emoji: "🙏🏽", label: "Pray", done: prayed, rgb: KEPT_RGB, historyFor: prayedOn },
  ];
  // Build the 7-day window CLIENT-SIDE (today last) so the grid always has
  // 7 columns to draw the instant this renders — never blank while
  // /api/me/practice-week is still in flight. Server days (when they land)
  // are matched in by ymd; a day the server hasn't reported yet just reads
  // as "not kept" for Learn/Pray until it arrives (Turn never depends on the
  // server at all — see readTurnedOn).
  const serverByYmd = new Map((week?.days ?? []).map((d) => [d.ymd, d]));
  const EMPTY_DAY: PracticeWeekDay = { ymd: "", morning: false, evening: false, compline: false, contemplation: false, reflection: false, examen: false, cobreathe: false };
  // Today FIRST, oldest last (owner) — reverse of the server's own
  // chronological order, which windowDays intentionally doesn't follow.
  const windowDays: PracticeWeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ymd = d.toLocaleDateString("en-CA");
    return serverByYmd.get(ymd) ?? { ...EMPTY_DAY, ymd };
  });
  const dayInitials = windowDays.map((d) => {
    const wd = new Date(`${d.ymd}T12:00:00`).getDay();
    return Number.isNaN(wd) ? "" : ["S", "M", "T", "W", "T", "F", "S"][wd];
  });

  return (
    <Link href="/turn-learn-pray" className="block mt-7 transition-opacity hover:opacity-95 active:scale-[0.99]">
      {/* "Past 7 Days" as a centered, small-caps label with a thin rule on
          either side — matching the onboarding mock's own dot-grid section
          (owner) — in place of the "This week"-style rule header this card
          used before. */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
        <p
          className="text-center text-[11px] font-semibold uppercase tracking-widest flex-shrink-0"
          style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}
        >
          Past 7 Days
        </p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>
      {/* One dot row per practice — no separate "Completed" status rows
          above it (owner): always 7 columns (windowDays is client-computed)
          so this never sits blank waiting on the network. Same rounding +
          border as the Next practice cards above (CARD_BORDER in
          DailyProgressBody.tsx) so this reads as one family with them. */}
      <div
        className="rounded-3xl px-4 pt-4"
        style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(200,212,192,0.35)", paddingBottom: 20 }}
      >
        {(() => {
          const COLS = "20px repeat(7, 1fr)";
          return (
            <div style={{ display: "grid", rowGap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                <div />
                {dayInitials.map((ch, i) => (
                  <span
                    key={i}
                    className="text-center text-[10.5px] font-semibold"
                    style={{ color: i === 0 ? "rgba(240,237,230,0.7)" : "rgba(143,175,150,0.45)", fontFamily: FONT }}
                  >
                    {ch}
                  </span>
                ))}
              </div>
              {rows.map((r) => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                  <span
                    className="text-center text-[10.5px] font-semibold"
                    style={{ color: "rgba(143,175,150,0.45)", fontFamily: FONT }}
                    title={r.label}
                  >
                    {r.label[0]}
                  </span>
                  {windowDays.map((d, i) => {
                    // Today reads from the live, already-computed state
                    // (r.done) rather than historyFor(d) — the server's
                    // practice-week snapshot can lag a few seconds behind a
                    // just-finished practice, which showed today's dot as
                    // still empty right after completing all three.
                    const isToday = i === 0;
                    const kept = isToday ? r.done : r.historyFor(d);
                    return (
                      <span key={d.ymd || i} className="flex justify-center">
                        <span
                          title={`${r.label} · ${d.ymd}`}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 999,
                            background: kept ? `rgba(${r.rgb},0.85)` : "transparent",
                            border: kept ? "none" : "1px solid rgba(143,175,150,0.28)",
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
    </Link>
  );
}
