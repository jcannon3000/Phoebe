/**
 * DailyProgressBody — the rhythm content of the /daily-progress page: the four
 * (+optional) practice anchors split into "Next" and "Done", plus the streak
 * card. Extracted so it can be reused as the home screen body for beta users
 * (the home becomes the daily-progress view) without duplicating the cards.
 *
 * Page chrome (back link, title, Customize) stays in daily-progress.tsx; this
 * is just the cards + streak.
 */

import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { useEffectiveReflectionSource, type ReflectionSource } from "@/lib/officePrefs";
import { BookOfficeLogRow } from "@/components/BookOfficeLogRow";
import { CAC_TODAY_URL, markCacRead, FDD_TODAY_URL, markFddRead, SSJE_TODAY_URL, markSsjeRead } from "@/lib/cacReadState";
import { openExternal } from "@/lib/openExternal";
import { markCustomDoneToday, setCustomNotToday, logReadingToday, getReadingToday, getReadingTotal, readingUnitLabel, getCustomAnchors, getCustomDoneDays, getJournalingSlot, CUSTOM_ANCHORS_EVENT, CUSTOM_DONE_EVENT, type CustomSlot, type ReadingConfig } from "@/lib/customAnchors";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";

const PUBLICATION_NAME: Record<Exclude<ReflectionSource, "none">, string> = {
  fdd: "Forward Day by Day",
  ssje: "Brother, Give Us a Word",
  cac: "CAC Daily Meditation",
};

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
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
  const a = (0.30 + 0.10 * t).toFixed(3);
  return `rgba(${r},${g},${b},${a})`;
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
  if (!data) return null;
  const { days, streak, last7 } = data;
  const GREEN = "46,107,64";
  const GREEN_BRIGHT = "110,180,130";
  return (
    <div
      className="relative flex rounded-2xl overflow-hidden mt-6"
      style={{ background: "rgba(22,46,32,0.34)", backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)", border: `1px solid rgba(${GREEN},0.26)` }}
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
  const { morningActive, eveningActive, silenceActive, reflectActive, listeningActive, gratitudeActive, examenActive, journalingActive } = useRhythmState();
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  })();
  type Day = { ymd: string; morning: boolean; evening: boolean; contemplation: boolean; reflection: boolean; listening: boolean; gratitude: boolean; examen: boolean; journaling: boolean };
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
  const CUSTOM_PALETTE = ["46,107,64", "96,141,209", "62,124,122", "124,116,196", "108,162,124", "150,120,180"];
  const rows: Array<{ id: string; emoji: string; label: string; rgb: string; doneFor: (d: Day) => boolean }> = [
    ...(morningActive ? [{ id: "morning", emoji: "🌅", label: t("rhythm.row_morning", { defaultValue: "Morning" }), rgb: "46,107,64", doneFor: (d: Day) => !!d.morning }] : []),
    // Reflection rides right after Morning Prayer — it's the second beat of the
    // day — and stays ahead of Contemplation, matching the card order below.
    ...(reflectActive ? [{ id: "reflection", emoji: "📖", label: t("rhythm.row_reflection", { defaultValue: "Reflection" }), rgb: "96,141,209", doneFor: (d: Day) => !!d.reflection }] : []),
    ...(silenceActive ? [{ id: "contemplation", emoji: "🕯️", label: t("rhythm.row_contemplation", { defaultValue: "Contemplation" }), rgb: "62,124,122", doneFor: (d: Day) => !!d.contemplation }] : []),
    ...(listeningActive ? [{ id: "listening", emoji: "🎧", label: t("rhythm.row_listening", { defaultValue: "Audio Divina" }), rgb: "108,140,180", doneFor: (d: Day) => !!d.listening }] : []),
    ...(eveningActive ? [{ id: "evening", emoji: "🌙", label: t("rhythm.row_evening", { defaultValue: "Evening" }), rgb: "124,116,196", doneFor: (d: Day) => !!d.evening }] : []),
    ...(gratitudeActive ? [{ id: "gratitude", emoji: "🙏", label: t("rhythm.row_gratitude", { defaultValue: "Gratitude" }), rgb: "108,162,124", doneFor: (d: Day) => !!d.gratitude }] : []),
    ...(examenActive ? [{ id: "examen", emoji: "🌗", label: t("rhythm.row_examen", { defaultValue: "Examen" }), rgb: "150,120,180", doneFor: (d: Day) => !!d.examen }] : []),
    ...(journalingActive ? [{ id: "journaling", emoji: "📓", label: t("rhythm.row_journaling", { defaultValue: "Journaling" }), rgb: "120,150,170", doneFor: (d: Day) => !!d.journaling }] : []),
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
    return ["S", "M", "T", "W", "T", "F", "S"][wd];
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
              {rows.map((row) => (
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
                            background: done ? `rgba(${row.rgb},0.95)` : "rgba(143,175,150,0.13)",
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
function PracticeCard({
  href, emoji, title, blurb, blurbCycle, cta, done, rgb, later, laterLabel, progress, hero, onClick, doneCta, pulse, tint = 0.4,
}: {
  href: string; emoji: string; title: string; blurb: string; cta: string; done: boolean; rgb: string;
  /** Position in the routine card stack (0 = top/lightest → 1 = bottom/darkest),
   *  driving the subtle card-background lightness ramp. */
  tint?: number;
  later?: boolean; laterLabel?: string;
  progress?: { current: number; goal: number };
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
}) {
  const waiting = !!later && !done;
  // Cycle the subtitle whenever a cycle is supplied — including on a DONE card
  // (so the reflection keeps flipping its publication name ↔ today's title even
  // after it's read). Cards that shouldn't cycle when done simply pass no cycle.
  const useCycle = !!blurbCycle && blurbCycle.length > 1;

  // Hero layout — a bigger, more prominent card for the next anchor, whatever
  // practice it happens to be.
  if (hero) {
    const heroCta = waiting ? (
      <span className="inline-flex rounded-full text-[13px] font-medium px-5 py-2.5" style={{ background: "transparent", color: "rgba(182,210,188,0.5)", border: "1px solid rgba(143,175,150,0.22)" }}>
        {laterLabel}
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full text-[14px] font-semibold px-6 py-2.5" style={{ background: `rgba(${rgb},0.85)`, color: WARM, fontFamily: FONT }}>
        {cta} <span aria-hidden className="ml-1">→</span>
      </span>
    );
    const heroRow = (
      <div
        className={`relative flex rounded-3xl overflow-hidden ${waiting ? "" : "transition-opacity hover:opacity-95 active:scale-[0.99]"}`}
        style={{ background: cardTintBg(tint), backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)", border: `1px solid ${CARD_BORDER}`, opacity: waiting ? 0.8 : 1 }}
      >
        <div className="w-1.5 flex-shrink-0" style={{ background: `rgba(${rgb},${waiting ? 0.4 : 0.72})` }} />
        <div className="flex-1 px-5 py-5">
          <div className="flex items-start gap-3.5">
            {emoji ? <span className="text-[34px] leading-none flex-shrink-0">{emoji}</span> : null}
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-[22px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
              {useCycle
                ? <CardSubtitleCycle values={blurbCycle!} className="text-[13.5px] mt-1 leading-snug" style={{ color: SAGE }} />
                : <p className="text-[13.5px] mt-1 leading-snug" style={{ color: SAGE }}>{blurb}</p>}
            </div>
            {/* CTA on the top-right, aligned with the title — same placement as
                the compact cards. */}
            <div className="flex-shrink-0">{heroCta}</div>
          </div>
          {progress && progress.goal > 0 && !done && (
            <div className="mt-3.5 rounded-full overflow-hidden" style={{ height: 5, background: "rgba(143,175,150,0.16)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, Math.round((progress.current / progress.goal) * 100))}%`, background: `rgba(${rgb},0.85)`, transition: "width 0.3s" }}
              />
            </div>
          )}
        </div>
      </div>
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

  const pill = done ? (
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
        className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
        style={{ background: `rgba(${rgb},0.18)`, color: "rgba(240,237,230,0.85)", border: `1px solid rgba(${rgb},0.45)` }}
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
      className={`relative flex rounded-3xl overflow-hidden ${waiting ? "" : "transition-opacity hover:opacity-90 active:scale-[0.99]"}`}
      style={{ background: cardTintBg(tint), backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)", border: `1px solid ${restBorder}`, opacity: waiting ? 0.72 : 1 }}
      animate={pulse ? { borderColor: [restBorder, `rgba(${rgb},0.55)`, restBorder] } : undefined}
      transition={pulse ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${rgb},${waiting ? 0.4 : 0.7})` }} />
      <div className="flex-1 min-w-0 px-4 py-3.5">
        <div className="flex items-center gap-3">
          {emoji ? <span className="text-xl flex-shrink-0">{emoji}</span> : null}
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
            {useCycle
              ? <CardSubtitleCycle values={blurbCycle!} className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: SAGE }} />
              : <p className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: SAGE }}>{blurb}</p>}
          </div>
          {pill}
        </div>
        {/* Progress bar spans the full width below the row — so "Begin" sits
            above it rather than beside it. Hidden once the card is DONE (a full
            bar under a ✓ is just noise). */}
        {progress && progress.goal > 0 && !done && (
          <div className="mt-3 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(143,175,150,0.16)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, Math.round((progress.current / progress.goal) * 100))}%`, background: `rgba(${rgb},0.85)`, transition: "width 0.3s" }}
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

export function DailyProgressBody({ showStreak = true, showDone, renderOfficeHero, leadCard }: { showStreak?: boolean; showDone?: boolean; renderOfficeHero?: (side: "morning" | "evening") => ReactNode; leadCard?: ReactNode }) {
  const { t } = useTranslation();
  const { ready, morningDone, reflectDone, silenceDone, eveningDone, eveningActive, morningActive, silenceActive, reflectActive, reflections, prayerKind, contemplationMin, contemplationGoalMin, gratitudeActive, examenActive, listeningActive, journalingActive, gratitudeDone, examenDone, listeningDone, journalingDone, customAnchors } = useRhythmState();
  const hour = new Date().getHours();
  // The custom-practice "Log" popup — which anchor's popup is open (by id).
  const [logAnchorId, setLogAnchorId] = useState<string | null>(null);
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
  // Office/devotion subtitle leads with the descriptive line, then flips
  // between the two things you carry in.
  const morningBlurb = t("rhythm.blurb_morning", { defaultValue: "Begin the day with the office" });
  const eveningBlurb = t("rhythm.blurb_evening", { defaultValue: "Mark the day's end with the office" });
  const officeCycle = [
    t("rhythm.from_bcp", { defaultValue: "From the Book of Common Prayer" }),
    t("rhythm.with_community", { defaultValue: "with community prayers" }),
  ];
  // Whenever there's a minute goal, show progress toward it ("12 of 20 min
  // today") — even once it's met — so the card always reads as minutes-of-goal.
  // Only with no goal set does it fall back to "Kept today" / the blurb.
  const contemplationBlurb = contemplationGoalMin > 0
    ? t("rhythm.contemplation_progress", { current: contemplationMin, goal: contemplationGoalMin, defaultValue: `${contemplationMin} of ${contemplationGoalMin} min today` })
    : silenceDone
      ? kept
      : t("rhythm.blurb_silence", { defaultValue: "Sit, or cobreathe for justice" });

  const officeTitle = (side: "Morning" | "Evening") =>
    prayerKind === "community"
      ? t("rhythm.card_community", { defaultValue: "Pray together" })
      : prayerKind === "devotion"
        ? t(`rhythm.card_${side.toLowerCase()}_devotion`, { defaultValue: `${side} Devotion` })
        : t(`rhythm.card_${side.toLowerCase()}`, { defaultValue: `${side} Prayer` });

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
      title: a.title,
      blurb,
      cta: t("rhythm.log", { defaultValue: "Log" }), later: false,
    };
  };
  // "Not today" customs are hidden for the day (not shown under Done).
  const customsForSlot = (slot: CustomSlot) => customAnchors.filter((a) => a.slot === slot && !a.skipped).map(customCard);

  // Journaling is a LOG-only practice — you keep it however you like (a notebook,
  // paper) and tap to mark the day, like a daily walk. No in-app typing (the
  // /journal page stays separate). It slots into the rhythm at the time of day
  // the user chose (getJournalingSlot), so it sits near that part of the day.
  const journalingSlot = getJournalingSlot();
  const journalingCard = {
    key: "journaling", emoji: "📓", rgb: "120,150,170", done: journalingDone, href: "",
    onClick: () => markPracticeDoneToday("journaling"),
    title: t("rhythm.card_journaling", { defaultValue: "Journaling" }),
    blurb: journalingDone ? kept : t("rhythm.blurb_journaling", { defaultValue: "Kept however you like — tap to log" }),
    cta: t("rhythm.log", { defaultValue: "Log" }), later: false,
  };
  const journalingForSlot = (slot: CustomSlot) => (journalingActive && journalingSlot === slot) ? [journalingCard] : [];

  const cards = [
    ...(morningActive ? [{
      key: "morning", emoji: "🌅", rgb: "46,107,64", done: morningDone, href: "/begin-prayer?side=morning",
      title: officeTitle("Morning"),
      blurb: morningDone ? prayed : morningBlurb,
      blurbCycle: morningDone ? undefined : [morningBlurb, ...officeCycle],
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    }] : []),
    ...journalingForSlot("morning"),
    ...customsForSlot("morning"),
    // One card per reflection newsletter the user follows — each its own card +
    // dot, opening that source's reading directly (and marking it read).
    ...reflections.map((r) => {
      const url = r.source === "cac" ? CAC_TODAY_URL : r.source === "fdd" ? FDD_TODAY_URL : SSJE_TODAY_URL;
      const mark = r.source === "cac" ? markCacRead : r.source === "fdd" ? markFddRead : markSsjeRead;
      return {
        key: `reflect-${r.source}`, emoji: "📖", rgb: "96,141,209", done: r.done, href: "",
        title: PUBLICATION_NAME[r.source],
        blurb: r.done ? kept : t("rhythm.blurb_reflect", { defaultValue: "A few minutes with the day's word" }),
        // CAC with a scraped title flips between the publication name + today's title.
        blurbCycle: (r.source === "cac" && cacTitle) ? [PUBLICATION_NAME.cac, cacTitle] : undefined,
        onClick: () => { mark(); openExternal(url); },
        cta: t("rhythm.read", { defaultValue: "Read" }), later: false,
      };
    }),
    ...(silenceActive ? [{
      key: "silence", emoji: "🕯️", rgb: "62,124,122", done: silenceDone,
      // Always open the begin slide (length, Start contemplation, Cobreathe) —
      // never skip straight into Cobreathe, even when that's the saved style.
      // Choosing Cobreathe there leads to its own in-person options slide.
      href: "/contemplation?begin=1",
      title: t("rhythm.card_contemplation", { defaultValue: "Contemplation" }),
      blurb: contemplationBlurb,
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
      // When done, show a plain ✓ like the other anchors — no "Sit again" pill.
      progress: { current: contemplationMin, goal: contemplationGoalMin },
    }] : []),
    ...(listeningActive ? [{
      key: "listening", emoji: "🎧", rgb: "108,140,180", done: listeningDone, href: "/listening",
      title: t("rhythm.card_listening", { defaultValue: "Audio Divina" }),
      blurb: listeningDone ? kept : t("rhythm.blurb_listening", { defaultValue: "Music as a way of prayer" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    }] : []),
    ...journalingForSlot("midday"),
    ...customsForSlot("midday"),
    ...(gratitudeActive ? [{
      key: "gratitude", emoji: "🙏", rgb: "108,162,124", done: gratitudeDone, href: "/gratitude",
      title: t("rhythm.card_gratitude", { defaultValue: "Gratitude" }),
      blurb: gratitudeDone ? kept : t("rhythm.blurb_gratitude", { defaultValue: "Name a gift from today" }),
      cta: t("rhythm.write", { defaultValue: "Write" }), later: false,
    }] : []),
    ...(examenActive ? [{
      key: "examen", emoji: "🌗", rgb: "150,120,180", done: examenDone, href: "/examen",
      title: t("rhythm.card_examen", { defaultValue: "The Examen" }),
      blurb: examenDone ? kept : t("rhythm.blurb_examen", { defaultValue: "Review the day with God" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    }] : []),
    // Afternoon custom practices sit after the day's optional practices.
    ...journalingForSlot("afternoon"),
    ...customsForSlot("afternoon"),
    ...(eveningActive ? [{
      // Evening sits last and stays a quiet "later" card until 3 PM, so the
      // morning rhythm (reflection → contemplation) leads the day; from 3 PM on
      // it becomes the office hero. Opt-in — off by default (evening pref
      // "none"), so an un-set-up user has three anchors, not four.
      key: "evening", emoji: "🌙", rgb: "124,116,196", done: eveningDone, href: "/begin-prayer?side=evening",
      title: hour >= 20 ? t("rhythm.card_close", { defaultValue: "Close the day" }) : officeTitle("Evening"),
      // After 8 PM the title is "Close the day"; the second line names the actual
      // evening method (Evening Prayer / Evening Devotion / Pray together).
      blurb: eveningDone
        ? prayed
        : hour >= 20 ? officeTitle("Evening") : t("rhythm.blurb_evening", { defaultValue: "Mark the day's end with the office" }),
      blurbCycle: (eveningDone || hour >= 20) ? undefined : [eveningBlurb, ...officeCycle],
      cta: t("rhythm.begin", { defaultValue: "Begin" }),
      later: hour < 15,
    }] : []),
    ...journalingForSlot("evening"),
    ...customsForSlot("evening"),
  ];

  // When a dedicated office hero is supplied (the beta home), the office shows
  // as that full hero instead of a practice row. The hero is the next office to
  // pray: morning while it's still undone, otherwise evening. We drop the hero's
  // side from the rows; the OTHER side stays as a small row (e.g. evening drops
  // small in the list when morning isn't done yet).
  // Morning leads as the office hero until it's prayed. After morning, the day
  // belongs to reflection → contemplation (small cards); the evening office
  // stays a quiet "later" card and only becomes the hero from 3 PM on.
  const heroSide: "morning" | "evening" | null =
    (morningActive && !morningDone) ? "morning"
    : (eveningActive && hour >= 15 && !eveningDone) ? "evening"
    : null;
  const showOfficeHero = !!renderOfficeHero && heroSide !== null;
  const officeHero = showOfficeHero ? renderOfficeHero!(heroSide!) : null;
  // Shade each card along the green→purple ramp by its position in the FULL day
  // order (so a card keeps its colour whether it's Next or Done, and the ramp
  // doesn't reshuffle as things get kept). The office hero keeps its own colour.
  const coloredCards = cards.map((c, i) => ({ ...c, rgb: rhythmGradientRgb(i, cards.length) }));
  const visibleCards = showOfficeHero
    ? coloredCards.filter((c) => c.key !== heroSide)
    : coloredCards;

  // Split into Next (to-do) and Done, then fade each card up in a gentle
  // stagger on mount. (The earlier "fly the card from Next into Done" replay —
  // built on framer-motion layout + popLayout — glitched, so it's gone: on
  // return the finished card simply renders in Done with the same clean fade.)
  const upcomingDisplay = visibleCards.filter((c) => !c.done);
  // Everything kept today stays in the Done section all day — until the whole
  // day's rhythm is complete — so the home always reflects what's been prayed.
  // (We used to drop Morning Prayer + the reflection after noon; that made the
  // Done section quietly empty out as the day went on.)
  const completedDisplay = visibleCards.filter((c) => c.done);
  const showDoneSection = (showStreak || showDone) && completedDisplay.length > 0;

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
    lead.key === "evening" ? hour >= 17
    : lead.key === "contemplation" ? !(contemplationGoalMin > 0 && contemplationMin > contemplationGoalMin * 0.5 && hour < 15)
    : true
  );

  // A subtle lightness ramp across the WHOLE routine stack (Next then Done) —
  // the top card sits a touch lighter, easing a touch darker toward the bottom.
  const stackCount = upcomingDisplay.length + completedDisplay.length;
  const tintFor = (globalIdx: number) => (stackCount <= 1 ? 0.4 : globalIdx / (stackCount - 1));

  const renderCard = (c: (typeof cards)[number], pulse = false, tint = 0.4) => (
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
      laterLabel={t("rhythm.later", { defaultValue: "Later" })}
      progress={"progress" in c ? c.progress : undefined}
      blurbCycle={"blurbCycle" in c ? c.blurbCycle : undefined}
      onClick={"onClick" in c ? c.onClick : undefined}
      doneCta={(c as { doneCta?: string }).doneCta}
      pulse={pulse}
    />
  );

  // Gentle staggered fade-up — each card rises in just after the one above it.
  // A clear cascade: a touch more travel + a longer per-card gap so the cards
  // visibly load one after another rather than appearing all at once.
  const enterUp = (i: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const, delay: Math.min(i * 0.18, 1.1) },
  });

  // Hold the first paint until the rhythm queries have settled (so cards don't
  // jump from Next to Done as data lands), then fade each card up in turn.
  if (!ready) return null;

  // Gap above Done: when Next still has cards, a smaller gap reads right; when
  // the hero (or nothing) is the only thing in Next it needs more breathing room.
  const doneGapCls = !(upcomingDisplay.length > 0 || officeHero) ? ""
    : upcomingDisplay.length > 0 ? "mt-4" : "mt-8";

  return (
    <div>
      {/* A prayer-requests card leads the whole thing when there's something
          waiting. */}
      {leadCard && <motion.div {...enterUp(0)} className="mb-3">{leadCard}</motion.div>}
      {(upcomingDisplay.length > 0 || officeHero) && (
        <>
          {sectionHeader(t("daily_progress.next_heading", { defaultValue: "Next" }))}
          <div className="flex flex-col gap-2">
            {/* The office hero leads the Next list — above Contemplation. */}
            {officeHero && <motion.div {...enterUp(0)}>{officeHero}</motion.div>}
            {/* Praying this office from the physical book? A one-tap log sits
                right under the card — no need to open the page guide. */}
            {officeHero && heroSide && (
              <BookOfficeLogRow side={heroSide} done={heroSide === "morning" ? morningDone : eveningDone} />
            )}
            {upcomingDisplay.map((c, i) => (
              <motion.div key={c.key} {...enterUp(i + (officeHero ? 1 : 0))}>
                {renderCard(c, i === 0 && leadPulse, tintFor(i))}
              </motion.div>
            ))}
          </div>
        </>
      )}
      {/* The "Done" list lives on the Daily Progress page (showStreak) and on the
          home (showDone). */}
      {showDoneSection && (
        <div className={doneGapCls}>
          {sectionHeader(t("daily_progress.done_heading", { defaultValue: "Done" }))}
          <div className="flex flex-col gap-2">
            {completedDisplay.map((c, i) => (
              <motion.div key={c.key} {...enterUp(i)}>
                {renderCard(c, false, tintFor(upcomingDisplay.length + i))}
              </motion.div>
            ))}
          </div>
        </div>
      )}
      {/* The weekly practice grid sits under the daily cards on the daily-
          progress page. Hidden on the home, where showStreak is false. */}
      {showStreak && (
        <motion.div {...enterUp(0)} className="mt-6">
          {sectionHeader(t("daily_progress.weekly_progress_heading", { defaultValue: "Weekly progress" }))}
          <WeeklyGridCard />
        </motion.div>
      )}

      {/* Log popup for a custom practice — a reading logs an amount
          (chapter/page/time); a plain practice is just Done / Not today. */}
      {logAnchorId && (() => {
        const a = customAnchors.find((x) => x.id === logAnchorId);
        if (!a) return null;
        return <LogSheet anchor={a} onClose={() => setLogAnchorId(null)} t={t} />;
      })()}
    </div>
  );
}

// LogSheet — the bottom-sheet that records today's log for a custom anchor.
// Plain anchors get Done / Not today. Reading rituals get a number stepper in
// their unit (with the daily goal pre-filled and a running total for context),
// a Log button, and Not today.
function LogSheet({
  anchor,
  onClose,
  t,
}: {
  anchor: { id: string; title: string; emoji: string; reading?: ReadingConfig };
  onClose: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
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
        style={{ maxWidth: 460, margin: "0 10px", background: "#0F2618", border: "1px solid rgba(111,175,133,0.25)", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
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
            onClick={() => { markCustomDoneToday(anchor.id); onClose(); }}
            className="w-full rounded-2xl py-3.5 text-[15px] font-semibold active:scale-[0.99]"
            style={{ background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
          >
            ✓ {t("rhythm.log_done", { defaultValue: "Done" })}
          </button>
        )}

        <button
          type="button"
          onClick={() => { setCustomNotToday(anchor.id); onClose(); }}
          className="w-full rounded-2xl py-3 mt-2 text-[14px] font-semibold active:scale-[0.99]"
          style={{ background: "transparent", color: "rgba(182,210,188,0.85)", border: "1px solid rgba(143,175,150,0.3)", fontFamily: FONT }}
        >
          {t("rhythm.log_not_today", { defaultValue: "Not today" })}
        </button>
      </div>
    </div>
  );
}
