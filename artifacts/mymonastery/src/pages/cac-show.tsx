// ─── CAC Show (beta) — one CAC show's seasons, pick one to walk through ──────
//
// Middle step between the show grid (cac-courses.tsx) and the episode player
// (cac-course.tsx): lists a single show's seasons, ascending — the order the
// teaching series actually unfolded in. Tapping a season opens its course.

import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { useCacCourses, courseCompletion, type CacCourse } from "@/lib/cacCourses";
import { useAnyCourseProgressTick, clearStarted } from "@/lib/courseProgress";
import { useBetaStatus } from "@/hooks/useDemo";
import { useCacLibrary } from "@/hooks/useCacLibrary";
import { CAC, CacFrame, useCacLeafBg } from "@/lib/cacTheme";

const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

function SeasonRow({ course }: { course: CacCourse }) {
  const { completedCount, total, isDone, isStarted } = courseCompletion(course);
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const active = isStarted && !isDone;
  return (
    <Link
      href={`/cac-course/${course.id}`}
      className="relative flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-opacity hover:opacity-90"
      style={{ background: CAC.card, border: `1px solid ${CAC.border}`, opacity: isDone ? 0.7 : 1, ...FROST }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[15px] font-semibold" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
            {course.title}
          </p>
          {isDone && <CheckCircle2 size={14} style={{ color: CAC.gold, flexShrink: 0 }} />}
          {active && (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: CAC.goldSoft, color: CAC.goldDark, fontFamily: CAC.label }}>
              Active
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11.5px]" style={{ color: CAC.inkMuted }}>
          {total} episode{total === 1 ? "" : "s"}
        </p>
        <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full" style={{ background: CAC.divider }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: CAC.gold }} />
        </div>
      </div>
      <p className="shrink-0 text-[11px]" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
        {completedCount}/{total}
      </p>
      {active && (
        <button
          type="button"
          aria-label="Remove from active courses"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            clearStarted(course.id);
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
          style={{ background: CAC.divider, color: CAC.inkMuted }}
        >
          <X size={12} />
        </button>
      )}
    </Link>
  );
}

export default function CacShowPage() {
  const { isBeta, isAdmin } = useBetaStatus();
  const { enabled: cacLibraryGranted } = useCacLibrary();
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = useCacCourses();
  const leafBg = useCacLeafBg();
  useAnyCourseProgressTick();

  const seasons = useMemo(
    () => (data?.courses ?? []).filter((c) => c.showSlug === slug).sort((a, b) => a.season - b.season),
    [data, slug],
  );
  const show = seasons[0] ?? null;
  // Finished seasons move out of the main list into a "Completed" section at
  // the bottom, so the top of the page stays focused on what's still ahead.
  const inProgressSeasons = seasons.filter((c) => !courseCompletion(c).isDone);
  const completedSeasons = seasons.filter((c) => courseCompletion(c).isDone);

  /**
   * PILOT-GROUP ACCESS (owner: "members of special pilot groups would be able
   * to see the full library"). Same expression in all four places that gate
   * this feature — the three CAC pages and the Learn row — so a row can never
   * be offered to someone the page then turns away, or hidden from someone who
   * may use it. Widen one, widen all.
   */
  if (!isBeta && !isAdmin && !cacLibraryGranted) {
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
          <Link href="/cac-courses" className="mb-4 flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
            <ArrowLeft size={13} /> CAC Courses
          </Link>

          {isLoading && !show ? (
            <p className="py-8 text-center text-sm" style={{ color: CAC.inkMuted }}>Loading…</p>
          ) : !show ? (
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: CAC.card, border: `1px solid ${CAC.border}`, ...FROST }}>
              <p className="text-sm leading-relaxed" style={{ color: CAC.inkMuted }}>
                We couldn't find that show. Head back to{" "}
                <Link href="/cac-courses" style={{ color: CAC.gold, textDecoration: "underline" }}>CAC Courses</Link>.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-start gap-4">
                <div
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-xl"
                  style={{ background: CAC.card }}
                >
                  {show.artwork && (
                    <img src={show.artwork} alt={show.showTitle} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold leading-tight" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                    {show.showTitle}
                  </h1>
                  <p className="mt-1 text-[13px]" style={{ color: CAC.inkMuted }}>
                    Hosted by {show.author}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
                    {seasons.length} season{seasons.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="h-px" style={{ background: CAC.divider }} />

              <div className="mt-5 space-y-2">
                {inProgressSeasons.map((course) => (
                  <SeasonRow key={course.id} course={course} />
                ))}
              </div>

              {completedSeasons.length > 0 && (
                <div className="mt-8">
                  <div className="mb-2 flex items-center gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
                      Completed
                    </p>
                    <div className="h-px flex-1" style={{ background: CAC.divider }} />
                  </div>
                  <div className="space-y-2">
                    {completedSeasons.map((course) => (
                      <SeasonRow key={course.id} course={course} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CacFrame>
    </Layout>
  );
}
