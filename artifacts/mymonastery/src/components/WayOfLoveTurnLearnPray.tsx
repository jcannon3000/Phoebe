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
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useRhythmState } from "@/hooks/useRhythmState";
import { apiRequest } from "@/lib/queryClient";
import { computeWeeklyGrid, type PracticeWeekDay } from "@/lib/weeklyGrid";

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

// Row-labeling mode: true (default) = Morning/Contemplative/Evening
// Practice; false = Turn/Learn/Pray (the Way of Love framework) — same
// three rows, same dots, same history, just which lens labels them. Stored
// under the key settings.tsx writes (TLP_MODE_KEY there); unset or "1"
// reads as the default (Morning/Contemplative/Evening), only an explicit
// "0" (the user toggled it off in Settings) reads as Turn/Learn/Pray.
const MODE_KEY = "phoebe:tlp-row-mode";

function readPracticeMode(): boolean {
  try { return localStorage.getItem(MODE_KEY) !== "0"; } catch { return true; }
}

function usePracticeModePref(): boolean {
  const [mode, setMode] = useState(readPracticeMode);
  useEffect(() => {
    const onChange = () => setMode(readPracticeMode());
    window.addEventListener("phoebe:prefs-changed", onChange);
    return () => window.removeEventListener("phoebe:prefs-changed", onChange);
  }, []);
  return mode;
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

export function WayOfLoveTurnLearnPray({ cascadeDelay = 0 }: { cascadeDelay?: number } = {}) {
  const rhythm = useRhythmState();
  const turned = useTurnedToday();
  const hidden = useHiddenPref();
  const practiceMode = usePracticeModePref();
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const { data: week } = useQuery<{ days: PracticeWeekDay[] }>({
    queryKey: ["/api/me/practice-week", tz],
    // `tz` used to be computed here and then only fed into the query KEY —
    // never actually sent. The server fell back to usersTable.timezone,
    // which has no writer anywhere and is NULL for most accounts, so day
    // boundaries silently computed in UTC instead of the viewer's real
    // zone — anything done after ~8pm ET landed under the wrong UTC day
    // and vanished from both. Actually sending it lets the server use the
    // live, correct value (and opportunistically backfill the stored one).
    queryFn: () => apiRequest("GET", `/api/me/practice-week?tz=${encodeURIComponent(tz)}`),
    staleTime: 60_000,
  });

  // Same "don't paint until the done-state queries have settled" guard every
  // other rhythm surface uses — otherwise Learn/Pray would flash "Not yet"
  // on a slow first load.
  if (!rhythm.ready || hidden) return null;

  // Extracted to lib/weeklyGrid.ts so the iOS widget can render EXACTLY this
  // same grid instead of a separately-maintained approximation — this file
  // already hit drift bugs twice this session from logic living in two
  // places (missing PracticeWeekDay fields, then a Contemplative-mode gap).
  const { rows, dayInitials, ymds } = computeWeeklyGrid({ rhythm, week, practiceMode, turned });
  // One shared green across all rows — matching the header's Daily Progress
  // pill dots (rgba(110,180,130,...) in layout.tsx), per owner: back to a
  // single shared accent rather than a per-row gradient (tried both a
  // shared-ramp and a dots-only ramp pushed to its light end; owner wants
  // this card's dots reading as the SAME color as the header pill instead).
  const KEPT_RGB = "110,180,130";
  const todayYmd = new Date().toLocaleDateString("en-CA");

  return (
    // Fade-up entrance matching the app's standard cascade (dashboard's
    // enterUp: opacity 0->1, y 10->0, 0.55s, same ease curve) — this card
    // had none before and just snapped into place. `cascadeDelay` places it
    // in the caller's stagger sequence (the dashboard passes one so this
    // lands AFTER the Next practice cards' own cascade and BEFORE Courses,
    // matching WeeklyRhythm's identical cascadeBaseDelay prop for the same
    // purpose); defaults to 0 for the standalone /turn-learn-pray page,
    // which has no cards above it to wait on. Otherwise self-contained: it
    // animates from its own first mount, which only happens once
    // `rhythm.ready` is true (the early return above), so it never fades in
    // before there's real data to show.
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: cascadeDelay }}>
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
                {ymds.map((ymd, i) => (
                  <span
                    key={i}
                    className="text-center text-[10.5px] font-semibold"
                    style={{ color: ymd === todayYmd ? "rgba(240,237,230,0.7)" : "rgba(143,175,150,0.45)", fontFamily: FONT }}
                  >
                    {dayInitials[i]}
                  </span>
                ))}
              </div>
              {rows.map((r) => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                  <span
                    className="text-center text-[11px]"
                    style={{ fontFamily: FONT }}
                    title={r.label}
                  >
                    {r.emoji}
                  </span>
                  {r.kept.map((kept, i) => (
                    <span key={ymds[i] || i} className="flex justify-center">
                      <span
                        title={`${r.label} · ${ymds[i]}`}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          background: kept ? `rgba(${KEPT_RGB},0.85)` : "transparent",
                          border: kept ? "none" : "1px solid rgba(143,175,150,0.28)",
                        }}
                      />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </Link>
    </motion.div>
  );
}
