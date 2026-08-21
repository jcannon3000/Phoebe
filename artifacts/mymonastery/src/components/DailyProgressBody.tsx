/**
 * DailyProgressBody — the rhythm content of the /daily-progress page: the four
 * (+optional) practice anchors split into "Next" and "Done", plus the streak
 * card. Extracted so it can be reused as the home screen body for beta users
 * (the home becomes the daily-progress view) without duplicating the cards.
 *
 * Page chrome (back link, title, Customize) stays in daily-progress.tsx; this
 * is just the cards + streak.
 */

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { useEffectiveReflectionSource, getSideLevel, getSideMinutes, getSideCustomName, sideOfficeTitle, type ReflectionSource } from "@/lib/officePrefs";
import { CAC_TODAY_URL, markCacRead, FDD_TODAY_URL, markFddRead, SSJE_TODAY_URL, markSsjeRead, VTS_TODAY_URL, markVtsRead, markCustomPrayed, unmarkCustomPrayed } from "@/lib/cacReadState";
import { openExternal, openExternalThenMarkRead } from "@/lib/openExternal";
import { markCustomDoneToday, setCustomNotToday, logReadingToday, getReadingToday, getReadingTotal, readingUnitLabel, getCustomAnchors, getCustomDoneDays, getPracticeSlot, isSlotOpen, isSlotPast, slotOpensLabel, EVENING_OPEN_HOUR, CUSTOM_ANCHORS_EVENT, CUSTOM_DONE_EVENT, type CustomSlot, type ReadingConfig } from "@/lib/customAnchors";
import { markPracticeDoneToday, unmarkPracticeDoneToday, setPracticeNotToday, type OptionalPractice } from "@/lib/practiceCompletion";
import { undoOfficeToday } from "@/lib/officeManualLog";
import { anchorPracticeFor } from "@/lib/anchorPractices";
import { getPrayerListSlot } from "@/lib/prayerListSlot";
import { markContemplationSideDone } from "@/lib/contemplationSideDone";
import { readRecentCompletion, clearRecentCompletion } from "@/lib/recentCompletion";
import { logCelebrationEvent } from "@/lib/celebrationDebugLog";
import { swellHaptic } from "@/lib/swellHaptic";
import { playRoutineCompleteSwell } from "@/lib/amenFeedback";
import { isNativeShell } from "@/lib/isNativeShell";
import { isFirstOpen } from "@/lib/firstOpen";
import { shouldShowFirstOpenOnboarding, isFirstOpenOnboardingActive, FIRST_OPEN_ONBOARDING_CLOSED_EVENT } from "@/lib/firstOpenOnboarding";
import { SilenceLadderCard } from "@/components/SilenceLadderCard";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";

const PUBLICATION_NAME: Record<Exclude<ReflectionSource, "none">, string> = {
  fdd: "Forward Day by Day",
  ssje: "Brother, Give Us a Word",
  cac: "CAC Daily Meditation",
  vts: "VTS Dean's Commentary",
};

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
// The most minutes a single contemplation SESSION should default to. The daily
// minutes goal (which can be 60+) is a whole-day accumulation target, never a
// per-sit length — so any card that launches the timer with a pre-filled length
// clamps to this. Users can still choose longer explicitly in the timer.
const SESSION_SIT_CAP = 20;
// Shared card outline — matches the home "+" FAB ring (dashboard.tsx), so every
// home card reads with the same soft sage edge rather than per-practice tints.
const CARD_BORDER = "rgba(200,212,192,0.35)";

// Subtle per-card lightness ramp for the routine card stack: a touch lighter at
// the top, easing a touch darker toward the bottom (tint 0 → 1). Stays in the
// frosted-green family; tint 0.4 ≈ the prior flat fill, so a lone card is
// unchanged. Keeps the frosted blur (applied separately by the card).
function cardTintBg(tint: number): string {
  const t = Math.max(0, Math.min(1, tint));
  const r = Math.round(26 - 16 * t);
  const g = Math.round(52 - 24 * t);
  const b = Math.round(36 - 18 * t);
  const a = (0.27 + 0.09 * t).toFixed(3);
  return `rgba(${r},${g},${b},${a})`;
}

// Weekly-grid row fill: ONE Phoebe-green family, stepping lightness across rows
// so each practice reads as a distinct SHADE of green (lighter at top → deeper
// toward the bottom). Returned at low opacity by the caller so the frosted leaf
// backdrop bleeds through and varies each bar's brightness organically.
function weeklyRowGreen(i: number, n: number): string {
  const t = n <= 1 ? 0.5 : i / (n - 1);
  const hue = 145, sat = 0.44, light = 0.58 - 0.28 * t;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = light - c / 2;
  const to = (v: number) => Math.round((v + m) * 255);
  return `${to(r)},${to(g)},${to(b)}`;
}

// Practice-card palette: a calm, LOW-CHROMA cool ramp that walks the hue from
// the Phoebe forest green through teal/blue to a muted violet across the day's
// cards, by order. Every hue is cool, so it stays in harmony with the dark green
// ground; saturation eases DOWN toward purple, so the violet end reads as a
// whisper rather than a pop (saturated purple/teal is what made the cards shout).
// Returns an "r,g,b" string (the format the cards' rgba() helpers expect).
// Exported so other home surfaces (e.g. the Prayer List carousel) can shade
// their cards along the SAME green→violet ramp and read as one family.
export function rhythmGradientRgb(i: number, n: number): string {
  const t = n <= 1 ? 0 : i / (n - 1);
  // A calm MONOCHROME green ramp — one held hue, easing from a lighter green to a
  // darker green across the day's cards, so the set reads as one family that
  // rests naturally on the dark forest background. No teal/violet drift.
  const hue = 146;                      // Phoebe forest green, held constant
  const sat = 0.36 - 0.08 * t;          // chroma eases gently toward the darker end
  const light = 0.50 - 0.26 * t;        // a notch DARKER overall: muted sage (top) → deep forest (bottom), low card-to-card variance
  // HSL → RGB.
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = light - c / 2;
  const to = (v: number) => Math.round((v + m) * 255);
  return `${to(r)},${to(g)},${to(b)}`;
}

// A card subtitle that cycles between a few values, fading the old one DOWN and
// out and the new one UP and in (a gentle vertical crossfade) — never a hard
// switch. It's ONE truncating <p> animated with opacity + a tiny translateY:
// transforms don't affect layout, so the text can never grow wider/taller than
// its column and the card's pill never moves (the bug the plain swap fixed).
function CardSubtitleCycle({ values, className, style }: { values: string[]; className?: string; style?: CSSProperties }) {
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (values.length <= 1) return;
    let swap: ReturnType<typeof setTimeout> | undefined;
    const t = setInterval(() => {
      setShown(false); // fade the current value down and out…
      swap = setTimeout(() => {
        setIdx((i) => (i + 1) % values.length); // …swap while hidden…
        setShown(true); // …then fade the next value up and in.
      }, 260);
    }, 5000);
    return () => { clearInterval(t); if (swap) clearTimeout(swap); };
  }, [values.length]);
  const current = values[idx % values.length] ?? "";
  return (
    <p
      className={className}
      style={{
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        opacity: shown ? 1 : 0,
        // Pure crossfade — no vertical movement.
        transition: "opacity 0.26s ease",
        ...style,
      }}
    >
      {current}
    </p>
  );
}

