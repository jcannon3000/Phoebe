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
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { useEffectiveReflectionSource, type ReflectionSource } from "@/lib/officePrefs";
import { CAC_TODAY_URL, markCacRead } from "@/lib/cacReadState";
import { openExternal } from "@/lib/openExternal";

const PUBLICATION_NAME: Record<Exclude<ReflectionSource, "none">, string> = {
  fdd: "Forward Day by Day",
  ssje: "Brother, Give Us a Word",
  cac: "CAC Daily Meditation",
};

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Staggered fade-up for the daily cards — each card rises in just after the one
// above it, instead of the whole block flashing on as one opacity step.
const fadeContainer = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } } };
const fadeItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const } },
};

// A card subtitle that gently cross-fades between a few values (opacity only,
// no movement — the same crossfade the worship card uses). An invisible spacer
// of the longest value reserves the height, so the swap never nudges the
// content below.
function CardSubtitleCycle({ values, className, style }: { values: string[]; className?: string; style?: CSSProperties }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (values.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % values.length), 5000);
    return () => clearInterval(t);
  }, [values.length]);
  const current = values[idx % values.length] ?? "";
  const longest = values.reduce((a, b) => (b.length > a.length ? b : a), values[0] ?? "");
  return (
    <span className={className} style={{ position: "relative", display: "block", ...style }}>
      <span aria-hidden style={{ visibility: "hidden" }}>{longest}</span>
      <span style={{ position: "absolute", inset: 0 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={current}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: "easeInOut" }}
            style={{ display: "block" }}
          >
            {current}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
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
  const AMBER = "193,127,36";
  const GREEN = "46,107,64";
  const GREEN_BRIGHT = "110,180,130";
  return (
    <div
      className="relative flex rounded-2xl overflow-hidden mt-6"
      style={{ background: `rgba(${GREEN},0.10)`, border: `1px solid rgba(${GREEN},0.24)` }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${AMBER},0.85)` }} />
      <div className="flex-1 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl flex-shrink-0">🔥</span>
          <p className="flex-1 min-w-0 leading-none" style={{ color: "#E8B45E", fontFamily: FONT, fontSize: 26, fontWeight: 700 }}>
            {streak}
            <span className="text-[13px] font-semibold ml-2" style={{ color: "#D9A45B" }}>
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
function WeeklyGridCard() {
  const { t } = useTranslation();
  const { gratitudeActive, examenActive } = useRhythmState();
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  })();
  type Day = { ymd: string; morning: boolean; evening: boolean; contemplation: boolean; reflection: boolean; gratitude: boolean; examen: boolean };
  const { data } = useQuery<{ days: Day[] }>({
    queryKey: ["/api/me/practice-week", tz],
    queryFn: () => apiRequest("GET", "/api/me/practice-week"),
    staleTime: 60_000,
  });
  if (!data || !data.days?.length) return null;
  const { days } = data;

  const rows: Array<{ key: keyof Day; emoji: string; label: string; rgb: string }> = [
    { key: "morning", emoji: "🌅", label: t("rhythm.row_morning", { defaultValue: "Morning" }), rgb: "46,107,64" },
    { key: "contemplation", emoji: "🕯️", label: t("rhythm.row_contemplation", { defaultValue: "Contemplation" }), rgb: "62,124,122" },
    { key: "reflection", emoji: "📖", label: t("rhythm.row_reflection", { defaultValue: "Reflection" }), rgb: "96,141,209" },
    { key: "evening", emoji: "🌙", label: t("rhythm.row_evening", { defaultValue: "Evening" }), rgb: "124,116,196" },
    ...(gratitudeActive ? [{ key: "gratitude" as const, emoji: "🙏", label: t("rhythm.row_gratitude", { defaultValue: "Gratitude" }), rgb: "182,140,90" }] : []),
    ...(examenActive ? [{ key: "examen" as const, emoji: "🌗", label: t("rhythm.row_examen", { defaultValue: "Examen" }), rgb: "150,120,180" }] : []),
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
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
        {t("rhythm.week_grid_title", { defaultValue: "This week" })}
      </p>
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
                <div key={row.key} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                  <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                    <span className="text-[13px] leading-none flex-shrink-0">{row.emoji}</span>
                    <span className="text-[12.5px] font-medium truncate" style={{ color: WARM, fontFamily: FONT }}>{row.label}</span>
                  </div>
                  {days.map((d, i) => {
                    const done = !!d[row.key];
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
  href, emoji, title, blurb, blurbCycle, cta, done, rgb, later, laterLabel, progress, hero, onClick,
}: {
  href: string; emoji: string; title: string; blurb: string; cta: string; done: boolean; rgb: string;
  later?: boolean; laterLabel?: string;
  progress?: { current: number; goal: number };
  /** When set, the card runs this instead of navigating to `href` — e.g. the
   *  CAC reflection opens the meditation directly in the in-app browser. */
  onClick?: () => void;
  /** When set (and not done), the subtitle cross-fades between these values
   *  instead of showing the static blurb. */
  blurbCycle?: string[];
  /** Render the larger "what's next" hero layout — big emoji + title and a
   *  prominent CTA button. Used for the first card under Next. */
  hero?: boolean;
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
        style={{ background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.42)`, opacity: waiting ? 0.8 : 1 }}
      >
        <div className="w-1.5 flex-shrink-0" style={{ background: `rgba(${rgb},${waiting ? 0.4 : 0.9})` }} />
        <div className="flex-1 px-5 py-5">
          <div className="flex items-start gap-3.5">
            <span className="text-[34px] leading-none flex-shrink-0">{emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[22px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
              {useCycle
                ? <CardSubtitleCycle values={blurbCycle!} className="text-[13.5px] mt-1 leading-snug" style={{ color: SAGE }} />
                : <p className="text-[13.5px] mt-1 leading-snug" style={{ color: SAGE }}>{blurb}</p>}
            </div>
            {/* CTA on the top-right, aligned with the title — same placement as
                the compact cards. */}
            <div className="flex-shrink-0">{heroCta}</div>
          </div>
          {progress && progress.goal > 0 && (
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
    if (onClick) return <button type="button" onClick={onClick} className="block w-full text-left">{heroRow}</button>;
    return <Link href={href} className="block">{heroRow}</Link>;
  }

  const pill = done ? (
    <span
      className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
      style={{ background: `rgba(${rgb},0.18)`, color: "rgba(240,237,230,0.85)", border: `1px solid rgba(${rgb},0.45)` }}
    >✓</span>
  ) : waiting ? (
    <span
      className="flex-shrink-0 rounded-full text-[12px] font-medium px-3.5 py-1.5"
      style={{ background: "transparent", color: "rgba(182,210,188,0.5)", border: "1px solid rgba(143,175,150,0.22)" }}
    >{laterLabel}</span>
  ) : (
    <span className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5" style={{ background: `rgba(${rgb},0.85)`, color: WARM }}>
      {cta} <span aria-hidden>→</span>
    </span>
  );

  const row = (
    <div
      className={`relative flex rounded-3xl overflow-hidden ${waiting ? "" : "transition-opacity hover:opacity-90 active:scale-[0.99]"}`}
      style={{ background: `rgba(${rgb},0.10)`, border: `1px solid rgba(${rgb},${done ? 0.42 : 0.18})`, opacity: waiting ? 0.72 : 1 }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${rgb},${waiting ? 0.4 : 0.85})` }} />
      <div className="flex-1 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="text-xl flex-shrink-0">{emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
            {useCycle
              ? <CardSubtitleCycle values={blurbCycle!} className="text-[12px] mt-0.5 leading-snug" style={{ color: SAGE }} />
              : <p className="text-[12px] mt-0.5 leading-snug" style={{ color: SAGE }}>{blurb}</p>}
          </div>
          {pill}
        </div>
        {/* Progress bar spans the full width below the row — so "Begin" sits
            above it rather than beside it. */}
        {progress && progress.goal > 0 && (
          <div className="mt-3 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(143,175,150,0.16)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, Math.round((progress.current / progress.goal) * 100))}%`, background: `rgba(${rgb},0.85)`, transition: "width 0.3s" }}
            />
          </div>
        )}
      </div>
    </div>
  );

  if (waiting) return row;
  if (onClick) return <button type="button" onClick={onClick} className="block w-full text-left">{row}</button>;
  return <Link href={href} className="block">{row}</Link>;
}

