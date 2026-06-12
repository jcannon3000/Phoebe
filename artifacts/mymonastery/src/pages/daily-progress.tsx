/**
 * Daily progress — the expanded view behind the header "Daily progress" pill.
 *
 * Shows the full Today's Rhythm card (the four anchors + streak + what's next),
 * then a home-style card for each of the four practices — Morning, Reflect,
 * Silence, Evening — showing whether it's kept today and tapping through to it.
 * The card used to live on the home top; it moved here (and onto the slideshow
 * closing slide) so the home screen stays focused on praying, and the rhythm is
 * one tap from any page via the header pill.
 */

import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Sliders } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { useEffectiveReflectionSource, type ReflectionSource } from "@/lib/officePrefs";

// The publication name shown as the reflection card's subtitle.
const PUBLICATION_NAME: Record<Exclude<ReflectionSource, "none">, string> = {
  fdd: "Forward Day by Day",
  ssje: "Brother, Give Us a Word",
  cac: "CAC Daily Meditation",
};

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Streak card — the unified days-of-prayer run, with a dot for each of the
// last 14 days (filled = kept, ringed = today). Same /api/me/prayer-days the
// rhythm hook reads (React Query dedupes), but here we also use `days`.
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
  // Others in the user's garden(s) who have prayed this week — social proof
  // that the rhythm is shared, not solitary. Faces for the rail come with it.
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
  const AMBER = "193,127,36";          // warm flame accent — left bar + the streak number only
  const GREEN = "46,107,64";           // card body, matching the home / practice cards
  const GREEN_BRIGHT = "110,180,130";  // kept-day marks in the 14-day strip
  return (
    <div
      className="relative flex rounded-2xl overflow-hidden mt-6"
      style={{ background: `rgba(${GREEN},0.10)`, border: `1px solid rgba(${GREEN},0.24)` }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${AMBER},0.85)` }} />
      <div className="flex-1 px-4 py-4">
        {/* Header balanced across the width: streak on the left, the
            last-7 count aligned right, so the row fills the card instead of
            clustering top-left. */}
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
        {/* Last-14-days strip — oldest left, today right (ringed). */}
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

// One home-style practice card: a colored left accent bar, the practice, and
// its state today (a "kept" check or a CTA to begin). Matches the dashboard
// PracticeHomeCard look so the page feels of a piece with home.
function PracticeCard({
  href, emoji, title, blurb, cta, done, rgb, later, laterLabel, progress,
}: {
  href: string; emoji: string; title: string; blurb: string; cta: string; done: boolean; rgb: string;
  /** Not yet actionable (e.g. evening before noon) — shows a muted "Later"
   *  pill instead of a CTA, and isn't tappable. */
  later?: boolean; laterLabel?: string;
  /** Goal progress bar (e.g. contemplation minutes toward the daily goal),
   *  shown under the text until the goal is met. */
  progress?: { current: number; goal: number };
}) {
  const waiting = !!later && !done;
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
      className={`relative flex rounded-2xl overflow-hidden ${waiting ? "" : "transition-opacity hover:opacity-90 active:scale-[0.99]"}`}
      style={{ background: `rgba(${rgb},0.10)`, border: `1px solid rgba(${rgb},${done ? 0.42 : 0.18})`, opacity: waiting ? 0.72 : 1 }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${rgb},${waiting ? 0.4 : 0.85})` }} />
      <div className="flex-1 px-4 py-3.5 flex items-center gap-3">
        <span className="text-xl flex-shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
          <p className="text-[12px] mt-0.5 leading-snug" style={{ color: SAGE }}>{blurb}</p>
          {progress && progress.goal > 0 && !done && (
            <div className="mt-2 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(143,175,150,0.16)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, Math.round((progress.current / progress.goal) * 100))}%`, background: `rgba(${rgb},0.85)`, transition: "width 0.3s" }}
              />
            </div>
          )}
        </div>
        {pill}
      </div>
    </div>
  );

  // Not yet actionable → a plain (non-navigating) card.
  return waiting ? row : <Link href={href} className="block">{row}</Link>;
}

