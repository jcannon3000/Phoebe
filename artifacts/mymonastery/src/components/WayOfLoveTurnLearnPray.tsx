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
import { getSideLevel } from "@/lib/officePrefs";
import { getCustomAnchors, getCustomDoneDays } from "@/lib/customAnchors";
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

// Row-labeling mode: false (default) = Turn/Learn/Pray (the Way of Love
// framework); true = Morning/Contemplative/Evening Practice — same three
// rows, same dots, same history, just which lens labels them. Stored under
// the key settings.tsx writes (TLP_MODE_KEY there).
const MODE_KEY = "phoebe:tlp-row-mode";

function readPracticeMode(): boolean {
  try { return localStorage.getItem(MODE_KEY) === "1"; } catch { return false; }
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

// Which office levels actually carry a real lectionary lesson — Praying the
// Psalms doesn't (owner: the Psalter isn't a reading in the same sense the
// Office/Devotion/Forward Day by Day lesson is), and neither do
// Contemplation, the Examen, Simple Guided Prayer (PACT), or a custom
// practice — so a side set to any of those must not count toward Learn just
// because it was kept.
const SCRIPTURE_LEVELS = new Set(["office", "devotion", "fdd"]);

// Reuses the same unified matrix WeeklyGridCard reads from — no new
// server work. Only Turn has no server field (opening the app isn't logged
// anywhere); its 7-day history comes from the same local per-day stamp
// useTurnedToday() writes, read back for the prior 6 days too.
//
// Carries every field GET /api/me/practice-week actually returns (see
// routes/users.ts) — a prior version of this type was missing listening/
// reading/podcasts/walk/prayerList entirely, which silently dropped them
// from prayedOn() below even though they DO count toward "today" via
// rhythm.doneCount. That mismatch was the "past day activity didn't hold"
// bug: log a Contemplative Walk or Audio Divina sit today and TODAY reads
// correctly (it reads rhythm.doneCount, not prayedOn), but the same kind of
// day one column over always read as empty, because prayedOn had no field
// to check it against.
type PracticeWeekDay = {
  ymd: string; morning: boolean; evening: boolean; compline: boolean;
  contemplation: boolean; reflection: boolean; examen: boolean; cobreathe: boolean;
  listening: boolean; reading: boolean; podcasts: boolean; walk: boolean; prayerList: boolean;
};

function readTurnedOn(ymd: string): boolean {
  try { return localStorage.getItem(`phoebe:turn-opened:${ymd}`) === "1"; } catch { return false; }
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

  // Historical days don't carry which OfficeLevel was chosen that day, only
  // whether the side was kept — so, like the rest of this card, Learn's
  // history reads the CURRENT side choices back across the week. A side
  // switched mid-week will misjudge older days; an acceptable approximation
  // for a lightweight status mirror, not a source of truth.
  const morningIsScripture = SCRIPTURE_LEVELS.has(getSideLevel("morning") ?? "");
  const eveningIsScripture = SCRIPTURE_LEVELS.has(getSideLevel("evening") ?? "");
  const learnedOn = (d: PracticeWeekDay) => d.reflection || (morningIsScripture && d.morning) || (eveningIsScripture && d.evening);
  // User-defined "Create your own" practices (e.g. a Duolingo check-off)
  // live entirely client-side — they're not in /api/me/practice-week at
  // all, server or client. Each one keeps its own rolling ~21-day history
  // in localStorage (getCustomDoneDays), which is exactly what powers ITS
  // OWN dot on a per-anchor row elsewhere — but was never folded into
  // Pray's row here, even though a custom anchor DOES count toward
  // rhythm.doneCount for today. Same current-anchors-judged-retroactively
  // approximation as morningIsScripture above: if you delete a custom
  // anchor, its past days drop out of this check along with it.
  const customAnchorIds = getCustomAnchors().map((a) => a.id);
  const prayedOnCustom = (ymd: string) => customAnchorIds.some((id) => getCustomDoneDays(id).has(ymd));
  // Every anchor that can make rhythm.doneCount > 0 for TODAY (see
  // useRhythmState's allFlags), so a past day reads consistently with how
  // that same day would have read as "today" — a Walk-only or Audio
  // Divina-only day is genuinely prayed, not just Turn.
  const prayedOn = (d: PracticeWeekDay) =>
    d.morning || d.evening || d.compline || d.contemplation || d.examen || d.cobreathe
    || d.listening || d.reading || d.podcasts || d.walk || d.prayerList
    || prayedOnCustom(d.ymd);

  const learnFromReflection = rhythm.reflections.some((r) => r.done);
  const learnFromMorning = rhythm.morningDone && morningIsScripture;
  const learnFromEvening = rhythm.eveningDone && eveningIsScripture;
  const learned = learnFromReflection || learnFromMorning || learnFromEvening;
  const prayed = rhythm.doneCount > 0;

  // Morning / Contemplative / Evening Practice — the same three rows read
  // through a plain time-of-day lens instead of the Way of Love framework.
  // Reuses fields the server already returns (no new endpoint): Contemplative
  // ORs every contemplative anchor (per-side sits, the solo goal card,
  // Co-Breathe), matching how "prayed" already ORs across anchor types above.
  const morningPracticeOn = (d: PracticeWeekDay) => d.morning;
  const eveningPracticeOn = (d: PracticeWeekDay) => d.evening;
  const contemplativePracticeOn = (d: PracticeWeekDay) => d.contemplation || d.cobreathe;
  const morningPractice = rhythm.morningDone;
  const eveningPractice = rhythm.eveningDone;
  const contemplativePractice = rhythm.morningContemplationDone || rhythm.eveningContemplationDone
    || rhythm.silenceGoalCardDone || rhythm.cobreatheDone;

  // One shared green across all rows — matching the header's Daily Progress
  // pill dots (rgba(110,180,130,...) in layout.tsx), per owner: back to a
  // single shared accent rather than a per-row gradient (tried both a
  // shared-ramp and a dots-only ramp pushed to its light end; owner wants
  // this card's dots reading as the SAME color as the header pill instead).
  const KEPT_RGB = "110,180,130";
  const rows: Array<{ emoji: string; label: string; done: boolean; rgb: string; historyFor: (d: PracticeWeekDay) => boolean }> = practiceMode ? [
    { emoji: "🌅", label: "Morning", done: morningPractice, rgb: KEPT_RGB, historyFor: morningPracticeOn },
    { emoji: "🕯️", label: "Contemplative", done: contemplativePractice, rgb: KEPT_RGB, historyFor: contemplativePracticeOn },
    { emoji: "🌙", label: "Evening", done: eveningPractice, rgb: KEPT_RGB, historyFor: eveningPracticeOn },
  ] : [
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
  const EMPTY_DAY: PracticeWeekDay = {
    ymd: "", morning: false, evening: false, compline: false, contemplation: false,
    reflection: false, examen: false, cobreathe: false,
    listening: false, reading: false, podcasts: false, walk: false, prayerList: false,
  };
  const todayYmd = new Date().toLocaleDateString("en-CA");
  // Oldest FIRST, today LAST (owner) — matches the server's own
  // chronological order and reads left-to-right like a calendar week,
  // ending on today. (Previously today led and the week ran backwards,
  // which read against the grain for anyone used to a normal calendar.)
  const windowDays: PracticeWeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i;
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const ymd = d.toLocaleDateString("en-CA");
    return serverByYmd.get(ymd) ?? { ...EMPTY_DAY, ymd };
  });
  const dayInitials = windowDays.map((d) => {
    const wd = new Date(`${d.ymd}T12:00:00`).getDay();
    return Number.isNaN(wd) ? "" : ["S", "M", "T", "W", "T", "F", "S"][wd];
  });

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
                {windowDays.map((d, i) => (
                  <span
                    key={i}
                    className="text-center text-[10.5px] font-semibold"
                    style={{ color: d.ymd === todayYmd ? "rgba(240,237,230,0.7)" : "rgba(143,175,150,0.45)", fontFamily: FONT }}
                  >
                    {dayInitials[i]}
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
                    // still empty right after completing all three. Checked
                    // by ymd, not position — today is now the LAST column
                    // (see windowDays above), not the first.
                    const isToday = d.ymd === todayYmd;
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
    </motion.div>
  );
}
