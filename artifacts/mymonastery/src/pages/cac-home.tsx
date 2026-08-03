// ─── CAC Home (beta, admin tools only) — demo home screen ────────────────────
//
// Owner (2026-08-01): a demo of what a dedicated CAC daily-habit app's home
// screen could look like — a card for today's daily meditation up top,
// CAC's shows (as courses, grouped by season underneath each) below. Meant
// as a pitch/demo surface, not a feature Phoebe ships broadly — hence
// admin-tools-only rather than the wider isBeta gate the courses pages use.

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Play } from "lucide-react";
import { Layout } from "@/components/layout";
import { X } from "lucide-react";
import { useCacCourses, courseCompletion, type CacCourse } from "@/lib/cacCourses";
import { useAnyCourseProgressTick, clearStarted } from "@/lib/courseProgress";
import { useCacDailyReflection } from "@/lib/cacDailyReflection";
import { hasReadCacToday, CAC_READ_EVENT } from "@/lib/cacReadState";
import { useBetaStatus } from "@/hooks/useDemo";
import { CAC, CacFrame, CacBetaPill, useCacLeafBg } from "@/lib/cacTheme";

// Matches HomeLearnSection.tsx's "Continue" row (the real home screen's own
// in-progress-course card) — same frosted card, eyebrow, title, circular
// play button, and progress bar, just pointed at a CAC season instead of a
// YouTube course.
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
function ContinueCourseRow({ course, completedCount, total, nextTitle }: { course: CacCourse; completedCount: number; total: number; nextTitle: string | null }) {
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  return (
    <Link
      href={`/cac-course/${course.id}`}
      className="relative block w-full rounded-2xl px-4 py-3.5 transition-opacity hover:opacity-90"
      style={{ background: "rgba(9,26,16,0.4)", border: "1px solid rgba(46,107,64,0.38)", ...FROST }}
    >
      <button
        type="button"
        aria-label="Remove from active courses"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearStarted(course.id);
        }}
        className="absolute right-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full transition-opacity hover:opacity-80"
        style={{ background: "rgba(0,0,0,0.3)", color: SAGE }}
      >
        <X size={12} />
      </button>
      <div className="flex items-center gap-3 pr-6">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.7)", fontFamily: CAC.label }}>
            Active · {course.showTitle}
          </p>
          <p className="mt-0.5 truncate text-[15px] font-semibold" style={{ color: WARM, fontFamily: CAC.label }}>
            {nextTitle ?? course.title}
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "#2D5E3F" }}>
          <Play size={16} style={{ marginLeft: 2, color: WARM }} />
        </div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full" style={{ background: "rgba(200,212,192,0.12)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#2D5E3F,#5FBF7F)" }} />
      </div>
      <p className="mt-1 text-[11px]" style={{ color: SAGE }}>{completedCount} of {total}</p>
    </Link>
  );
}

const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