// Streak card — the unified days-of-prayer run, with a dot for each of the last
// 14 days (filled = kept, ringed = today), plus the "others in your gardens"
// rail. Same /api/me/prayer-days the rhythm hook reads (React Query dedupes).
function StreakCard() {
  const { t } = useTranslation();
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  })();
  const { data } = useQuery<{ days: Array<{ ymd: string; kept: boolean }>; streak: number; last7: number; keptToday: boolean }>({
    queryKey: ["/api/me/prayer-days", tz],
    queryFn: () => apiRequest("GET", `/api/me/prayer-days?tz=${encodeURIComponent(tz)}`),
    staleTime: 60_000,
  });
  const { data: gardenWeek } = useQuery<{ count: number; people: Array<{ id: number; name: string | null; avatarUrl: string | null }> }>({
    queryKey: ["/api/me/garden-week"],
    queryFn: () => apiRequest("GET", "/api/me/garden-week"),
    staleTime: 5 * 60_000,
  });
  const gardenWeekCount = gardenWeek?.count ?? 0;
  const gardenFaces = (gardenWeek?.people ?? []).slice(0, 6);
  const gardenOverflow = Math.max(0, gardenWeekCount - gardenFaces.length);
  // (The 30-day commitment band, its day-30 review moment, and the shared
  // rhythm-party "with Sarah & Marcus" band are removed per owner — choosing a
  // rhythm just sets it; the card is the plain streak again.)
  // Guard the SHAPE, not just presence: a well-formed-but-partial 200 (shape
  // drift, a captive-portal HTML body that happened to parse, `{}`) would leave
  // `days` undefined and `days.map` below would throw — and because this card
  // renders on the home, that throw takes the WHOLE home to the error boundary.
  if (!data || !Array.isArray(data.days)) return null;
  const { days } = data;
  const streak = typeof data.streak === "number" ? data.streak : 0;
  const last7 = typeof data.last7 === "number" ? data.last7 : 0;
  const GREEN = "46,107,64";
  const GREEN_BRIGHT = "110,180,130";

  return (
    <div
      className="relative flex rounded-2xl overflow-hidden mt-6"
      style={{ background: "rgba(22,46,32, 0.330)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid rgba(${GREEN},0.26)` }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${GREEN_BRIGHT},0.7)` }} />
      <div className="flex-1 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl flex-shrink-0">🔥</span>
          <p className="flex-1 min-w-0 leading-none" style={{ color: WARM, fontFamily: FONT, fontSize: 26, fontWeight: 700 }}>
            {streak}
            <span className="text-[13px] font-semibold ml-2" style={{ color: SAGE }}>
              {t("rhythm.streak_unit", { count: streak, defaultValue: streak === 1 ? "day rhythm" : "day rhythm" })}
            </span>
          </p>
          <p className="text-[12px] text-right flex-shrink-0" style={{ color: SAGE, fontFamily: FONT }}>
            {t("rhythm.last7_line", { last7, defaultValue: `Kept ${last7} of the last 7 days` })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-3.5">
          {days.map((d, i) => {
            const isToday = i === days.length - 1;
            return (
              <span
                key={d.ymd}
                title={d.ymd}
                className="flex-1 rounded-full"
                style={{
                  height: 8,
                  maxWidth: 22,
                  background: d.kept ? `rgba(${GREEN_BRIGHT},0.85)` : "rgba(143,175,150,0.16)",
                  border: isToday ? "1.5px solid rgba(240,237,230,0.75)" : "1px solid transparent",
                }}
              />
            );
          })}
        </div>
        <p className="text-[10.5px] mt-1.5" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>
          {t("rhythm.last14_label", { defaultValue: "Last 14 days" })}
        </p>
        {gardenWeekCount > 0 && (
          <div className="mt-3 pt-3 flex items-center gap-2.5" style={{ borderTop: "1px solid rgba(46,107,64,0.18)" }}>
            {gardenFaces.length > 0 && (
              <div className="flex items-center -space-x-2 flex-shrink-0">
                {gardenFaces.map((p) => (
                  p.avatarUrl ? (
                    <img key={p.id} src={p.avatarUrl} alt={p.name ?? ""} className="w-6 h-6 rounded-full object-cover" style={{ border: "1.5px solid #0C1F12" }} />
                  ) : (
                    <div key={p.id} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px solid #0C1F12" }}>
                      {(p.name ?? "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase().slice(0, 2) || "?"}
                    </div>
                  )
                ))}
                {gardenOverflow > 0 && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: "rgba(46,107,64,0.35)", color: "#C8D4C0", border: "1.5px solid #0C1F12" }}>
                    +{gardenOverflow}
                  </div>
                )}
              </div>
            )}
            <p className="text-[12px]" style={{ color: SAGE, fontFamily: FONT, fontStyle: "italic" }}>
              {t("rhythm.garden_week_line", { count: gardenWeekCount, defaultValue: `${gardenWeekCount} ${gardenWeekCount === 1 ? "other in your gardens has" : "others in your gardens have"} prayed this week` })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Weekly practice grid — one row per practice the user keeps, seven dots
// across (the days of the week, today last). A filled dot in the practice's
// own accent color = completed that day; faint = missed; today's column is
// ringed. Echoes the old slideshow's "two rows of seven dots" card, but a row
// per practice. Data: /api/me/practice-week (one unified matrix); which rows
// to render mirrors the practice cards above (four core + active extras).
export function WeeklyGridCard() {
  const { t } = useTranslation();
  const { morningActive, eveningActive, silenceActive, reflectActive, listeningActive, readingActive, podcastsActive, walkActive, examenActive, cobreatheActive, prayerListActive, complineActive } = useRhythmState();
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  })();
  type Day = { ymd: string; morning: boolean; evening: boolean; compline: boolean; contemplation: boolean; reflection: boolean; listening: boolean; examen: boolean; reading: boolean; podcasts: boolean; walk: boolean; cobreathe: boolean; prayerList: boolean };
  const { data } = useQuery<{ days: Day[] }>({
    queryKey: ["/api/me/practice-week", tz],
    queryFn: () => apiRequest("GET", "/api/me/practice-week"),
    staleTime: 60_000,
  });
  // Re-render when a custom practice is kept/edited so its weekly row updates live
  // (custom completion lives in localStorage, not the practice-week query).
  const [, forceTick] = useState(0);
  useEffect(() => {
    const bump = () => forceTick((n) => n + 1);
    window.addEventListener(CUSTOM_DONE_EVENT, bump);
    window.addEventListener(CUSTOM_ANCHORS_EVENT, bump);
    return () => { window.removeEventListener(CUSTOM_DONE_EVENT, bump); window.removeEventListener(CUSTOM_ANCHORS_EVENT, bump); };
  }, []);
  if (!data || !data.days?.length) return null;
  const { days } = data;

  // Each row carries its own per-day predicate, so built-in practices (from the
  // practice-week matrix) and the user's CUSTOM anchors (from local history) live
  // in one list — a pill line for EVERY practice.
  // Green only (owner). Kept as a list so custom practices still vary in
  // WEIGHT rather than hue.
  const CUSTOM_PALETTE = ["46,107,64", "60,124,80", "40,96,58", "72,140,94", "52,116,72", "84,150,104"];
  const rows: Array<{ id: string; emoji: string; label: string; rgb: string; doneFor: (d: Day) => boolean }> = [
    ...(morningActive ? [{ id: "morning", emoji: "🌅", label: t("rhythm.row_morning", { defaultValue: "Morning" }), rgb: "46,107,64", doneFor: (d: Day) => !!d.morning }] : []),
    // Reflection rides right after Morning Prayer — it's the second beat of the
    // day — and stays ahead of Contemplation, matching the card order below.
    ...(reflectActive ? [{ id: "reflection", emoji: "📖", label: t("rhythm.row_reflection", { defaultValue: "Reflection" }), rgb: "96,141,209", doneFor: (d: Day) => !!d.reflection }] : []),
    ...(silenceActive ? [{ id: "contemplation", emoji: "🕯️", label: t("rhythm.row_contemplation", { defaultValue: "Contemplation" }), rgb: "62,124,122", doneFor: (d: Day) => !!d.contemplation }] : []),
    ...(cobreatheActive ? [{ id: "cobreathe", emoji: "🌍", label: t("rhythm.row_cobreathe", { defaultValue: "Creation Prayer" }), rgb: "62,124,122", doneFor: (d: Day) => !!d.cobreathe }] : []),
    ...(listeningActive ? [{ id: "listening", emoji: "🎵", label: t("rhythm.row_listening", { defaultValue: "Audio Divina" }), rgb: "108,140,180", doneFor: (d: Day) => !!d.listening }] : []),
    ...(readingActive ? [{ id: "reading", emoji: "📚", label: t("rhythm.row_reading", { defaultValue: "Reading" }), rgb: "150,140,110", doneFor: (d: Day) => !!d.reading }] : []),
    ...(podcastsActive ? [{ id: "podcasts", emoji: "🎙️", label: t("rhythm.row_podcasts", { defaultValue: "Podcasts" }), rgb: "150,120,150", doneFor: (d: Day) => !!d.podcasts }] : []),
    ...(walkActive ? [{ id: "walk", emoji: "🚶", label: t("rhythm.row_walk", { defaultValue: "Contemplative Walk" }), rgb: "120,160,120", doneFor: (d: Day) => !!d.walk }] : []),
    ...(eveningActive ? [{ id: "evening", emoji: "🌙", label: t("rhythm.row_evening", { defaultValue: "Evening" }), rgb: "46,107,64", doneFor: (d: Day) => !!d.evening }] : []),
    ...(prayerListActive ? [{ id: "prayer-list", emoji: "🕊️", label: t("rhythm.row_prayer_list", { defaultValue: "My Prayer List" }), rgb: "96,140,180", doneFor: (d: Day) => !!d.prayerList }] : []),
    // Compline closes the day — its own row, reading its own server flag
    // (never d.evening; the two offices are tracked separately end to end).
    ...(complineActive ? [{ id: "compline", emoji: "🌙", label: t("rhythm.row_compline", { defaultValue: "Compline" }), rgb: "90,100,140", doneFor: (d: Day) => !!d.compline }] : []),
    ...(examenActive ? [{ id: "examen", emoji: "🌗", label: t("rhythm.row_examen", { defaultValue: "Examen" }), rgb: "150,120,180", doneFor: (d: Day) => !!d.examen }] : []),
    // The user's own custom anchors — one row each, filled from local per-day
    // history (it fills in going forward; no backfill before this shipped).
    ...getCustomAnchors().map((a, i) => {
      const doneSet = getCustomDoneDays(a.id);
      return { id: `custom-${a.id}`, emoji: a.emoji || "🌿", label: a.title, rgb: CUSTOM_PALETTE[i % CUSTOM_PALETTE.length], doneFor: (d: Day) => doneSet.has(d.ymd) };
    }),
  ];

  // Single-letter weekday initials under each column (noon avoids any tz/DST
  // edge rolling the day). Today is the last column.
  const dayInitials = days.map((d) => {
    const wd = new Date(`${d.ymd}T12:00:00`).getDay();
    // A malformed d.ymd yields NaN → the letters lookup would be undefined and
    // the header column blanks. Fall back to an empty string rather than render
    // "undefined".
    return Number.isNaN(wd) ? "" : ["S", "M", "T", "W", "T", "F", "S"][wd];
  });
  const LABEL_W = 104;

  return (
    <div
      className="rounded-2xl mt-3 px-4 py-4"
      style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(200,212,192,0.13)" }}
    >
      {/* The "Weekly progress" label now lives as a section header ABOVE this
          card (in DailyProgressBody) rather than inside it. */}
      {/* One shared 7-column grid for the header and every row, so the
          day-of-week initials sit exactly over their dots. */}
      {(() => {
        const COLS = `${LABEL_W}px repeat(7, 1fr)`;
        return (
          <>
            {/* Day-initial header. */}
            <div className="mb-3" style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
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
            <div className="flex flex-col" style={{ gap: 13 }}>
              {rows.map((row, ri) => (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                  <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                    <span className="text-[13px] leading-none flex-shrink-0">{row.emoji}</span>
                    <span className="text-[12.5px] font-medium truncate" style={{ color: WARM, fontFamily: FONT }}>{row.label}</span>
                  </div>
                  {days.map((d, i) => {
                    const done = row.doneFor(d);
                    const isToday = i === days.length - 1;
                    // Wide capsule pills, short and filling the column.
                    return (
                      <span key={d.ymd} style={{ padding: "0 3px" }}>
                        <span
                          title={`${row.label} · ${d.ymd}`}
                          style={{
                            display: "block",
                            height: 8,
                            borderRadius: 999,
                            background: done ? `rgba(${weeklyRowGreen(ri, rows.length)},0.55)` : "rgba(143,175,150,0.1)",
                            border: isToday ? "1.5px solid rgba(240,237,230,0.6)" : "1px solid transparent",
                          }}
                        />
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}

// One home-style practice card: a colored left accent bar, the practice, and
// its state today (a "kept" check or a CTA to begin).
export function PracticeCard({
  href, emoji, title, blurb, blurbCycle, cta, done, rgb, later, laterLabel, progress, alwaysShowProgress, hero, eyebrow, onClick, doneCta, pulse, pulseOnLoad = true, tint = 0.4, blurDelay, celebrate, onCheckClick,
}: {
  href: string; emoji: string; title: string; blurb: string; cta: string; done: boolean; rgb: string;
  /** Small uppercase label ABOVE the title in the hero layout — mirrors the
   *  office hero's "Book of Common Prayer" eyebrow. Hero-only; ignored on the
   *  compact row. */
  eyebrow?: string;
  /** Position in the routine card stack (0 = top/lightest → 1 = bottom/darkest),
   *  driving the subtle card-background lightness ramp. */
  tint?: number;
  later?: boolean; laterLabel?: string;
  progress?: { current: number; goal: number };
  /** Keep the progress bar visible even once the card is DONE — for a
   *  goal that spans the whole practice (a novena's day count), not just
   *  today (contemplation minutes), where the bar going away on completion
   *  would hide real information ("day 3 of 9") rather than just noise. */
  alwaysShowProgress?: boolean;
  /** When a DONE card should still invite action (e.g. contemplation can keep
   *  going past its goal), this CTA replaces the plain ✓ and the card stays
   *  tappable to `href`/`onClick`. */
  doneCta?: string;
  /** When set, the card runs this instead of navigating to `href` — e.g. the
   *  CAC reflection opens the meditation directly in the in-app browser. */
  onClick?: () => void;
  /** When set (and not done), the subtitle cross-fades between these values
   *  instead of showing the static blurb. */
  blurbCycle?: string[];
  /** Render the larger "what's next" hero layout — big emoji + title and a
   *  prominent CTA button. Used for the first card under Next. */
  hero?: boolean;
  /** Pulse the border color (like a today's-event card) to draw the eye to the
   *  next thing to do. The caller decides when (with its own guards). */
  pulse?: boolean;
  /** Gate the one-shot outline load-pulse so it only runs after the splash has
   *  faded (the cascade shouldn't fire behind the splash). */
  pulseOnLoad?: boolean;
  /** When set, the frosted backdrop blur RAMPS IN (0 → full) starting at this
   *  delay (seconds) — the card's cascade landing time — instead of the static
   *  blur that WebKit otherwise repaints for every card at once after the
   *  cascade settles. Each card's blur then arrives gradually as it lands. */
  blurDelay?: number;
  /** Play the just-completed moment on THIS card: the action pill drops away
   *  and a ✓ rises in its place (hero: the CTA button becomes "Completed"),
   *  and the border pulses to say "this one is done and on its way to Done".
   *  The card is rendered with done=true; this only drives the transition. */
  celebrate?: boolean;
  /** When set, a DONE card's plain ✓ (not the doneCta pill — that one stays
   *  tappable to keep going) becomes its own tap target: stops the click from
   *  reaching the card's own href/onClick and calls this instead, so tapping
   *  the check anywhere else on the card still opens the practice as normal. */
  onCheckClick?: () => void;
}) {
  const waiting = !!later && !done;
  // Hold the pre-completion pill for a beat so the swap is something the user
  // SEES, rather than the card already wearing its ✓ when the home paints.
  const [celebrated, setCelebrated] = useState(!celebrate);
  useEffect(() => {
    if (!celebrate) { setCelebrated(true); return; }
    setCelebrated(false);
    const id = window.setTimeout(() => setCelebrated(true), 420);
    return () => window.clearTimeout(id);
  }, [celebrate]);
  // While celebrating and still showing the old pill, render the card as if it
  // weren't done yet — that's the state we're animating OUT of.
  const showPreDone = !!celebrate && !celebrated;
  // A progress bar (contemplation minutes, a novena's day count) used to just
  // PAINT at its final value on mount — a practice finishes on its own page,
  // so by the time the walk back to home renders this card, the fill is
  // already sitting there full with nothing to see. Reuse the SAME
  // showPreDone/celebrated beat the checkmark swap uses: render at 0% while
  // the pre-completion pill is still showing, then — the instant it flips to
  // the ✓ (i.e. once the user is actually looking at the home screen) — jump
  // to the true value, and the bar's existing `transition: width 0.3s`
  // animates the fill sweeping in right then, not before.
  const progressFillPct = (p: { current: number; goal: number }) =>
    showPreDone ? 0 : Math.min(100, Math.round((p.current / p.goal) * 100));
  // Gradual per-card blur-in. When blurDelay is provided we drop the static
  // backdrop-filter from `style` and animate it (both unprefixed + -webkit- so
  // it works across iOS 15.x) from blur(0) → full. It stays at 0 while the card
  // is still behind the opening splash (pulseOnLoad === splashCleared is false),
  // then — when the splash clears and the card cascades up — ramps in starting
  // at its landing time, so each card's frosted backdrop arrives as it settles
  // instead of every card's blur popping in at once after the cascade.
  const blurOn = blurDelay != null;
  const blurTarget = blurOn ? (pulseOnLoad ? "blur(11.34px)" : "blur(0px)") : "blur(11.34px)";
  const blurInitial = blurOn ? { backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)" } : undefined;
  const blurAnimate = blurOn ? { backdropFilter: blurTarget, WebkitBackdropFilter: blurTarget } : undefined;
  const blurTransition = blurOn ? { backdropFilter: { delay: blurDelay, duration: 0.7, ease: "easeOut" as const }, WebkitBackdropFilter: { delay: blurDelay, duration: 0.7, ease: "easeOut" as const } } : undefined;
  const staticBlur = blurOn ? {} : { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" };
  // Cycle the subtitle whenever a cycle is supplied — including on a DONE card
  // (so the reflection keeps flipping its publication name ↔ today's title even
  // after it's read). Cards that shouldn't cycle when done simply pass no cycle.
  const useCycle = !!blurbCycle && blurbCycle.length > 1;

  // Hero layout — a bigger, more prominent card for the next anchor, whatever
  // practice it happens to be.
  if (hero) {
    // The CTA spans the FULL width of the card (matching the width of the cards
    // below), sitting under the title rather than as a right-aligned pill.
    const heroCta = waiting ? (
      <div className="mt-4 w-full text-center rounded-full text-[14px] font-medium py-3" style={{ background: "transparent", color: "rgba(182,210,188,0.5)", border: "1px solid rgba(143,175,150,0.22)", fontFamily: FONT }}>
        {laterLabel}
      </div>
    ) : celebrate ? (
      // Just completed: the CTA drops away and "Completed ✓" rises in its
      // place. mode="wait" so the old label is gone before the new one lands —
      // a fade DOWN then UP, not a cross-dissolve.
      <div className="mt-4 relative" style={{ height: 48 }}>
        <AnimatePresence mode="wait" initial={false}>
          {showPreDone ? (
            <motion.div
              key="hero-cta"
              initial={{ opacity: 1, y: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.22, ease: "easeIn" }}
              className="absolute inset-0 w-full text-center rounded-full text-[15px] font-semibold flex items-center justify-center"
              style={{ background: `rgba(${rgb},0.85)`, color: WARM, fontFamily: FONT }}
            >
              {cta} <span aria-hidden className="ml-1">→</span>
            </motion.div>
          ) : (
            <motion.div
              key="hero-done"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 w-full text-center rounded-full text-[15px] font-semibold flex items-center justify-center gap-2"
              style={{ background: `rgba(${rgb},0.28)`, color: WARM, border: `1px solid rgba(${rgb},0.55)`, fontFamily: FONT }}
            >
              <span aria-hidden>✓</span>Completed
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ) : (
      <div className="mt-4 w-full text-center rounded-full text-[15px] font-semibold py-3" style={{ background: `rgba(${rgb},0.85)`, color: WARM, fontFamily: FONT }}>
        {cta} <span aria-hidden className="ml-1">→</span>
      </div>
    );
    const heroRow = (
      <motion.div
        className={`${pulseOnLoad && !celebrate ? "phoebe-card-outline-pulse" : ""} relative flex rounded-3xl overflow-hidden ${waiting ? "" : "transition-opacity hover:opacity-95 active:scale-[0.99]"}`}
        style={{ background: cardTintBg(tint), backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid ${CARD_BORDER}`, opacity: waiting ? 0.8 : 1 }}
        animate={celebrate ? { borderColor: [CARD_BORDER, `rgba(${rgb},0.95)`, CARD_BORDER] } : undefined}
        transition={celebrate ? { borderColor: { duration: 1.25, repeat: Infinity, ease: "easeInOut" } } : undefined}
      >
        <div className="w-1.5 flex-shrink-0" style={{ background: `rgba(${rgb},${waiting ? 0.4 : 0.72})` }} />
        <div className="flex-1 px-5 py-5">
          {/* Emoji sits to the RIGHT of the title, never as a leading icon
              column (owner). */}
          <div className="flex items-start gap-3.5">
            <div className="flex-1 min-w-0 overflow-hidden">
              {eyebrow ? (
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest truncate"
                  style={{ color: "rgba(143,175,150,0.55)", margin: 0, marginBottom: 4, fontFamily: FONT }}
                >
                  {eyebrow}
                </p>
              ) : null}
              <p className="text-[22px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
                {title}{emoji ? <span className="ml-2" aria-hidden>{emoji}</span> : null}
              </p>
              {useCycle
                ? <CardSubtitleCycle values={blurbCycle!} className="text-[13.5px] mt-1 leading-snug" style={{ color: SAGE }} />
                : <p className="text-[13.5px] mt-1 leading-snug" style={{ color: SAGE }}>{blurb}</p>}
            </div>
          </div>
          {progress && progress.goal > 0 && (!done || alwaysShowProgress) && (
            <div className="mt-3.5 rounded-full overflow-hidden" style={{ height: 5, background: "rgba(143,175,150,0.16)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${progressFillPct(progress)}%`, background: `rgba(${rgb},0.85)`, transition: "width 0.3s" }}
              />
            </div>
          )}
          {heroCta}
        </div>
      </motion.div>
    );
    if (waiting) return heroRow;
    // A plain div (not a native <button>) for the onClick path — buttons
    // establish their own layout and don't let the flex middle shrink, which
    // shoved the pill off the right edge. role/tabIndex keep it accessible.
    if (onClick) return (
      <div role="button" tabIndex={0} onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
        className="block w-full cursor-pointer">{heroRow}</div>
    );
    return <Link href={href} className="block">{heroRow}</Link>;
  }

  // Just-completed compact card: the action pill fades DOWN and out, then the
  // ✓ rises up into its slot. The slot itself shrinks from the CTA's width
  // down to the ✓'s natural (much narrower) width as part of the swap —
  // giving the check a fixed wide box made it look like an oversized blank
  // pill instead of the same small ✓ the DONE state uses elsewhere.
  const pill = celebrate ? (
    <motion.span
      className="flex-shrink-0 relative inline-block overflow-hidden"
      style={{ height: 28 }}
      animate={{ width: showPreDone ? 84 : 32 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {showPreDone ? (
          <motion.span
            key="cta"
            initial={{ opacity: 1, y: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 9 }}
            transition={{ duration: 0.2, ease: "easeIn" }}
            className="absolute inset-0 rounded-full text-[12px] font-semibold flex items-center justify-center whitespace-nowrap"
            style={{ background: `rgba(${rgb},0.85)`, color: WARM }}
          >
            {cta} <span aria-hidden className="ml-0.5">→</span>
          </motion.span>
        ) : (
          <motion.span
            key="check"
            initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="absolute inset-0 rounded-full text-[12px] font-semibold flex items-center justify-center"
            style={{ background: `rgba(${rgb},0.18)`, color: "rgba(240,237,230,0.85)", border: `1px solid rgba(${rgb},0.45)` }}
          >✓</motion.span>
        )}
      </AnimatePresence>
    </motion.span>
  ) : done ? (
    doneCta ? (
      // Done, but still invites more (e.g. keep sitting past the contemplation
      // goal). A "✓ Sit again →" pill — the card stays tappable to its href.
      <span
        className="flex-shrink-0 inline-flex items-center gap-1 rounded-full text-[12px] font-semibold px-3.5 py-1.5 text-center"
        style={{ background: `rgba(${rgb},0.85)`, color: WARM }}
      >
        <span aria-hidden style={{ opacity: 0.85 }}>✓</span> {doneCta} <span aria-hidden>→</span>
      </span>
    ) : (
      <span
        role={onCheckClick ? "button" : undefined}
        tabIndex={onCheckClick ? 0 : undefined}
        onClick={onCheckClick ? (e) => { e.preventDefault(); e.stopPropagation(); onCheckClick(); } : undefined}
        onKeyDown={onCheckClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onCheckClick(); } } : undefined}
        className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
        style={{ background: `rgba(${rgb},0.18)`, color: "rgba(240,237,230,0.85)", border: `1px solid rgba(${rgb},0.45)`, cursor: onCheckClick ? "pointer" : undefined }}
      >✓</span>
    )
  ) : waiting ? (
    <span
      className="flex-shrink-0 rounded-full text-[12px] font-medium px-3.5 py-1.5 text-center"
      style={{ minWidth: 84, background: "transparent", color: "rgba(182,210,188,0.5)", border: "1px solid rgba(143,175,150,0.22)" }}
    >{laterLabel}</span>
  ) : (
    <span className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5 text-center" style={{ minWidth: 84, background: `rgba(${rgb},0.85)`, color: WARM }}>
      {cta} <span aria-hidden>→</span>
    </span>
  );

  const restBorder = CARD_BORDER;
  const row = (
    <motion.div
      className={`${pulse || !pulseOnLoad ? "" : "phoebe-card-outline-pulse"} relative flex rounded-3xl overflow-hidden ${waiting ? "" : "transition-opacity hover:opacity-90 active:scale-[0.99]"}`}
      style={{ background: cardTintBg(tint), ...staticBlur, border: `1px solid ${restBorder}`, opacity: waiting ? 0.72 : 1 }}
      initial={blurInitial}
      animate={
        // A just-completed card gets a BRIGHTER, quicker border pulse than the
        // ordinary "next up" pulse — it's saying "this one is done", and it
        // rides along as the card moves from Next down into Done.
        celebrate
          ? { borderColor: [restBorder, `rgba(${rgb},0.95)`, restBorder], ...(blurAnimate ?? {}) }
          : pulse
            ? { borderColor: [restBorder, `rgba(${rgb},0.55)`, restBorder], ...(blurAnimate ?? {}) }
            : blurAnimate
      }
      transition={
        celebrate
          ? { borderColor: { duration: 1.25, repeat: Infinity, ease: "easeInOut" }, ...(blurTransition ?? {}) }
          : pulse
            ? { borderColor: { duration: 2.2, repeat: Infinity, ease: "easeInOut" }, ...(blurTransition ?? {}) }
            : blurTransition
      }
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${rgb},${waiting ? 0.4 : 0.7})` }} />
      <div className="flex-1 min-w-0 px-4 py-3.5">
        <div className="flex items-center gap-3">
          {/* Compact rows keep the emoji as a LEADING icon on the left (owner)
              — only the HERO layout moves it to the right of the title. */}
          {emoji ? (
            <span className="text-[15px] leading-none flex-shrink-0" aria-hidden>{emoji}</span>
          ) : null}
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: WARM, fontFamily: FONT }}>
              {title}
            </p>
            {useCycle
              ? <CardSubtitleCycle values={blurbCycle!} className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: SAGE }} />
              : blurb ? <p className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: SAGE }}>{blurb}</p> : null}
          </div>
          {pill}
        </div>
        {/* Progress bar spans the full width below the row — so "Begin" sits
            above it rather than beside it. Hidden once the card is DONE (a full
            bar under a ✓ is just noise). */}
        {progress && progress.goal > 0 && (!done || alwaysShowProgress) && (
          <div className="mt-3 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(143,175,150,0.16)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${progressFillPct(progress)}%`, background: `rgba(${rgb},0.85)`, transition: "width 0.3s" }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );

  // A "Later" card is intentionally inert (e.g. Evening before 3 PM). Mark it
  // so it doesn't read as a tappable card that silently does nothing — a
  // not-allowed cursor on desktop and aria-disabled for assistive tech.
  if (waiting) return (
    <div aria-disabled="true" title={laterLabel ? `${title} — ${laterLabel.toLowerCase()}` : undefined} style={{ cursor: "not-allowed" }}>
      {row}
    </div>
  );
  // Plain div (not a native <button>) so the flex middle can shrink and the
  // pill stays put; role/tabIndex/keydown keep it accessible.
  if (onClick) return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="block w-full cursor-pointer">{row}</div>
  );
  return <Link href={href} className="block">{row}</Link>;
}

// Built-in OptionalPractices whose card reuses LogSheet via a sentinel
// logAnchorId (not a real custom anchor) — see the "walk" comment further
// down for why. One entry per sentinel; title is a function since it needs
// the caller's `t`.
const SENTINEL_PRACTICES: Partial<Record<string, { title: (t: (k: string, o?: Record<string, unknown>) => string) => string; emoji: string }>> = {
  walk: { title: (t) => t("rhythm.card_walk", { defaultValue: "Contemplative Walk" }), emoji: "🚶" },
};

export function DailyProgressBody({ showStreak = true, showDone, renderOfficeHero, leadCard, maxUpcoming, onRemainingCount, mountTag = "unlabeled" }: { showStreak?: boolean; showDone?: boolean; renderOfficeHero?: (side: "morning" | "evening") => ReactNode; leadCard?: ReactNode; maxUpcoming?: number; onRemainingCount?: (count: number) => void; /** Diagnostic only — see lib/celebrationDebugLog.ts. Identifies which of dashboard.tsx's mutually-exclusive render branches mounted this instance. */ mountTag?: string }) {
  const { t } = useTranslation();
  // ── The just-completed moment ────────────────────────────────────────────
  // Coming back from a practice, the card is already Done in state — so
  // without this it would simply be sitting in the Done list, with nothing to
  // watch. Instead: PIN it in Next wearing its old action pill, swap that pill
  // for a ✓, hold a beat, then let it drop into Done while the list closes up.
  // Read once at mount and consumed immediately, so the moment plays exactly
  // once per completion and never replays on a later visit.
  // Diagnostic-only instance id — see lib/celebrationDebugLog.ts. Lets the
  // log distinguish two DailyProgressBody mounts (e.g. a remount when
  // allHabitsDone flips) firing close together, even under the same tag.
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 8));
  const [celebrateKey] = useState<string | null>(() => {
    // readRecentCompletion's own default (60s) is sized for an in-app
    // office close, not a reflection — CAC/FDD/SSJE mark themselves read
    // the INSTANT the card is tapped (before the external site even opens,
    // see the `mark()` call below), so the stamp's clock starts ticking
    // before the person has read a word. A real newsletter read easily
    // runs several minutes; at 60s the stamp had always expired by the time
    // they walked back, so the card just appeared already in Done with no
    // moment to see — which is what was reported. 20 minutes comfortably
    // covers a slow read while still expiring long before a LATER, unrelated
    // visit could accidentally replay it.
    const recent = readRecentCompletion(20 * 60_000);
    if (recent) clearRecentCompletion();
    // Owner: "make sure there is only one time animation for each
    // completion, again sometimes it will do it twice." Log every mount's
    // consume attempt so a repeat can be diagnosed from the trail instead
    // of guessed at — see lib/celebrationDebugLog.ts.
    logCelebrationEvent({
      instanceId: instanceIdRef.current,
      mountTag,
      stampFound: !!recent,
      stampKey: recent?.key ?? null,
      stampAgeMs: recent ? Date.now() - recent.at : null,
      celebrating: !!recent,
    });
    return recent?.key ?? null;
  });
  // Phase 1: pinned in Next (pill → ✓). Phase 2: released into Done.
  const [pinnedInNext, setPinnedInNext] = useState<boolean>(!!celebrateKey);
  // The border keeps pulsing for a while AFTER it lands in Done, so the eye can
  // follow the card across the move.
  const [celebrating, setCelebrating] = useState<boolean>(!!celebrateKey);
  useEffect(() => {
    if (!celebrateKey) return;
    const release = window.setTimeout(() => setPinnedInNext(false), 2000);
    const stop = window.setTimeout(() => setCelebrating(false), 5000);
    return () => { window.clearTimeout(release); window.clearTimeout(stop); };
  }, [celebrateKey]);
  const { ready, morningDone, reflectDone, eveningDone, eveningActive, morningActive, silenceActive, morningContemplationActive, eveningContemplationActive, morningContemplationDone, eveningContemplationDone, reflectActive, reflections, prayerKind, contemplationMin, contemplationGoalMin, contemplationStyle, contemplationLogMethod, examenActive, listeningActive, readingActive, podcastsActive, walkActive, cobreatheActive, examenDone, listeningDone, readingDone, podcastsDone, walkDone, cobreatheDone, customAnchors, novenaActive, novenaDone, novenaReplacesMorning, novenaReplacesEvening, novena, complineActive, complineDone, intentionsTotalCount, intentionsPrayedCount } = useRhythmState();
  // On the common (fast, cached) path `ready` flips true well under a beat, so
  // we stay silent rather than flash a skeleton nobody needed. But the
  // rhythm queries this waits on carry NO offline/timeout fallback for a
  // signed-in user (unlike most of this app's other gates), and the persisted
  // query cache is deliberately busted once a day (a new localDayBuster) — so
  // the FIRST home load of the day, on a slow connection, could leave this
  // whole section returning null (nothing at all) for many seconds, reading
  // as broken rather than loading. Show a real skeleton once `ready` has
  // actually taken a moment, so a slow load is visibly "still coming" instead
  // of silently absent.
  const [showLoadSkeleton, setShowLoadSkeleton] = useState(false);
  useEffect(() => {
    if (ready) { setShowLoadSkeleton(false); return; }
    const id = window.setTimeout(() => setShowLoadSkeleton(true), 700);
    return () => window.clearTimeout(id);
  }, [ready]);
  const { user } = useAuth();
  // PUBLIC no-login version: a guest's rhythm is device-local — signed out OR
  // the anonymous device user (which exists only for push). The per-side
  // contemplation cards give way to ONE "Silence" goal card with a live
  // progress bar (useRhythmState already turns the per-side flags off and
  // returns the guest goal/minutes as contemplationGoalMin/contemplationMin),
  // and past noon an un-prayed morning office parks under "Tomorrow".
  const guest = isDeviceLocalGuest(user);
  const hour = new Date().getHours();
  // The custom-practice "Log" popup — which anchor's popup is open (by id).
  const [logAnchorId, setLogAnchorId] = useState<string | null>(null);
  // Tapping the ✓ on an already-Done card opens this instead of navigating —
  // Unlog puts it back in Next, Cancel just closes. Only cards that carry an
  // onUnlog handler (see the card builders above) are checkmark-tappable;
  // everything else keeps the plain "check goes nowhere, card body navigates"
  // behavior it always had.
  const [unlogTarget, setUnlogTarget] = useState<{ title: string; emoji: string; onUnlog: () => void } | null>(null);
  const kept = t("rhythm.kept", { defaultValue: "Kept today" });
  const prayed = t("rhythm.prayed", { defaultValue: "Prayed today" });
  const reflectionSource = useEffectiveReflectionSource();
  const reflectionSubtitle =
    reflectionSource && reflectionSource !== "none"
      ? PUBLICATION_NAME[reflectionSource]
      : t("rhythm.blurb_reflect", { defaultValue: "A few minutes with the day's word" });
  // Today's CAC meditation title (scraped) — so the reflection card can flip
  // between "CAC Daily Meditation" and the day's title.
  const { data: cacMeta } = useQuery<{ title?: string }>({
    queryKey: ["/api/cac/today-meta"],
    queryFn: () => apiRequest("GET", "/api/cac/today-meta"),
    staleTime: 60 * 60_000,
    enabled: reflectionSource === "cac",
  });
  const cacTitle = (cacMeta?.title ?? "").trim();
  // Same idea for today's VTS Dean's Commentary title.
  const { data: vtsMeta } = useQuery<{ title?: string }>({
    queryKey: ["/api/vts/today-meta"],
    queryFn: () => apiRequest("GET", "/api/vts/today-meta"),
    staleTime: 60 * 60_000,
    enabled: reflectionSource === "vts",
  });
  const vtsTitle = (vtsMeta?.title ?? "").trim();
  // What you put on for today's Audio Divina — shown as the card's second line
  // once it's done (e.g. the album/track), in place of the generic "kept".
  const { data: listeningLogData } = useQuery<{ entries: Array<{ day: string; what: string }> }>({
    queryKey: ["/api/listening"],
    queryFn: () => apiRequest("GET", "/api/listening"),
    staleTime: 60_000,
    enabled: listeningActive,
  });
  // What you put on for today's Audio Divina (song / album / artist) — shown as
  // the card's second line once it's done. A day can hold several sittings, so
  // list them all, de-duped and in log order.
  const listeningWhat = listeningActive
    ? Array.from(new Set(
        (listeningLogData?.entries ?? [])
          .filter((e) => e.day === new Date().toLocaleDateString("en-CA"))
          .map((e) => (e.what ?? "").trim())
          .filter(Boolean),
      )).join(" · ")
    : "";
  // Office/devotion subtitle leads with the descriptive line, then flips
  // between the two things you carry in.
  // The subtitle has to follow the LEVEL the same way officeTitle does. When a
  // side is set to the Examen or Guided Prayer, "…with the office" is simply
  // wrong — that side isn't an office at all.
  const officeBlurbFor = (side: "morning" | "evening"): string => {
    const lvl = getSideLevel(side);
    if (lvl === "examen") return t("rhythm.blurb_examen", { defaultValue: "Review the day with God" });
    if (lvl === "guided-prayer") return t("rhythm.blurb_guided_prayer", { defaultValue: "Three Minutes to Start Your Day" });
    if (lvl === "reflect-sit") return t("rhythm.blurb_contemplation", { defaultValue: "Loving God in silence" });
    if (lvl === "psalms") return t("rhythm.blurb_psalms", { defaultValue: "Today's appointed psalms" });
    // Matches sideOfficeTitle's own "readings" case — without it the card read
    // "Mark the day's end with the office", describing an office the person
    // isn't praying.
    if (lvl === "readings") return t("rhythm.blurb_readings", { defaultValue: "Today's appointed readings" });
    if (lvl === "custom") return t("rhythm.blurb_custom", { defaultValue: "Tap to mark done" });
    return side === "morning"
      ? t("rhythm.blurb_morning", { defaultValue: "Begin the day with the office" })
      : t("rhythm.blurb_evening", { defaultValue: "Mark the day's end with the office" });
  };
  const morningBlurb = officeBlurbFor("morning");
  const eveningBlurb = officeBlurbFor("evening");
  // The BCP "…with community prayers" alternation only makes sense for an
  // actual office — don't cycle it under the Examen or a guided prayer.
  const cycleFor = (side: "morning" | "evening") => {
    const lvl = getSideLevel(side);
    return (lvl === "office" || lvl === "devotion" || lvl === "intercessions" || lvl === "ask");
  };
  // Guests never carry community intercessions into the office (that handoff
  // is stripped in guest mode), so their card must not promise them — the
  // subtitle stays on the BCP line instead of alternating.
  const officeCycle = guest
    ? [t("rhythm.from_bcp", { defaultValue: "From the Book of Common Prayer" })]
    : [
        t("rhythm.from_bcp", { defaultValue: "From the Book of Common Prayer" }),
        t("rhythm.with_community", { defaultValue: "with community prayers" }),
      ];
  // Per-side Contemplative Prayer blurb — a silent sit is binary (kept this side
  // or not), so the card reads "kept" when done, else the sit length. The daily
  // minutes goal + ladder still set the timer length; they no longer gate the
  // per-side card (so evening stays inviting after the morning sit met the goal).
  // Each side's card carries its OWN sit length (the customizer's per-side
  // picker) — never the daily minutes goal (a 90-minute goal must not read
  // "90 minutes" on each card — owner). A single sit defaults to at most
  // SESSION_SIT_CAP (20): sensible stored values are clamped down to it, and
  // clearly-out-of-range values (legacy goal-splash artifacts) fall back to a
  // gentle 15.
  const sideSitMin = (side: "morning" | "evening"): number => {
    const raw = getSideMinutes(side);
    if (raw >= 5 && raw <= 30) return Math.min(raw, SESSION_SIT_CAP);
    return 15;
  };
  const contemplationBlurbFor = (done: boolean, mins: number) => done
    ? t("rhythm.contemplation_kept", { defaultValue: "You rested in silence today" })
    : t("rhythm.contemplation_side_len", { mins, defaultValue: `${mins} minutes of loving God in silence` });

  // Extracted to lib/officePrefs.ts (sideOfficeTitle) so /turn-learn-pray's
  // Morning/Contemplative/Evening per-slot summary names the same practice
  // this card does instead of a separately-maintained guess.
  const officeTitle = (side: "Morning" | "Evening") => sideOfficeTitle(side, prayerKind, t);

  // Custom practices slot into the rhythm by their time-of-day: morning ones
  // ride with Morning Prayer, midday after contemplation, afternoon after the
  // optional practices, evening with the evening office. Tapping toggles today's
  // check (no navigation), so each counts as a dot like the built-in anchors.
  const customCard = (a: (typeof customAnchors)[number]) => {
    const r = a.reading;
    const todayAmt = r ? getReadingToday(a.id) : 0;
    let blurb: string;
    if (a.done) {
      blurb = r && todayAmt > 0
        ? t("rhythm.read_done", { amount: todayAmt, unit: readingUnitLabel(r.unit, todayAmt), defaultValue: `${todayAmt} ${readingUnitLabel(r.unit, todayAmt)} today` })
        : kept;
    } else if (r) {
      blurb = r.goal
        ? t("rhythm.read_goal", { amount: r.goal, unit: readingUnitLabel(r.unit, r.goal), defaultValue: `Goal: ${r.goal} ${readingUnitLabel(r.unit, r.goal)}` })
        : t("rhythm.read_by", { unit: readingUnitLabel(r.unit, 2), defaultValue: `Log by ${readingUnitLabel(r.unit, 2)}` });
    } else {
      blurb = t("rhythm.custom_blurb", { defaultValue: "Your daily practice" });
    }
    return {
      key: `custom-${a.id}`, emoji: a.emoji || (r ? "📖" : "✅"), rgb: "143,170,150", done: a.done, href: "",
      // Tapping opens the Log popup (reading stepper, or Done / Not today).
      onClick: () => setLogAnchorId(a.id),
      // Tapping the ✓ on an already-done card opens the Unlog confirm
      // instead — puts it back in Next rather than re-opening the Log sheet.
      onUnlog: () => setCustomNotToday(a.id),
      title: a.title,
      blurb,
      cta: t("rhythm.log", { defaultValue: "Log" }), later: false,
    };
  };

  // Co-Breathe, Audio Divina, and the Examen now slot into the rhythm at the
  // time of day chosen in the customizer's contemplative step (getPracticeSlot),
  // the same way custom anchors do.
  const cobreatheCard = {
    key: "cobreathe", emoji: "🌍", rgb: "62,124,122", done: cobreatheDone, href: "/cobreathe?start=1",
    title: t("rhythm.card_cobreathe", { defaultValue: "Creation Prayer" }),
    blurb: cobreatheDone ? kept : t("rhythm.blurb_cobreathe", { defaultValue: "Breathing together with God's creation" }),
    cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
  };
  const listeningCard = {
    key: "listening", emoji: "🎵", rgb: "108,140,180", done: listeningDone, href: "/listening",
    onUnlog: () => unmarkPracticeDoneToday("listening"),
    title: t("rhythm.card_listening", { defaultValue: "Audio Divina" }),
    blurb: listeningDone ? (listeningWhat || kept) : t("rhythm.blurb_listening", { defaultValue: "Sacred listening" }),
    cta: t("rhythm.log", { defaultValue: "Log" }), later: false,
  };
  const examenCard = {
    key: "examen", emoji: "🌗", rgb: "150,120,180", done: examenDone, href: "/examen",
    onUnlog: () => unmarkPracticeDoneToday("examen"),
    title: t("rhythm.card_examen", { defaultValue: "The Examen" }),
    blurb: examenDone ? kept : t("rhythm.blurb_examen", { defaultValue: "Review the day with God" }),
    cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
  };
  const cobreatheSlot = getPracticeSlot("cobreathe");
  const listeningSlot = getPracticeSlot("listening");
  const walkSlot = getPracticeSlot("walk");
  // The Examen is always an evening practice (no time-of-day picker).
  const examenSlot: CustomSlot = "evening";
  const walkCard = {
    key: "walk", emoji: "🚶", rgb: "120,160,120", done: walkDone, href: "",
    // Owner: should work like a custom practice — tapping opens the SAME
    // Log popup a custom anchor's card does (Done / Not today), via the
    // "walk" sentinel id below, rather than either navigating to a separate
    // page (the old /walk-log flow) or silently toggling on tap (an earlier,
    // too-simplified attempt this session).
    onClick: () => setLogAnchorId("walk"),
    onUnlog: () => unmarkPracticeDoneToday("walk"),
    title: t("rhythm.card_walk", { defaultValue: "Contemplative Walk" }),
    blurb: walkDone ? kept : t("rhythm.blurb_walk", { defaultValue: "A walk as prayer" }),
    cta: t("rhythm.log", { defaultValue: "Log" }), later: false,
  };
  // Prayer List — owner: "if someone has at least one prayer in their
  // prayer list, they should have a card in their routine that says
  // prayer list. If they have completed all their prayers, that card
  // would go to done. The second line should say x out of x prayers have
  // been prayed." Active whenever there's at least one real intention;
  // done once every one of them has been walked past in PrayThrough today
  // (intentionsPrayedCount from useRhythmState, itself backed by
  // prayer_intention_prayed_days — see lib/intentionsPrayed.ts).
  const prayerListActiveCard = intentionsTotalCount > 0;
  const prayerListDoneCard = prayerListActiveCard && intentionsPrayedCount >= intentionsTotalCount;
  const prayerListCard = {
    // Owner: "the card on the home screen only does the personal list in
    // the bad ui" / "both should show up in the slideshows" — routes into
    // the SAME unified prayer-mode slideshow (community + personal, one
    // deck, one UI) instead of the separate PrayThrough screen intentions.tsx
    // used to open. Once done, though (owner: "when you click on it have
    // it go to the prayer list page not the slideshow") there's nothing
    // left to pray through — land on the list itself instead.
    key: "prayer-list-card", emoji: "🕊️", rgb: "96,140,180", done: prayerListDoneCard,
    href: prayerListDoneCard ? "/prayer-list" : "/prayer-mode?reset=1",
    title: t("rhythm.card_prayer_list", { defaultValue: "Prayer List" }),
    blurb: t("rhythm.blurb_prayer_list_count", {
      done: intentionsPrayedCount, total: intentionsTotalCount,
      defaultValue: `${intentionsPrayedCount} of ${intentionsTotalCount} prayers have been prayed`,
    }),
    cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
  };
  // Compline is only reachable after 7pm, but — like Evening Prayer below —
  // the card itself stays in Next all day as a disabled "Later" state
  // rather than disappearing outright (complineActive, from useRhythmState,
  // is now just "the user has this in their rhythm", never time-gated; a
  // card that vanishes when unselected-vs-not-yet-time are conflated read
  // as "Compline isn't holding" once it was picked). No customizer time
  // picker needed since it's always "evening" — the gate itself is the slot.
  const complineCard = {
    key: "compline", emoji: "🌙", rgb: "90,100,140", done: complineDone, href: "/bcp/daily-office?mode=compline",
    onUnlog: () => undoOfficeToday("compline"),
    title: t("rhythm.card_compline", { defaultValue: "Compline" }),
    blurb: complineDone ? kept : t("rhythm.blurb_compline", { defaultValue: "The night office" }),
    cta: t("rhythm.begin", { defaultValue: "Begin" }), later: hour < 19,
  };
  // Every rhythm card carries the time of day it belongs to (its CustomSlot).
  // We assemble them in a sensible base order, then STABLE-sort by that slot so
  // the list ALWAYS reads morning → midday → afternoon → evening, whatever mix
  // of practices the user has chosen and wherever each is slotted. The offices
  // and reflections anchor morning / evening; the optional practices (Co-Breathe,
  // Audio Divina, Walk, Journaling, customs) ride at their chosen slot;
  // the Examen is end-of-day, so it sits in the evening.
  // Creation Prayer as a per-side anchor: when a side's contemplation style is
  // the breath, that side's card IS Creation Prayer (🌍, opens /cobreathe for
  // this side) instead of a silent sit. Naming per the owner's rule: on ONE side
  // it's just "Creation Prayer"; on BOTH, "Morning Creation Prayer" / "Evening
  // Creation Prayer" (kept to one line). When per-side Creation Prayer is on, the
  // standalone Co-Breathe card is suppressed (below) so it isn't shown twice.
  const creationStyle = contemplationStyle === "cobreathe";
  const creationBothSides = creationStyle && morningContemplationActive && eveningContemplationActive;
  const creationTitle = (side: "morning" | "evening"): string =>
    creationBothSides
      ? (side === "morning"
          ? t("rhythm.card_morning_creation", { defaultValue: "Morning Creation Prayer" })
          : t("rhythm.card_evening_creation", { defaultValue: "Evening Creation Prayer" }))
      : t("rhythm.card_creation", { defaultValue: "Creation Prayer" });
  const creationBlurb = (done: boolean): string =>
    done ? kept : t("rhythm.blurb_cobreathe", { defaultValue: "Breathing together with God's creation" });
  const rawCards = [
    // Morning drops off Daily progress once the morning is past (afternoon) and
    // it wasn't prayed — we don't nag about a missed morning in Next; past noon
    // an undone morning drops to the "Tomorrow" section (the partition below), so
    // it's included here regardless of the hour rather than silently omitted.
    // A novena in "replace" mode takes over this slot entirely — its own
    // card here instead of the office/contemplation anchor, so the two
    // never double up (and never double-count in the pill/widget, which
    // mirror this same novenaReplacesMorning/Evening gate).
    ...(novenaReplacesMorning && novena ? [{
      key: "novena", slot: "morning" as CustomSlot, emoji: "🕊️", rgb: "150,120,90", done: novenaDone,
      href: "/novena",
      title: novena.title,
      blurb: novenaDone
        ? kept
        : t("rhythm.novena_day_of", { day: novena.currentDay, count: novena.dayCount, defaultValue: `Day ${novena.currentDay} of ${novena.dayCount}` }),
      progress: { current: novena.currentDay - 1, goal: novena.dayCount },
      alwaysShowProgress: true,
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    }] : []),
    ...(morningActive && !novenaReplacesMorning ? [{
      key: "morning", slot: "morning" as CustomSlot,
      // A contemplative practice serving as the anchor wears its own face —
      // a morning of sacred listening shouldn't be badged with the sunrise
      // used for the Daily Office.
      emoji: (getSideLevel("morning") === "custom" && anchorPracticeFor(getSideCustomName("morning"))?.emoji) || "🌅",
      rgb: "46,107,64", done: morningDone,
      // A user's own named practice has no page to open — tapping just marks
      // it done for the day, same shape as a custom anchor's check.
      // Owner: the practice can BE the anchor. So when the custom name is one
      // Phoebe knows, the card opens that practice; completing it there ticks
      // this anchor (see anchorPracticeDone in useRhythmState). A name they
      // typed themselves has no page, and keeps the tap-to-mark-done it had.
      href: getSideLevel("morning") === "custom"
        ? (anchorPracticeFor(getSideCustomName("morning"))?.href ?? "")
        : "/begin-prayer?side=morning",
      // Tapping again once done UN-marks it — a real toggle, not a one-way
      // stamp (see unmarkCustomPrayed's comment for why this matters).
      ...(getSideLevel("morning") === "custom" && !anchorPracticeFor(getSideCustomName("morning"))?.href
        ? { onClick: () => (morningDone ? unmarkCustomPrayed("morning") : markCustomPrayed("morning")) } : {}),
      // Owner: "make sure I can click the check mark on the offices to undo
      // them." A custom level already toggles through onClick above; every
      // other level was a one-way stamp until midnight.
      ...(getSideLevel("morning") === "custom" ? {} : { onUnlog: () => undoOfficeToday("morning") }),
      title: officeTitle("Morning"),
      blurb: morningDone ? prayed : morningBlurb,
      blurbCycle: (morningDone || !cycleFor("morning")) ? undefined : [morningBlurb, ...officeCycle],
      cta: getSideLevel("morning") === "custom" ? t("rhythm.mark_done", { defaultValue: "Mark done" }) : t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    }] : []),
    ...(novenaReplacesEvening && novena ? [{
      key: "novena", slot: "evening" as CustomSlot, emoji: "🕊️", rgb: "150,120,90", done: novenaDone,
      href: "/novena",
      title: novena.title,
      blurb: novenaDone
        ? kept
        : t("rhythm.novena_day_of", { day: novena.currentDay, count: novena.dayCount, defaultValue: `Day ${novena.currentDay} of ${novena.dayCount}` }),
      progress: { current: novena.currentDay - 1, goal: novena.dayCount },
      alwaysShowProgress: true,
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    }] : []),
    ...(eveningActive && !novenaReplacesEvening ? [{
      // Evening leads the evening slot but stays a quiet "later" card until 3 PM,
      // so the morning rhythm leads the day; from 3 PM on it becomes the office
      // hero. Opt-in — off by default (evening pref "none").
      key: "evening", slot: "evening" as CustomSlot,
      emoji: (getSideLevel("evening") === "custom" && anchorPracticeFor(getSideCustomName("evening"))?.emoji) || "🌙",
      rgb: "46,107,64", done: eveningDone,
      href: getSideLevel("evening") === "custom"
        ? (anchorPracticeFor(getSideCustomName("evening"))?.href ?? "")
        : "/begin-prayer?side=evening",
      ...(getSideLevel("evening") === "custom" && !anchorPracticeFor(getSideCustomName("evening"))?.href
        ? { onClick: () => (eveningDone ? unmarkCustomPrayed("evening") : markCustomPrayed("evening")) } : {}),
      ...(getSideLevel("evening") === "custom" ? {} : { onUnlog: () => undoOfficeToday("evening") }),
      title: hour >= 20 ? t("rhythm.card_close", { defaultValue: "Close the day" }) : officeTitle("Evening"),
      // After 8 PM the title is "Close the day"; the second line names the actual
      // evening method (Evening Prayer / Evening Devotion / Pray together).
      blurb: eveningDone
        ? prayed
        : hour >= 20 ? officeTitle("Evening") : eveningBlurb,
      blurbCycle: (eveningDone || hour >= 20 || !cycleFor("evening")) ? undefined : [eveningBlurb, ...officeCycle],
      cta: getSideLevel("evening") === "custom" ? t("rhythm.mark_done", { defaultValue: "Mark done" }) : t("rhythm.begin", { defaultValue: "Begin" }),
      later: hour < EVENING_OPEN_HOUR,
    }] : []),
    // Reflection cards lead the morning (default second, right after Morning).
    // One card per reflection newsletter the user follows — each its own card +
    // dot, opening that source's reading directly (and marking it read).
    ...reflections.map((r) => {
      const url = r.source === "cac" ? CAC_TODAY_URL : r.source === "fdd" ? FDD_TODAY_URL : r.source === "ssje" ? SSJE_TODAY_URL : VTS_TODAY_URL;
      const mark = r.source === "cac" ? markCacRead : r.source === "fdd" ? markFddRead : r.source === "ssje" ? markSsjeRead : markVtsRead;
      const scrapedTitle = r.source === "cac" ? cacTitle : r.source === "vts" ? vtsTitle : "";
      // VTS opens the in-app paragraph slideshow (vts-reading.tsx) — VTS
      // gave permission to bring the text into Phoebe rather than just
      // linking out, unlike CAC/FDD/SSJE, which still open externally.
      const isVts = r.source === "vts";
      return {
        key: `reflect-${r.source}`, slot: "morning" as CustomSlot, emoji: isVts ? "🦩" : "📖", rgb: "96,141,209", done: r.done, href: isVts ? "/vts-reading" : "",
        title: PUBLICATION_NAME[r.source],
        blurb: scrapedTitle || (r.done ? kept : t("rhythm.blurb_reflect", { defaultValue: "A few minutes with the day's word" })),
        blurbCycle: undefined,
        // BUG FIXED (CAC/FDD/SSJE only): `mark()` — the actual read-tracking
        // call that flips this card's dot — used to fire HERE, immediately
        // at tap time, completely bypassing openExternalThenMarkRead's whole
        // "wait for the browser to actually close" mechanism (it was handed
        // `swellHaptic`, a haptic buzz with no read-tracking effect, as its
        // "markRead" callback — so on close all that happened was a
        // vibration; the dot had already flipped the instant they tapped
        // "Read"). This is what "the reflection animation isn't waiting
        // until I come back" was — the wait-for-close mechanism itself
        // works correctly (verified: the reader-view Swift path already
        // fires its dismiss event properly), this card just never actually
        // used it for the thing that mattered. VTS has no onClick at all —
        // it navigates via href and marks read itself once the reader is
        // actually stepped through (see vts-reading.tsx).
        ...(isVts ? {} : { onClick: () => openExternalThenMarkRead(url, () => { mark(); swellHaptic(); }, { reader: true }) }),
        cta: t("rhythm.read", { defaultValue: "Read" }), later: false,
      };
    }),
    // Per-side Contemplative Prayer — Morning / Evening Contemplation, each its
    // own card at its slot, completed independently (a sit from this card clears
    // THIS side; ?side= tells the timer which). Evening stays in Next even after
    // the morning sit met the daily minutes goal.
    // Manual log method (owner: "log method... either timer or manual log")
    // only applies to the silent sit — Creation Prayer keeps its own guided
    // breath flow regardless. When on, the card marks itself done on tap
    // instead of opening the countdown timer.
    ...(morningContemplationActive ? [{
      key: "contemplation-morning", slot: "morning" as CustomSlot, emoji: creationStyle ? "🌍" : "🕯️", rgb: "62,124,122", done: morningContemplationDone,
      // Creation Prayer → the breath for this side; silent + timer → the sit
      // timer at THIS SIDE's length (?sit=N), skipping the length picker;
      // silent + manual → no navigation, just marks the sit done.
      href: creationStyle || contemplationLogMethod === "timer" ? (creationStyle ? "/cobreathe?begin=1&side=morning" : `/contemplation?begin=1&side=morning&sit=${sideSitMin("morning")}`) : "",
      ...(!creationStyle && contemplationLogMethod === "manual" ? { onClick: () => markContemplationSideDone("morning", "silent") } : {}),
      title: creationStyle ? creationTitle("morning") : t("rhythm.card_morning_contemplation", { defaultValue: "Morning Contemplation" }),
      blurb: creationStyle ? creationBlurb(morningContemplationDone) : contemplationBlurbFor(morningContemplationDone, sideSitMin("morning")),
      cta: !creationStyle && contemplationLogMethod === "manual" ? t("rhythm.mark_done", { defaultValue: "Mark done" }) : t("rhythm.begin", { defaultValue: "Begin" }), later: false,
      // Creation Prayer, once done, just reads as kept (checked) like the other
      // rhythm cards — no "breathe again" repeat CTA. Silent contemplation keeps
      // "Sit again" (it has no ceiling) unless it's a manual mark (nothing to redo).
      doneCta: creationStyle || contemplationLogMethod === "manual" ? undefined : t("rhythm.sit_again", { defaultValue: "Sit again" }),
    }] : []),
    ...(eveningContemplationActive ? [{
      key: "contemplation-evening", slot: "evening" as CustomSlot, emoji: creationStyle ? "🌍" : "🕯️", rgb: "62,124,122", done: eveningContemplationDone,
      href: creationStyle || contemplationLogMethod === "timer" ? (creationStyle ? "/cobreathe?begin=1&side=evening" : `/contemplation?begin=1&side=evening&sit=${sideSitMin("evening")}`) : "",
      ...(!creationStyle && contemplationLogMethod === "manual" ? { onClick: () => markContemplationSideDone("evening", "silent") } : {}),
      title: creationStyle ? creationTitle("evening") : t("rhythm.card_evening_contemplation", { defaultValue: "Evening Contemplation" }),
      blurb: creationStyle ? creationBlurb(eveningContemplationDone) : contemplationBlurbFor(eveningContemplationDone, sideSitMin("evening")),
      cta: !creationStyle && contemplationLogMethod === "manual" ? t("rhythm.mark_done", { defaultValue: "Mark done" }) : t("rhythm.begin", { defaultValue: "Begin" }), later: false,
      doneCta: creationStyle || contemplationLogMethod === "manual" ? undefined : t("rhythm.sit_again", { defaultValue: "Sit again" }),
    }] : []),
    // SOLO "Silence" goal card — ONE card with a PROGRESS BAR of today's
    // minutes toward the daily goal. Shown whenever a goal is set and NEITHER
    // side carries a contemplation card (all guests; signed-in users who set
    // only the minutes goal on the Silence step) — a saved goal must always be
    // visible somewhere. ALSO shown when Creation Prayer (the breath) is the
    // active style even though a per-side card IS present: unlike a silent
    // sit's blurb (which names that side's length), the Creation Prayer card's
    // blurb never mentions minutes or the daily goal at all, so the goal
    // progress ("N of M min today") would otherwise be invisible everywhere.
    // Signed-in minutes come from the server's sit stats. Begin opens the timer
    // straight at the goal length; past goal it stays tappable to sit again.
    ...(contemplationGoalMin > 0 && (
      (creationStyle && (morningContemplationActive || eveningContemplationActive)) ||
      (!morningContemplationActive && !eveningContemplationActive)
    ) ? [{
      key: "silence", slot: "anytime" as CustomSlot, emoji: "🕯️", rgb: "62,124,122",
      done: contemplationMin >= contemplationGoalMin,
      // The daily goal is an accumulation target for the whole day — NOT the
      // length of a single sit. A 60-min goal must never open a 60-min timer;
      // a session's default length is capped at SESSION_SIT_CAP (20). The user
      // can still pick longer explicitly in the timer's own length dropdown.
      href: `/contemplation?begin=1&sit=${Math.min(contemplationGoalMin, SESSION_SIT_CAP)}`,
      title: t("rhythm.card_silence", { defaultValue: "Contemplation" }),
      // Owner: "take out... second line of sit again stuff" — once kept,
      // the card just shows the title + "✓ Sit again →" CTA, no subtitle.
      blurb: contemplationMin >= contemplationGoalMin
        ? ""
        : t("rhythm.silence_of_goal", { current: contemplationMin, goal: contemplationGoalMin, defaultValue: `${contemplationMin} of ${contemplationGoalMin} min today` }),
      progress: { current: contemplationMin, goal: contemplationGoalMin },
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
      doneCta: t("rhythm.sit_again", { defaultValue: "Sit again" }),
    }] : []),
    // The active novena — one card while it's in progress, gone once the
    // final day is marked done (novenaActive drops the moment the server
    // flips status to "completed"). Progress bar counts completed days
    // (currentDay - 1) toward dayCount, same pattern as the silence goal card.
    // Placed ahead of the optional practices below (not after them): those
    // often share this same "anytime" slot rank, and Next's cap (maxUpcoming,
    // see dashboard.tsx) slices off whatever falls past position 7 — a novena
    // the person deliberately started is the one card that should never be
    // the thing silently pushed out by a passive add-on practice.
    ...(novenaActive && novena && !novenaReplacesMorning && !novenaReplacesEvening ? [{
      key: "novena", slot: "anytime" as CustomSlot, emoji: "🕊️", rgb: "150,120,90", done: novenaDone,
      href: "/novena",
      title: novena.title,
      blurb: novenaDone
        ? kept
        : t("rhythm.novena_day_of", { day: novena.currentDay, count: novena.dayCount, defaultValue: `Day ${novena.currentDay} of ${novena.dayCount}` }),
      progress: { current: novena.currentDay - 1, goal: novena.dayCount },
      alwaysShowProgress: true,
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    }] : []),
    // Optional practices ride at the time of day the user chose for each.
    ...(cobreatheActive && !(creationStyle && (morningContemplationActive || eveningContemplationActive)) ? [{ ...cobreatheCard, slot: cobreatheSlot }] : []),
    ...(listeningActive ? [{ ...listeningCard, slot: listeningSlot }] : []),
    ...(walkActive ? [{ ...walkCard, slot: walkSlot }] : []),
    // Prayer List rides at whichever slot the viewer picked (see
    // lib/prayerListSlot.ts) on /intentions, or "anytime" if they never set
    // one — the card still shows either way, only its POSITION changes.
    // (The separate bottom-of-home PrayerListSection block was removed
    // (owner) — this Next/Done routine card is the only home-screen
    // surface left; full access lives at the header pill → /prayer-list.)
    ...(prayerListActiveCard ? [{ ...prayerListCard, slot: (getPrayerListSlot() ?? "anytime") as CustomSlot }] : []),
    // complineActive already folds in the after-7pm gate (useRhythmState.ts)
    // — fixed to "evening" since there's no earlier time it could ever show.
    ...(complineActive ? [{ ...complineCard, slot: "evening" as CustomSlot }] : []),
    ...customAnchors.filter((a) => !a.skipped).map((a) => ({ ...customCard(a), slot: a.slot })),
    ...(readingActive ? [{
      key: "reading", slot: getPracticeSlot("reading"), emoji: "📚", rgb: "108,140,180", done: readingDone, href: "/reading-log",
      onUnlog: () => unmarkPracticeDoneToday("reading"),
      title: t("rhythm.card_reading", { defaultValue: "Reading" }),
      blurb: readingDone ? kept : t("rhythm.blurb_reading", { defaultValue: "Log what you read" }),
      cta: t("rhythm.log", { defaultValue: "Log" }), later: false,
    }] : []),
    ...(podcastsActive ? [{
      key: "podcasts", slot: "afternoon" as CustomSlot, emoji: "🎙️", rgb: "150,120,150", done: podcastsDone, href: "/podcast-log",
      onUnlog: () => unmarkPracticeDoneToday("podcasts"),
      title: t("rhythm.card_podcasts", { defaultValue: "Podcasts" }),
      blurb: podcastsDone ? kept : t("rhythm.blurb_podcasts", { defaultValue: "Log what you listened to" }),
      cta: t("rhythm.log", { defaultValue: "Log" }), later: false,
    }] : []),
    // The Examen is an end-of-day reflection — it belongs to evening. Suppressed
    // when the evening anchor itself IS the Examen (getSideLevel === "examen"):
    // that's already rendered above as the "evening" card (retitled "The Examen"
    // by officeTitle), so this standalone add-on card would otherwise double it.
    ...(examenActive && getSideLevel("morning") !== "examen" && getSideLevel("evening") !== "examen" ? [{ ...examenCard, slot: examenSlot }] : []),
    // Prayer List is NOT a routine anchor — no card here. It's already woven
    // into the offices (BCP office / Simple Guided Prayer / Psalms) as
    // slides, and gets its own dedicated section on the home screen (see
    // PrayerListSection in dashboard.tsx) rather than a Next/Done rhythm row.
  ];
  // The morning- and evening-slotted cards bookend the list (unchanged — a
  // stable sort on SLOT_RANK, since every card sharing a slot already carries
  // the same rank, so ties fall back to array order). The middle group
  // (anytime/midday/afternoon — the optional add-on practices) is instead
  // reordered to echo the sequence the user actually practiced them in
  // YESTERDAY, not today's fixed feature order: yesterdayOrderRank below maps
  // a card key to its position in that sequence; a card with no entry (never
  // done yesterday, or one of the day-only-tracked keys like a novena or a
  // custom anchor) falls after everything that DOES have one, per owner.
  const { data: yesterdayOrderData } = useQuery<{ order: string[] }>({
    queryKey: ["/api/me/yesterday-order"],
    queryFn: () => apiRequest("GET", "/api/me/yesterday-order"),
    staleTime: 5 * 60_000,
  });
  const yesterdayOrderRank = new Map((yesterdayOrderData?.order ?? []).map((key, i) => [key, i]));
  const cardGroup = (slot: CustomSlot): 0 | 1 | 2 => slot === "morning" ? 0 : slot === "evening" ? 2 : 1;
  // Yesterday's real order applies WITHIN every slot group, not only the
  // anytime/midday/afternoon middle one.
  //
  // Owner: "I'll do contemplation first and then Dean's Commentary, and they
  // show up 2nd and 4th the next day." Both of those cards are slotted
  // "morning" — per-side Contemplation, and every reflection card — so the
  // old `ga === 1` condition skipped them: the two practices most likely to
  // be done back-to-back were exactly the two that could never reorder.
  //
  // Slot grouping stays the OUTER sort on purpose, even though the feed now
  // reports the offices too (owner: "there should be endpoints in that when
  // they're completed"), so nearly every card can rank.
  //
  // Letting rank win outright reads wrong the moment a day is incomplete: skip
  // Morning Prayer yesterday but pray Compline, and Compline is the only
  // ranked card — so it sits at the top of the list at 8am, above the morning
  // office you're about to pray. Grouping first keeps morning above evening
  // always, and orders WITHIN each group by what actually happened, which is
  // where the owner's report lives (Contemplation and Dean's Commentary are
  // both morning-slotted). A card with no record keeps its slotted place,
  // after the ones that have one.
  const sortedCards = rawCards
    .map((c, idx) => ({ c, idx }))
    .sort((a, b) => {
      const ga = cardGroup(a.c.slot), gb = cardGroup(b.c.slot);
      if (ga !== gb) return ga - gb;
      const ra = yesterdayOrderRank.has(a.c.key) ? yesterdayOrderRank.get(a.c.key)! : Infinity;
      const rb = yesterdayOrderRank.has(b.c.key) ? yesterdayOrderRank.get(b.c.key)! : Infinity;
      if (ra !== rb) return ra - rb;
      return a.idx - b.idx; // stable tiebreak — original base order
    })
    .map((x) => x.c);
  // Time-gate each slotted card: you can't complete a practice before its slot's
  // window opens (Midday 10 AM, Afternoon 2 PM, Evening 5 PM). Morning + Anytime
  // are always open. A gated card stays a quiet, non-tappable "Later" card (the
  // existing `later` treatment) until its window arrives — no time on the pill.
  const cards = sortedCards.map((c) => {
    if (c.done || isSlotOpen(c.slot)) return c;
    return { ...c, later: true };
  });

  // When a dedicated office hero is supplied (the beta home), the office shows
  // as that full hero instead of a practice row. The hero is the next office to
  // pray: morning while it's still undone, otherwise evening. We drop the hero's
  // side from the rows; the OTHER side stays as a small row (e.g. evening drops
  // small in the list when morning isn't done yet).
  // Morning leads as the office hero until it's prayed. After morning, the day
  // belongs to reflection → contemplation (small cards); the evening office
  // stays a quiet "later" card and only becomes the hero from 5 PM on (matches
  // the splash + the dashboard "what's next" hero — Evening never leads earlier).
  const heroSide: "morning" | "evening" | null =
    // Morning only leads as the hero while it's still morning — past noon a
    // not-yet-prayed morning steps aside (matches the omitted morning card +
    // the dashboard "what's next" gate), so the afternoon never shows a morning
    // hero. Evening takes the hero from 5 PM.
    (morningActive && !morningDone && hour < 12) ? "morning"
    : (eveningActive && hour >= EVENING_OPEN_HOUR && !eveningDone) ? "evening"
    : null;
  const showOfficeHero = !!renderOfficeHero && heroSide !== null;
  const officeHero = showOfficeHero ? renderOfficeHero!(heroSide!) : null;
  // Shade each card along the green→purple ramp by its position in the FULL day
  // order (so a card keeps its colour whether it's Next or Done, and the ramp
  // doesn't reshuffle as things get kept). The office hero keeps its own colour.
  const coloredCards = cards.map((c, i) => ({ ...c, rgb: rhythmGradientRgb(i, cards.length) }));
  // When the rhythm has NO office at all, the morning Contemplation card leads
  // the day as the hero — a big anchor card ABOVE the reflection — so a
  // contemplation-only rhythm still has a clear "start here". Only where heroes
  // render (renderOfficeHero present), while a contemplation sit is still undone.
  // Morning Contemplation leads all day; Evening Contemplation only takes the
  // hero from 5 PM on (mirroring the evening office, which never leads earlier).
  const noOffice = !morningActive && !eveningActive;
  const contemplationHero = (!!renderOfficeHero && noOffice)
    ? coloredCards.find((c) =>
        !c.done && (
          // Morning leads ONLY while it's still morning — exactly like the
          // office heroSide (past noon an undone morning steps aside; it never
          // sits as a giant hero at night). Evening takes the hero from 5 PM.
          (c.key === "contemplation-morning" && hour < 12) ||
          (c.key === "contemplation-evening" && hour >= EVENING_OPEN_HOUR)
        ))
    : undefined;
  // Whether SOME card leads the Next list as a hero (office or contemplation).
  const heroLeads = !!officeHero || !!contemplationHero;
  const visibleCards = showOfficeHero
    ? coloredCards.filter((c) => c.key !== heroSide)
    : contemplationHero
      ? coloredCards.filter((c) => c.key !== contemplationHero.key)
      : coloredCards;

  // Every undone practice stays in Next (never vanishes, never rolls to a
  // separate "Tomorrow" section — both read as confusing / data-loss). A card
  // whose slot hasn't opened yet is still shown, quietly, as a "Later" card
  // (handled above), so Next is simply "what's left of your rhythm today".
  //
  // The ONE exception (the general Tomorrow section was removed in ff092ee6 and
  // stays removed): a GUEST's morning office once noon has passed. An
  // un-prayed morning isn't "missed", and it isn't really "next" either — it
  // belongs to tomorrow morning — so from 12 PM on, the undone morning card
  // waits under a small "Tomorrow" divider at the bottom instead of sitting in
  // Next. It stays tappable (praying it anyway completes today's), and the new
  // day restores it to Next. Signed-in full-app users keep the no-Tomorrow rule.
  // The morning ANCHOR card — the office, or (when Creation Prayer / a silent
  // sit IS the morning prayer, so there's no office) the morning contemplation
  // card. Past noon an undone morning anchor belongs to tomorrow morning, so it
  // waits under the "Tomorrow" divider rather than nagging in Next — exactly as
  // the office does.
  const morningAnchorKey = visibleCards.some((c) => c.key === "morning")
    ? "morning"
    : visibleCards.some((c) => c.key === "contemplation-morning")
      ? "contemplation-morning"
      : null;
  const guestMorningTomorrow = guest
    && hour >= 12
    && !!morningAnchorKey
    && visibleCards.some((c) => c.key === morningAnchorKey && !c.done);
  const tomorrowDisplay = guestMorningTomorrow
    ? visibleCards.filter((c) => c.key === morningAnchorKey)
    : [];
  // While the completion moment is pinned, the just-done card stays in Next
  // (that's the whole point — the user watches it finish there first).
  const pinnedKey = pinnedInNext ? celebrateKey : null;
  // Strictly undone cards — NOT the pinned-celebration inclusion above (that
  // card is actually done, just lingering in Next for the animation), and
  // not a guest's morning deferred to tomorrow (it isn't "left today"). Plus
  // the office/contemplation hero when it's leading — it's excluded from
  // visibleCards for rendering (see heroSide filter above) but is undone by
  // construction whenever it exists. This is the same "what's left of your
  // rhythm today" count the Next section shows, minus the pinned exception —
  // reported upward so callers (the iOS app-icon badge) can mirror it exactly
  // instead of hand-rolling a second, driftable copy of this logic.
  const remainingCount =
    visibleCards.filter((c) => !c.done && !(guestMorningTomorrow && c.key === morningAnchorKey)).length
    + (heroLeads ? 1 : 0);
  useEffect(() => {
    onRemainingCount?.(remainingCount);
  }, [remainingCount, onRemainingCount]);
  // ── The whole-routine swell ──────────────────────────────────────────────
  // Nothing left undone, AND we arrived here off a fresh completion
  // (celebrateKey — set by the practice we just came back from, read once at
  // mount): the practice that just finished was the LAST one. That earns the
  // app's one big sound — the chapel tone walked up its three octave steps so
  // you hear the progression climb — plus a haptic on each step.
  //
  // Gated on celebrateKey, not on remainingCount alone: without it, merely
  // opening the home on an already-finished day would replay the swell on
  // every visit. Gated on `ready` too, since remainingCount is 0 while the
  // rhythm queries are still settling and that zero means "unknown", not
  // "done". The ref makes it fire exactly once per mount.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (sweptRef.current) return;
    if (!ready || !celebrateKey || remainingCount !== 0) return;
    sweptRef.current = true;
    playRoutineCompleteSwell();
  }, [ready, celebrateKey, remainingCount]);
  const upcomingDisplay = (() => {
    const all = visibleCards.filter((c) => (!c.done || c.key === pinnedKey) && !(guestMorningTomorrow && c.key === morningAnchorKey));
    if (maxUpcoming == null) return all;
    // Cap the Next section: never show more than `maxUpcoming` cards (the office
    // hero counts as one). The rest stay on /daily-progress.
    return all.slice(0, Math.max(0, maxUpcoming - (heroLeads ? 1 : 0)));
  })();
  // Everything kept today stays in the Done section all day — until the whole
  // day's rhythm is complete — so the home always reflects what's been prayed.
  const completedDisplay = visibleCards.filter((c) => c.done && c.key !== pinnedKey);
  const showDoneSection = (showStreak || showDone) && completedDisplay.length > 0;
  const showTomorrowSection = tomorrowDisplay.length > 0;

  // On the native first app-open the splash covers the home; hold the card
  // cascade (fade-up + outline pulse + haptics) until the splash has faded DOWN
  // so the user actually sees it rise. Gate on the "splash-done-once" flag —
  // which is stamped only when the splash FADES (not "splash-shown", set at its
  // start, which raced the home into starting early). On web, or once the splash
  // has finished this session, cascade immediately.
  const [splashCleared, setSplashCleared] = useState<boolean>(() => {
    if (!isNativeShell()) return true;
    // The first-open intro renders OVER the home. Hold the cards (and their
    // cascade haptics) until it dissolves, so nothing loads/ticks behind it.
    if (shouldShowFirstOpenOnboarding()) return false;
    // First launch shows no splash (see OpeningSplash), so there's nothing to
    // wait for — paint the cards instantly instead of holding them out.
    if (isFirstOpen()) return true;
    try { return sessionStorage.getItem("phoebe:splash-done-once") !== null; } catch { return true; }
  });

  useEffect(() => {
    if (splashCleared) return;
    const clear = () => setSplashCleared(true);
    window.addEventListener("phoebe:splash-done", clear);
    window.addEventListener(FIRST_OPEN_ONBOARDING_CLOSED_EVENT, clear);
    // Fallback only if the event is somehow missed — must outlast the splash
    // (~7.5s hold + ~1.4s fade). While the first-open intro is still up (a slow
    // read), keep waiting rather than un-gating the cascade behind it.
    let id = window.setTimeout(function fb() {
      if (isFirstOpenOnboardingActive()) { id = window.setTimeout(fb, 4000); return; }
      clear();
    }, 12000);
    return () => { window.removeEventListener("phoebe:splash-done", clear); window.removeEventListener(FIRST_OPEN_ONBOARDING_CLOSED_EVENT, clear); window.clearTimeout(id); };
  }, [splashCleared]);

  // A haptic ticks under EACH card as it cascades in (native only, once per
  // mount). Started ~0.5s in (they read early synced to the visual stagger).
  // Every tick is the SAME intensity + length — no escalation.
  const cascadeHaptedRef = useRef(false);
  useEffect(() => {
    if (!ready || !splashCleared || cascadeHaptedRef.current) return;
    // Never tick under cards while the first-open intro is still up (they're
    // behind the overlay). The dissolve flips splashCleared → this re-runs.
    if (isFirstOpenOnboardingActive()) return;
    cascadeHaptedRef.current = true;
    if (!isNativeShell()) return;
    // Count the office HERO card too (it leads the Next list at enterUp(0)), so
    // it gets the first tick and every card below cascades a haptic IN the same
    // top-to-bottom (time-of-day) order they rise in. Without the hero in the
    // count it cascaded in silently and the ticks lagged the cards by one.
    const count = (heroLeads ? 1 : 0) + upcomingDisplay.length + (showDoneSection ? completedDisplay.length : 0) + (showTomorrowSection ? tomorrowDisplay.length : 0);
    const START_DELAY = 200;   // ms — small hold so it doesn't fire early
    const STEP = 110;          // ms between cards
    const PEAK = 0.42;         // every tick's strength (uniform)
    const DURATION_MS = 110;   // every tick's length (uniform)
    const timers: number[] = [];
    for (let i = 0; i < count; i++) {
      timers.push(window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "tick", peak: PEAK, durationMs: DURATION_MS } }));
      }, START_DELAY + i * STEP));
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [ready, splashCleared, upcomingDisplay.length, completedDisplay.length, showDoneSection, tomorrowDisplay.length, showTomorrowSection, heroLeads]);

  // Matches the Prayer List title row — a larger mixed-case heading with a
  // divider line trailing off to the right.
  const sectionHeader = (label: string) => (
    <div className="flex items-center gap-3 mb-2">
      <h3 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>
        {label}
      </h3>
      <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
    </div>
  );
  // The lead practice card (the next thing to do) pulses its border like a
  // today's-event card — EXCEPT when it's too early to nudge: Evening prayer
  // before 5pm, or Contemplation already >50% of its goal before 3pm.
  const lead = upcomingDisplay[0] as (undefined | (typeof cards)[number] & { later?: boolean });
  const leadPulse = !!lead && !lead.done && !lead.later && (
    lead.key === "evening" ? hour >= EVENING_OPEN_HOUR
    // Don't nag a contemplation card early if today's sit already covered
    // >50% of the goal before 3pm (matches the old single-silence behaviour).
    : (lead.key === "contemplation-morning" || lead.key === "contemplation-evening") ? !(contemplationGoalMin > 0 && contemplationMin > contemplationGoalMin * 0.5 && hour < 15)
    : true
  );

  // A subtle lightness ramp across the WHOLE routine stack (Next → Done →
  // Tomorrow) — the top card sits a touch lighter, easing darker toward the bottom.
  const stackCount = upcomingDisplay.length + completedDisplay.length + tomorrowDisplay.length;
  const tintFor = (globalIdx: number) => (stackCount <= 1 ? 0.4 : globalIdx / (stackCount - 1));

  const renderCard = (c: (typeof cards)[number], pulse = false, tint = 0.4, blurDelay?: number) => (
    <PracticeCard
      href={c.href}
      emoji={c.emoji}
      title={c.title}
      blurb={c.blurb}
      cta={c.cta}
      done={c.done}
      rgb={c.rgb}
      tint={tint}
      later={c.later}
      laterLabel={("laterLabel" in c && c.laterLabel) ? (c.laterLabel as string) : t("rhythm.later", { defaultValue: "Later" })}
      progress={(c as { progress?: { current: number; goal: number } }).progress}
      alwaysShowProgress={(c as { alwaysShowProgress?: boolean }).alwaysShowProgress}
      blurbCycle={(c as { blurbCycle?: string[] }).blurbCycle}
      onClick={"onClick" in c ? (c.onClick as (() => void) | undefined) : undefined}
      doneCta={(c as { doneCta?: string }).doneCta}
      pulse={pulse}
      pulseOnLoad={splashCleared}
      blurDelay={blurDelay}
      celebrate={celebrating && c.key === celebrateKey}
      onCheckClick={
        "onUnlog" in c && c.onUnlog
          ? () => setUnlogTarget({ title: c.title, emoji: c.emoji, onUnlog: c.onUnlog as () => void })
          : undefined
      }
    />
  );
  // The card that LEADS the Next list as a hero: the office hero when there is
  // one, otherwise the morning Contemplation card in the big hero layout.
  // When Creation Prayer (the breath) is the anchor and it LEADS as the hero,
  // mirror the office hero exactly: no emoji + a small-caps "CREATION PRAYER"
  // eyebrow above the title (the office hero shows "BOOK OF COMMON PRAYER" and
  // no emoji). The compact list card keeps its 🌍.
  const heroIsCreation = !!contemplationHero && creationStyle
    && (contemplationHero.key === "contemplation-morning" || contemplationHero.key === "contemplation-evening");
  const heroNode = officeHero ?? (contemplationHero ? (
    <PracticeCard
      href={contemplationHero.href}
      emoji={heroIsCreation ? "" : contemplationHero.emoji}
      eyebrow={heroIsCreation ? t("rhythm.creation_eyebrow", { defaultValue: "Creation Prayer" }) : undefined}
      title={contemplationHero.title}
      blurb={contemplationHero.blurb}
      cta={contemplationHero.cta}
      done={contemplationHero.done}
      rgb={contemplationHero.rgb}
      hero
      later={contemplationHero.later}
      progress={(contemplationHero as { progress?: { current: number; goal: number } }).progress}
      doneCta={(contemplationHero as { doneCta?: string }).doneCta}
      pulseOnLoad={splashCleared}
    />
  ) : null);
  // The blur on a card starts as it LANDS — its cascade delay (enterUp) plus a
  // little, so the frosted backdrop ramps in just as the card settles. min()
  // caps it to the same ceiling enterUp uses so late cards don't lag too far.
  const blurLand = (i: number) => Math.min(i * 0.1, 0.7) + 0.25;

  // Gentle staggered fade-up — each card rises in just after the one above it.
  // A clear cascade: a touch more travel + a longer per-card gap so the cards
  // visibly load one after another rather than appearing all at once.
  // Returning from a practice, the cards are ALREADY THERE — no cascade. The
  // completion moment is the thing to watch, and a stagger underneath it just
  // competes for attention.
  const enterUp = (i: number) => (celebrateKey ? {
    initial: false as const,
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0 },
  } : {
    initial: { opacity: 0, y: 8 },
    animate: splashCleared ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay: Math.min(i * 0.1, 0.7) },
  });
  // Hold the first paint until the rhythm queries have settled (so cards don't
  // jump from Next to Done as data lands), then fade each card up in turn.
  // A load that's still not ready after 700ms gets a real skeleton instead of
  // staying silent — see showLoadSkeleton above.
  if (!ready) {
    if (!showLoadSkeleton) return null;
    return (
      <div className="space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
        ))}
      </div>
    );
  }

  // Gap above Done: when Next still has cards, a smaller gap reads right; when
  // the hero (or nothing) is the only thing in Next it needs more breathing room.
  const doneGapCls = !(upcomingDisplay.length > 0 || heroLeads) ? ""
    : upcomingDisplay.length > 0 ? "mt-4" : "mt-8";

  // Cascade base index for each section — must count the hero card (it leads the
  // Next list at enterUp(0)), or the Done/Tomorrow sections rise one step early
  // and overlap the last Next card instead of following it. Matches the haptic
  // count above so the ticks and the visual cascade stay in the same order.
  const doneBase = (heroLeads ? 1 : 0) + upcomingDisplay.length;
  const tomorrowBase = doneBase + (showDoneSection ? completedDisplay.length : 0);

  return (
    <div>
      {/* A prayer-requests card leads the whole thing when there's something
          waiting. */}
      {leadCard && <motion.div {...enterUp(0)} className="mb-3">{leadCard}</motion.div>}
      {(upcomingDisplay.length > 0 || heroLeads) && (
        <>
          {/* The section title fades up with the cascade too (visual only — the
              haptic ticks are scheduled per CARD, so titles never buzz).
              mt-3 = a touch more air above "Next" (owner) — the welcome/date
              stack above was crowding it. */}
          <motion.div {...enterUp(0)} className="mt-3">{sectionHeader(t("daily_progress.next_heading", { defaultValue: "Next" }))}</motion.div>
          <div className="flex flex-col gap-2">
            {/* The hero leads the Next list — the office, or (with no office)
                the morning Contemplation card, above the reflection. */}
            {heroNode && <motion.div {...enterUp(0)}>{heroNode}</motion.div>}
            {/* Leave AnimatePresence's OWN `initial` prop at its default
                (true) — setting it false here previously suppressed EVERY
                card's entrance fade-up on every mount, not just during a
                completion (that broke the ordinary cascade entirely). Each
                card's own `initial` (from enterUp, below) already correctly
                skips the animation on a celebrateKey mount and plays it
                otherwise — that per-child value is what should differ, not
                this wrapper. */}
            <AnimatePresence>
              {upcomingDisplay.map((c, i) => {
                const enter = enterUp(i + (heroLeads ? 1 : 0));
                return (
                  <motion.div
                    key={c.key}
                    // Always on (not just during a celebrateKey mount) — a card can
                    // also drop out of Next from an inline completion on THIS same
                    // mounted instance (tapping Log on Reading/Podcasts/Prayer List,
                    // etc.), and the cards below it need the same smooth reflow up
                    // rather than snapping into place.
                    layout
                    layoutDependency={upcomingDisplay.length}
                    exit={c.key === celebrateKey ? { opacity: 0, y: 10, transition: { duration: 0.26, ease: "easeIn" } } : { opacity: 0, transition: { duration: 0.2 } }}
                    {...enter}
                    transition={{ ...enter.transition, layout: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } }}
                  >
                    {renderCard(c, i === 0 && leadPulse, tintFor(i), blurLand(i + (heroLeads ? 1 : 0)))}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}
      {/* The "Done" list lives on the Daily Progress page (showStreak) and on the
          home (showDone). */}
      {showDoneSection && (
        <div className={doneGapCls}>
          <motion.div {...enterUp(doneBase)}>{sectionHeader(t("daily_progress.done_heading", { defaultValue: "Done" }))}</motion.div>
          <div className="flex flex-col gap-2">
            {completedDisplay.map((c, i) => {
              // Always on — a card newly arriving in Done (from an inline
              // completion, not just the celebrate-navigation flow) needs the
              // rest of this list to smoothly reflow down, not snap.
              const enter = c.key === celebrateKey
                ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const } }
                : enterUp(doneBase + i);
              return (
                <motion.div
                  key={c.key}
                  layout
                  layoutDependency={completedDisplay.length}
                  {...enter}
                  transition={{ ...enter.transition, layout: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } }}
                >
                  {renderCard(c, false, tintFor(doneBase + i), blurLand(doneBase + i))}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
      {/* "Tomorrow" — undone practices whose time-of-day has passed (e.g. morning
          practices when you set up in the evening). At the bottom, so Next stays
          focused on what's left today. Still tappable if you want to do one now. */}
      {showTomorrowSection && (
        <div className={(upcomingDisplay.length > 0 || heroLeads || showDoneSection) ? "mt-8" : ""}>
          <motion.div {...enterUp(tomorrowBase)}>
            {sectionHeader(t("daily_progress.tomorrow_heading", { defaultValue: "Tomorrow" }))}
          </motion.div>
          <div className="flex flex-col gap-2">
            {tomorrowDisplay.map((c, i) => {
              const idx = tomorrowBase + i;
              return (
                <motion.div key={c.key} {...enterUp(idx)}>
                  {renderCard(c, false, tintFor(idx), blurLand(idx))}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly progress grid removed — the rhythm is a fresh start each day
          ("every day we begin again"), so no week-at-a-glance accumulation. */}

      {/* "Grow my silence" climb — bottom of the rhythm for anyone on the
          ladder (self-gates to null otherwise). Only on the Daily Progress page
          (showStreak), NOT the home; the Contemplation page renders it directly. */}
      {showStreak && <SilenceLadderCard className="mt-4" />}

      {/* Log popup for a custom practice — a reading logs an amount
          (chapter/page/time); a plain practice is just Done / Not today.
          "walk" is a sentinel id, not a real custom anchor: it reuses this
          exact same sheet (owner: it should work like a custom practice)
          via onLog/onSkip overrides rather than markCustomDoneToday/
          setCustomNotToday, since it's a built-in OptionalPractice, not a
          user-created anchor. */}
      {logAnchorId && SENTINEL_PRACTICES[logAnchorId] ? (
        <LogSheet
          anchor={{ id: logAnchorId, title: SENTINEL_PRACTICES[logAnchorId].title(t), emoji: SENTINEL_PRACTICES[logAnchorId].emoji }}
          onClose={() => setLogAnchorId(null)}
          t={t}
          onLog={() => markPracticeDoneToday(logAnchorId as OptionalPractice)}
          onSkip={() => setPracticeNotToday(logAnchorId as OptionalPractice)}
        />
      ) : logAnchorId && (() => {
        const a = customAnchors.find((x) => x.id === logAnchorId);
        if (!a) return null;
        return <LogSheet anchor={a} onClose={() => setLogAnchorId(null)} t={t} />;
      })()}

      {/* Tapping the ✓ on a Done card opens this instead of navigating —
          Unlog puts it back in Next, Cancel just closes. */}
      {unlogTarget && (
        <UnlogSheet
          title={unlogTarget.title}
          emoji={unlogTarget.emoji}
          onClose={() => setUnlogTarget(null)}
          onUnlog={() => { unlogTarget.onUnlog(); setUnlogTarget(null); }}
          t={t}
        />
      )}
    </div>
  );
}

// UnlogSheet — the same bottom-sheet shell as LogSheet (visually), for the
// opposite moment: confirming you want to take a DONE card back out of Done
// and into Next. Deliberately just two choices, no stepper — undoing a
// reading amount isn't this popup's job, it only clears the done flag.
function UnlogSheet({
  title, emoji, onClose, onUnlog, t,
}: {
  title: string; emoji: string; onClose: () => void; onUnlog: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: "rgba(6,18,11,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-full"
        style={{ maxWidth: 460, margin: "0 10px", background: "rgba(6,18,11,0.62)", backdropFilter: "blur(14.4px)", WebkitBackdropFilter: "blur(14.4px)", border: "1px solid rgba(111,175,133,0.25)", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <span style={{ fontSize: 26 }}>{emoji || "✅"}</span>
          <p className="text-[17px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
        </div>

        <button
          type="button"
          onClick={onUnlog}
          className="w-full rounded-2xl py-3.5 text-[15px] font-semibold active:scale-[0.99]"
          style={{ background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
        >
          {t("rhythm.unlog", { defaultValue: "Unlog" })}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl py-3 mt-2 text-[14px] font-semibold active:scale-[0.99]"
          style={{ background: "transparent", color: "rgba(182,210,188,0.85)", border: "1px solid rgba(143,175,150,0.3)", fontFamily: FONT }}
        >
          {t("common.cancel", { defaultValue: "Cancel" })}
        </button>
      </div>
    </div>
  );
}

// LogSheet — the bottom-sheet that records today's log for a custom anchor.
// Plain anchors get Done / Not today. Reading rituals get a number stepper in
// their unit (with the daily goal pre-filled and a running total for context),
// a Log button, and Not today.
//
// onLog/onSkip let a caller override what "Done" / "Not today" actually DO,
// defaulting to markCustomDoneToday/setCustomNotToday when omitted (every
// existing custom-anchor call site keeps working unchanged). Contemplative
// Walk reuses this exact sheet via these overrides — it's a built-in
// OptionalPractice, not a user-created custom anchor, so it needs
// markPracticeDoneToday/unmarkPracticeDoneToday instead, but should look and
// behave identically (owner: "it should work like a custom practice").
function LogSheet({
  anchor,
  onClose,
  t,
  onLog,
  onSkip,
}: {
  anchor: { id: string; title: string; emoji: string; reading?: ReadingConfig };
  onClose: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
  onLog?: () => void;
  onSkip?: () => void;
}) {
  const reading = anchor.reading;
  const loggedToday = reading ? getReadingToday(anchor.id) : 0;
  const total = reading ? getReadingTotal(anchor.id) : 0;
  // Seed the stepper from what's already logged today, else the goal, else 1.
  const [amount, setAmount] = useState<number>(
    loggedToday > 0 ? loggedToday : reading?.goal && reading.goal > 0 ? reading.goal : 1,
  );
  const unit = reading?.unit ?? "chapter";
  const isTime = unit === "minute";
  const stepBy = isTime ? 5 : 1;
  const bump = (d: number) => setAmount((n) => Math.max(0, n + d));

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: "rgba(6,18,11,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-full"
        style={{ maxWidth: 460, margin: "0 10px", background: "rgba(6,18,11,0.62)", backdropFilter: "blur(14.4px)", WebkitBackdropFilter: "blur(14.4px)", border: "1px solid rgba(111,175,133,0.25)", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <span style={{ fontSize: 26 }}>{anchor.emoji || (reading ? "📖" : "✅")}</span>
          <p className="text-[17px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{anchor.title}</p>
        </div>

        {reading ? (
          <>
            <p className="text-[12.5px] mb-2" style={{ color: SAGE, fontFamily: FONT }}>
              {isTime
                ? t("rhythm.read_how_long", { defaultValue: "How long did you read today?" })
                : t("rhythm.read_how_much", { defaultValue: `How much did you read today?` })}
            </p>
            {/* − [n unit] + stepper */}
            <div className="flex items-center justify-center gap-4 mb-1.5">
              <button
                type="button"
                onClick={() => bump(-stepBy)}
                aria-label={t("common.decrease", { defaultValue: "Decrease" })}
                className="rounded-full flex items-center justify-center active:scale-[0.95]"
                style={{ width: 44, height: 44, background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)", color: WARM, fontSize: 22, fontFamily: FONT }}
              >−</button>
              <div className="text-center" style={{ minWidth: 120 }}>
                <span className="text-[30px] font-bold" style={{ color: WARM, fontFamily: FONT }}>{amount}</span>
                <span className="text-[14px] ml-1.5" style={{ color: SAGE, fontFamily: FONT }}>{readingUnitLabel(unit, amount)}</span>
              </div>
              <button
                type="button"
                onClick={() => bump(stepBy)}
                aria-label={t("common.increase", { defaultValue: "Increase" })}
                className="rounded-full flex items-center justify-center active:scale-[0.95]"
                style={{ width: 44, height: 44, background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)", color: WARM, fontSize: 22, fontFamily: FONT }}
              >+</button>
            </div>
            {/* Running total — where they've read up to so far. */}
            {(total > 0 || loggedToday > 0) && (
              <p className="text-[12px] text-center mb-3" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
                {t("rhythm.read_total", {
                  amount: total - loggedToday + amount,
                  unit: readingUnitLabel(unit, total - loggedToday + amount),
                  defaultValue: `${total - loggedToday + amount} ${readingUnitLabel(unit, total - loggedToday + amount)} in all`,
                })}
              </p>
            )}
            <button
              type="button"
              disabled={amount <= 0}
              onClick={() => { if (amount > 0) { logReadingToday(anchor.id, amount); onClose(); } }}
              className="w-full rounded-2xl py-3.5 mt-1 text-[15px] font-semibold active:scale-[0.99] disabled:opacity-40"
              style={{ background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
            >
              ✓ {t("rhythm.log_reading", { defaultValue: "Log it" })}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => { (onLog ?? (() => markCustomDoneToday(anchor.id)))(); onClose(); }}
            className="w-full rounded-2xl py-3.5 text-[15px] font-semibold active:scale-[0.99]"
            style={{ background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
          >
            ✓ {t("rhythm.log_done", { defaultValue: "Done" })}
          </button>
        )}

        <button
          type="button"
          onClick={() => { (onSkip ?? (() => setCustomNotToday(anchor.id)))(); onClose(); }}
          className="w-full rounded-2xl py-3 mt-2 text-[14px] font-semibold active:scale-[0.99]"
          style={{ background: "transparent", color: "rgba(182,210,188,0.85)", border: "1px solid rgba(143,175,150,0.3)", fontFamily: FONT }}
        >
          {t("rhythm.log_not_today", { defaultValue: "Not today" })}
        </button>
      </div>
    </div>
  );
}