export default function DailyProgressPage() {
  const { t } = useTranslation();
  const { morningDone, reflectDone, silenceDone, eveningDone, prayerKind, contemplationMin, contemplationGoalMin, gratitudeActive, examenActive, gratitudeDone, examenDone } = useRhythmState();
  const hour = new Date().getHours();
  const kept = t("rhythm.kept", { defaultValue: "Kept today" });
  // Offices are "prayed", not "kept".
  const prayed = t("rhythm.prayed", { defaultValue: "Prayed today" });
  // The reflection card's subtitle is the publication the user follows (plus
  // today's title when we have one — external publications usually don't expose
  // it, so it's just the name). Falls back to the generic blurb if none chosen.
  const reflectionSource = useEffectiveReflectionSource();
  const reflectionSubtitle =
    reflectionSource && reflectionSource !== "none"
      ? PUBLICATION_NAME[reflectionSource]
      : t("rhythm.blurb_reflect", { defaultValue: "A few minutes with the day's word" });
  // Contemplation card sub-line: goal progress until the goal is met.
  const contemplationBlurb = silenceDone
    ? kept
    : contemplationGoalMin > 0
      ? t("rhythm.contemplation_progress", { current: contemplationMin, goal: contemplationGoalMin, defaultValue: `${contemplationMin} of ${contemplationGoalMin} min today` })
      : t("rhythm.blurb_silence", { defaultValue: "Sit, or cobreathe for justice" });

  // Title for an office side matches what the user prays (their Customize-home
  // / Rule of Life pick): Prayer (office), Devotion, or community "Pray together".
  const officeTitle = (side: "Morning" | "Evening") =>
    prayerKind === "community"
      ? t("rhythm.card_community", { defaultValue: "Pray together" })
      : prayerKind === "devotion"
        ? t(`rhythm.card_${side.toLowerCase()}_devotion`, { defaultValue: `${side} Devotion` })
        : t(`rhythm.card_${side.toLowerCase()}`, { defaultValue: `${side} Prayer` });

  // The four anchors as home-style cards — Morning · Silence · Reflect ·
  // Evening (silence before reflect). The evening card waits to become
  // actionable until the afternoon (it shows "Later" until noon).
  const cards = [
    {
      key: "morning", emoji: "🌅", rgb: "46,107,64", done: morningDone, href: "/begin-prayer",
      title: officeTitle("Morning"),
      blurb: morningDone ? prayed : t("rhythm.blurb_morning", { defaultValue: "Begin the day with the office" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    },
    {
      key: "silence", emoji: "🕯️", rgb: "62,124,122", done: silenceDone, href: "/contemplation",
      title: t("rhythm.card_contemplation", { defaultValue: "Contemplation" }),
      blurb: contemplationBlurb,
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
      progress: { current: contemplationMin, goal: contemplationGoalMin },
    },
    {
      key: "reflect", emoji: "📖", rgb: "96,141,209", done: reflectDone, href: "/menu/reflections",
      title: t("rhythm.card_reflect", { defaultValue: "Today's reflection" }),
      blurb: reflectionSubtitle,
      cta: t("rhythm.read", { defaultValue: "Read" }), later: false,
    },
    {
      key: "evening", emoji: "🌙", rgb: "124,116,196", done: eveningDone, href: hour >= 20 ? "/examen" : "/begin-prayer",
      title: hour >= 20 ? t("rhythm.card_close", { defaultValue: "Close the day" }) : officeTitle("Evening"),
      blurb: eveningDone
        ? prayed
        : hour >= 20 ? t("rhythm.blurb_compline", { defaultValue: "Examine the day and rest" }) : t("rhythm.blurb_evening", { defaultValue: "Mark the day's end with the office" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }),
      // Evening isn't actionable until the afternoon (after noon).
      later: hour < 12,
    },
    // Optional practices the user added from the Customize flow — each its own
    // anchor with a checkmark. Omitted entirely when not added.
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

  return (
    <Layout>
      {/* Capped on desktop, full-width on mobile: the max-width constrains the
          column on wide screens (so the cards aren't stretched across the
          page), while phones — narrower than the cap — fill edge to edge
          within the Layout's padding. */}
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.home", { defaultValue: "Home" })}
        </Link>

        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>
          {t("daily_progress.title", { defaultValue: "Daily progress" })}
        </h1>
        <p className="text-sm mb-5" style={{ color: SAGE }}>
          {t("daily_progress.subtitle", { defaultValue: "Where you are in today's rhythm — and what's next." })}
        </p>

        {/* Practices split into Next + Done. The progress dots in the header
            pill already carry the at-a-glance count, so the old Today's Rhythm
            card (which repeated it) was removed. As a practice is kept it drops
            from Next into Done; the first card in Next is what's up next. */}
        {(() => {
          const upcoming = cards.filter((c) => !c.done);
          const completed = cards.filter((c) => c.done);
          const sectionHeader = (label: string) => (
            <div className="flex items-center gap-3 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
                {label}
              </p>
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
            />
          );
          return (
            <>
              {upcoming.length > 0 && (
                <>
                  {sectionHeader(t("daily_progress.next_heading", { defaultValue: "Next" }))}
                  <div className="flex flex-col gap-2">{upcoming.map(renderCard)}</div>
                </>
              )}
              {completed.length > 0 && (
                <div className={upcoming.length > 0 ? "mt-6" : ""}>
                  {sectionHeader(t("daily_progress.done_heading", { defaultValue: "Done" }))}
                  <div className="flex flex-col gap-2">{completed.map(renderCard)}</div>
                </div>
              )}
            </>
          );
        })()}

        {/* Streak — the unified days-of-prayer run + last-14-days strip. */}
        <StreakCard />

        {/* Customize — shape which practices make up your rhythm. */}
        <div className="flex justify-center mt-8">
          <Link
            href="/rule-of-life"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
            style={{
              background: "rgba(46,107,64,0.10)",
              border: "1px solid rgba(46,107,64,0.28)",
              color: "#A8C5A0",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Sliders size={14} /> {t("daily_progress.customize", { defaultValue: "Customize" })}
          </Link>
        </div>
      </div>
    </Layout>
  );
}