// Compact Phoebe-style "practice card" — the actual dark-frosted, left-striped
// row from DailyProgressBody.tsx's PracticeCard, since the owner wants this
// ONE card to read as a real home-screen rhythm card, not the CAC cream/rust
// theme the rest of this demo wears. Simplified (no celebrate/pulse/progress —
// this is a single one-off card, not the full rhythm stack), but the same
// shape: dark frosted card, colored left stripe, leading emoji, title, blurb,
// and a trailing pill that becomes a ✓ once today's reflection is read.
const PHOEBE_CARD_RGB = "179,84,58"; // CAC's terracotta accent, in the card's own idiom
function CacReflectionHomeCard({ title, blurb, loading, read }: { title: string; blurb: string; loading: boolean; read: boolean }) {
  return (
    <Link href="/cac-reflection" className="mb-8 block w-full cursor-pointer">
      <div
        className="relative flex rounded-3xl overflow-hidden transition-opacity hover:opacity-90 active:scale-[0.99]"
        style={{ background: "rgba(10,23,15,0.30)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(200,212,192,0.35)" }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: `rgba(${PHOEBE_CARD_RGB},0.7)` }} />
        <div className="flex-1 min-w-0 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="text-[15px] leading-none flex-shrink-0" aria-hidden>📖</span>
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                {loading ? "Today's Meditation" : title}
              </p>
              <p className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: "#8FAF96" }}>
                {loading ? "Loading…" : blurb}
              </p>
            </div>
            {read ? (
              <span
                className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
                style={{ background: `rgba(${PHOEBE_CARD_RGB},0.18)`, color: "rgba(240,237,230,0.85)", border: `1px solid rgba(${PHOEBE_CARD_RGB},0.45)` }}
              >✓</span>
            ) : (
              <span
                className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5 text-center"
                style={{ minWidth: 84, background: `rgba(${PHOEBE_CARD_RGB},0.85)`, color: "#F0EDE6" }}
              >
                Read <span aria-hidden>→</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function CacHomePage() {
  const { isAdmin } = useBetaStatus();
  const leafBg = useCacLeafBg();
  const { data: coursesData, isLoading: coursesLoading } = useCacCourses();
  const { data: reflection, isLoading: reflectionLoading } = useCacDailyReflection();
  // Re-render when any season's progress changes, so a show you just
  // started jumps to the top without needing a reload. The tick number
  // itself must be a dependency below — `courses` is a stable react-query
  // array reference, so a plain re-render alone wouldn't recompute either
  // memo (e.g. clicking a Continue row's × wouldn't remove it from the list).
  const progressTick = useAnyCourseProgressTick();
  // Re-render when today's reflection gets marked read (cac-reflection.tsx
  // calls markCacRead() on open) — same tracker the rest of the app's daily-
  // reflection cards already use (lib/cacReadState.ts).
  const [reflectionRead, setReflectionRead] = useState(() => hasReadCacToday());
  useEffect(() => {
    const onRead = () => setReflectionRead(hasReadCacToday());
    window.addEventListener(CAC_READ_EVENT, onRead);
    return () => window.removeEventListener(CAC_READ_EVENT, onRead);
  }, []);

  const courses = coursesData?.courses ?? [];
  // Up to 3 in-progress seasons, most-recently-touched first — the same
  // "Continue" treatment HomeLearnSection.tsx gives the video courses on
  // the real home screen.
  const continueCourses = useMemo(() => {
    return courses
      .map((c) => ({ course: c, ...courseCompletion(c) }))
      .filter((c) => c.isStarted && !c.isDone)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
  }, [courses, progressTick]);

  // Shows with a started (but not necessarily finished) season float to the
  // top — "pick up where you left off" beats browsing from scratch.
  const shows = useMemo(() => {
    const byShow = new Map<string, { showSlug: string; showTitle: string; author: string; artwork: string | null; seasonCount: number; started: boolean }>();
    for (const c of courses) {
      const started = courseCompletion(c).isStarted;
      const existing = byShow.get(c.showSlug);
      if (existing) {
        existing.seasonCount += 1;
        existing.started = existing.started || started;
        continue;
      }
      byShow.set(c.showSlug, { showSlug: c.showSlug, showTitle: c.showTitle, author: c.author, artwork: c.artwork, seasonCount: 1, started });
    }
    return [...byShow.values()].sort((a, b) => (a.started === b.started ? 0 : a.started ? -1 : 1));
  }, [courses, progressTick]);

  // The home card's teaser line is plain text (not the rich HTML the full
  // reflection page renders) — strip tags/line-breaks from the first
  // paragraph rather than showing raw markup in a plain <p>.
  const excerpt = (reflection?.paragraphs?.[0] ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").trim();

  if (!isAdmin) {
    return (
      <Layout bgPhoto={leafBg}>
        <CacFrame>
          <p className="py-16 text-center text-sm" style={{ color: CAC.inkMuted }}>
            This is a beta feature — not open yet.
          </p>
        </CacFrame>
      </Layout>
    );
  }

  return (
    <Layout bgPhoto={leafBg}>
      <CacFrame>
        <div className="mx-auto w-full max-w-2xl">
          <Link href="/admin-tools" className="mb-4 flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
            <ArrowLeft size={13} /> Admin Tools
          </Link>

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                Center for Action and Contemplation
              </h1>
              <p className="mt-1 text-[12px]" style={{ color: CAC.inkMuted }}>
                A daily habit around CAC's teaching — demo home screen
              </p>
            </div>
            <CacBetaPill />
          </div>

          {/* Today's reflection — styled like a real Phoebe home-screen card. */}
          <CacReflectionHomeCard
            title={reflection?.title || "Today's Reflection"}
            blurb={excerpt || "Center for Action and Contemplation"}
            loading={reflectionLoading}
            read={reflectionRead}
          />

          {/* Continue — up to 3 in-progress seasons, most-recent first. */}
          {continueCourses.length > 0 && (
            <div className="mb-8">
              <div className="mb-2 flex items-center gap-3">
                <h3 className="text-lg font-semibold" style={{ color: WARM, fontFamily: CAC.label }}>Courses</h3>
                <div className="h-px flex-1" style={{ background: "rgba(200,212,192,0.15)" }} />
              </div>
              <div className="space-y-2">
                {continueCourses.map(({ course, completedCount, total, nextTitle }) => (
                  <ContinueCourseRow key={course.id} course={course} completedCount={completedCount} total={total} nextTitle={nextTitle} />
                ))}
              </div>
            </div>
          )}

          {/* Browse all shows */}
          <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.55)", fontFamily: CAC.label }}>
            Browse Shows
          </p>

          {coursesLoading && (
            <p className="py-8 text-center text-sm" style={{ color: CAC.inkMuted }}>Loading the library…</p>
          )}
          {!coursesLoading && shows.length === 0 && (
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: CAC.card, border: `1px solid ${CAC.border}`, ...FROST }}>
              <p className="text-sm leading-relaxed" style={{ color: CAC.inkMuted }}>
                We couldn't load the CAC library just now. Try again shortly.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-7">
            {shows.map((show) => (
              <Link
                key={show.showSlug}
                href={`/cac-show/${show.showSlug}`}
                className="cursor-pointer transition-opacity hover:opacity-90"
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 8,
                    overflow: "hidden",
                    padding: 10,
                    background: CAC.card,
                  }}
                >
                  {show.artwork ? (
                    <img
                      src={show.artwork}
                      alt={show.showTitle}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: 4 }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">🌵</div>
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <p className="text-[15px] font-semibold leading-tight" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                    {show.showTitle}
                  </p>
                  {show.started && (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: CAC.goldSoft, color: CAC.goldDark, fontFamily: CAC.label }}>
                      Continue
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] uppercase tracking-wide" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
                  {show.author} · {show.seasonCount} season{show.seasonCount === 1 ? "" : "s"}
                </p>
              </Link>
            ))}
          </div>

          <p className="mt-8 px-1 text-[11px] italic leading-relaxed" style={{ color: CAC.inkMuted }}>
            Content from the Center for Action and Contemplation — daily meditations and podcast library.
          </p>
        </div>
      </CacFrame>
    </Layout>
  );
}