export function DailyProgressBody({ showStreak = true, renderOfficeHero, leadCard }: { showStreak?: boolean; renderOfficeHero?: (side: "morning" | "evening") => ReactNode; leadCard?: ReactNode }) {
  const { t } = useTranslation();
  const { ready, morningDone, reflectDone, silenceDone, eveningDone, prayerKind, contemplationMin, contemplationGoalMin, gratitudeActive, examenActive, gratitudeDone, examenDone } = useRhythmState();
  const hour = new Date().getHours();
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
    t("rhythm.with_intercessions", { defaultValue: "with community intercessions" }),
    t("rhythm.with_requests", { defaultValue: "with community prayer requests" }),
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

  const cards = [
    {
      key: "morning", emoji: "🌅", rgb: "46,107,64", done: morningDone, href: "/begin-prayer",
      title: officeTitle("Morning"),
      blurb: morningDone ? prayed : morningBlurb,
      blurbCycle: morningDone ? undefined : [morningBlurb, ...officeCycle],
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    },
    {
      key: "silence", emoji: "🕯️", rgb: "62,124,122", done: silenceDone, href: "/contemplation?begin=1",
      title: t("rhythm.card_contemplation", { defaultValue: "Contemplation" }),
      blurb: contemplationBlurb,
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
      progress: { current: contemplationMin, goal: contemplationGoalMin },
    },
    {
      key: "reflect", emoji: "📖", rgb: "96,141,209", done: reflectDone, href: "/menu/reflections",
      title: t("rhythm.card_reflect", { defaultValue: "Today's reflection" }),
      blurb: reflectionSubtitle,
      // CAC with a scraped title: flip between the publication name and today's
      // title — kept even once read, so the second line always carries the
      // day's reflection title.
      blurbCycle: (reflectionSource === "cac" && cacTitle) ? [PUBLICATION_NAME.cac, cacTitle] : undefined,
      // CAC opens the meditation straight in the in-app browser (it can't be
      // iframed), marking it read — rather than routing to the reflections list.
      onClick: reflectionSource === "cac"
        ? () => { markCacRead(); openExternal(CAC_TODAY_URL); }
        : undefined,
      cta: t("rhythm.read", { defaultValue: "Read" }), later: false,
    },
    {
      key: "evening", emoji: "🌙", rgb: "124,116,196", done: eveningDone, href: hour >= 20 ? "/examen" : "/begin-prayer",
      title: hour >= 20 ? t("rhythm.card_close", { defaultValue: "Close the day" }) : officeTitle("Evening"),
      blurb: eveningDone
        ? prayed
        : hour >= 20 ? t("rhythm.blurb_compline", { defaultValue: "Examine the day and rest" }) : t("rhythm.blurb_evening", { defaultValue: "Mark the day's end with the office" }),
      // The evening office (before 8 PM) leads with "Mark the day's end with the
      // office", then carries the community intercessions / requests; after 8 PM
      // the card is the Examen, so no cycle.
      blurbCycle: (eveningDone || hour >= 20) ? undefined : [eveningBlurb, ...officeCycle],
      cta: t("rhythm.begin", { defaultValue: "Begin" }),
      later: hour < 12,
    },
    ...(gratitudeActive ? [{
      key: "gratitude", emoji: "🙏", rgb: "182,140,90", done: gratitudeDone, href: "/gratitude",
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
  ];

  // When a dedicated office hero is supplied (the beta home), the office shows
  // as that full hero instead of a practice row. The hero is the next office to
  // pray: morning while it's still undone, otherwise evening. We drop the hero's
  // side from the rows; the OTHER side stays as a small row (e.g. evening drops
  // small in the list when morning isn't done yet).
  const heroSide: "morning" | "evening" = morningDone ? "evening" : "morning";
  const heroSideDone = heroSide === "morning" ? morningDone : eveningDone;
  // Only lead with the office hero while that office is still to pray. Once it's
  // actually done it drops into the Done list like any other anchor — it
  // shouldn't keep sitting in Next as a big "completed" hero.
  const showOfficeHero = !!renderOfficeHero && !heroSideDone;
  const officeHero = showOfficeHero ? renderOfficeHero!(heroSide) : null;
  const visibleCards = showOfficeHero
    ? cards.filter((c) => c.key !== heroSide)
    : cards;
  const upcoming = visibleCards.filter((c) => !c.done);
  const completed = visibleCards.filter((c) => c.done);
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
  const renderCard = (c: (typeof cards)[number]) => (
    <PracticeCard
      key={c.key}
      href={c.href}
      emoji={c.emoji}
      title={c.title}
      blurb={c.blurb}
      cta={c.cta}
      done={c.done}
      rgb={c.rgb}
      later={c.later}
      laterLabel={t("rhythm.later", { defaultValue: "Later" })}
      progress={"progress" in c ? c.progress : undefined}
      blurbCycle={"blurbCycle" in c ? c.blurbCycle : undefined}
      onClick={"onClick" in c ? c.onClick : undefined}
    />
  );
  // Hold the first paint until the rhythm queries have settled, then fade the
  // finished Next/Done split in as one piece — otherwise the cards render all
  // under "Next" and visibly jump into "Done" as each query lands.
  // Hold the first paint until the rhythm queries have settled (so cards don't
  // jump from Next to Done as data lands), then fade each card up in turn.
  if (!ready) return null;
  return (
    <motion.div variants={fadeContainer} initial="hidden" animate="show">
      {/* A prayer-requests card leads the whole thing when there's something
          waiting. */}
      {leadCard && <motion.div variants={fadeItem} className="mb-3">{leadCard}</motion.div>}
      {(upcoming.length > 0 || officeHero) && (
        <>
          <motion.div variants={fadeItem}>{sectionHeader(t("daily_progress.next_heading", { defaultValue: "Next" }))}</motion.div>
          <div className="flex flex-col gap-2">
            {/* The office hero leads the Next list — above Contemplation. */}
            {officeHero && <motion.div variants={fadeItem}>{officeHero}</motion.div>}
            {upcoming.map((c) => <motion.div key={c.key} variants={fadeItem}>{renderCard(c)}</motion.div>)}
          </div>
        </>
      )}
      {completed.length > 0 && (
        // Gap above Done: when the Next list has a card under the hero, that
        // card already gives separation, so a smaller gap reads right; when the
        // hero is the ONLY thing in Next, it jumps straight to Done and needs
        // more breathing room.
        <div className={
          !(upcoming.length > 0 || officeHero) ? ""
            : upcoming.length > 0 ? "mt-4" : "mt-20"
        }>
          <motion.div variants={fadeItem}>{sectionHeader(t("daily_progress.done_heading", { defaultValue: "Done" }))}</motion.div>
          <div className="flex flex-col gap-2">{completed.map((c) => <motion.div key={c.key} variants={fadeItem}>{renderCard(c)}</motion.div>)}</div>
        </div>
      )}
      {/* The weekly practice grid sits under the daily cards on the daily-
          progress page. Hidden on the home, where showStreak is false. */}
      {showStreak && <motion.div variants={fadeItem} className="mt-6"><WeeklyGridCard /></motion.div>}
    </motion.div>
  );
}
