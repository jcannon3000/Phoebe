// ─── CAC Show (beta) — one CAC show's seasons, pick one to walk through ──────
//
// Middle step between the show grid (cac-courses.tsx) and the episode player
// (cac-course.tsx): lists a single show's seasons, ascending — the order the
// teaching series actually unfolded in. Tapping a season opens its course.

import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { FrostLayers, frostBox } from "@/components/FrostRing";
import { useOnline } from "@/lib/offline";
import { useShowCourses, courseCompletion, type CacCourse } from "@/lib/cacCourses";
import { useAnyCourseProgressTick, clearStarted } from "@/lib/courseProgress";
import { useBetaStatus } from "@/hooks/useDemo";
import { useCacLibrary } from "@/hooks/useCacLibrary";
import { CAC, CacFrame, useCacLeafBg } from "@/lib/cacTheme";

const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

/**
 * A season card, built like the home cards (owner, 2026-09-15: "the ui is
 * having the animation issues on the cards").
 *
 * It was blur + border on one box, which the app-wide index.css rules turn
 * into a 1.5px border under a ::before frost — the half-strokes and the
 * settle-after-load the home cards had — and its lines summed to fractions,
 * so the stack drifted a device pixel card to card. Now: FrostRing (a 1px
 * transparent border, frost inset inside it, the 1.5px ring drawn above),
 * whole-pixel lines (h-5 title row, leading-4 small text) and one compositing
 * layer for each list below. 78px a card: 1 + 14 + 20 + 2 + 16 + 6 + 4 + 14 + 1.
 * See reference_card_spacing_exact.
 */
function SeasonRow({ course }: { course: CacCourse }) {
  const { completedCount, total, isDone, isStarted } = courseCompletion(course);
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const active = isStarted && !isDone;
  return (
    <Link
      href={`/cac-course/${course.id}`}
      className="relative flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-opacity hover:opacity-90"
      style={{ ...frostBox(CAC.card), opacity: isDone ? 0.7 : 1 }}
    >
      <FrostLayers border={CAC.border} />
      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center gap-1.5">
          <p className="truncate text-[15px] font-semibold leading-5" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
            {course.title}
          </p>
          {isDone && <CheckCircle2 size={14} style={{ color: CAC.gold, flexShrink: 0 }} />}
          {active && (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: CAC.goldSoft, color: CAC.goldDark, fontFamily: CAC.label }}>
              Active
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-4" style={{ color: CAC.inkMuted }}>
          {total} episode{total === 1 ? "" : "s"}
        </p>
        <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full" style={{ background: CAC.divider }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: CAC.gold }} />
        </div>
      </div>
      <p className="shrink-0 text-[11px] leading-4" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
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
  const { isAdmin } = useBetaStatus();
  const { enabled: cacLibraryGranted } = useCacLibrary();
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = useShowCourses(slug);
  // Only the Center for Action and Contemplation's shows sit behind the CAC
  // library grant. Round Table on Race (Diocese of NC) is public for everyone
  // (owner, 2026-09-11) and reads this same page.
  const isCac = data?.show.publisher === "cac";
  // Back to Courses, where every show row lives now. It pointed CAC shows at
  // /cac-courses, the "CAC Courses" folder the owner took off the Courses page
  // ("bring them out of the folder", 2026-09-05), so Back landed somewhere
  // the reader had never been. Admin Tools still opens that grid directly.
  const backHref = "/menu/learn";
  const backLabel = "Courses";
  const leafBg = useCacLeafBg();
  const online = useOnline();
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
   * ADMINS AND GRANTED PILOT GROUPS ONLY (owner: "make sure that first that the
   * CAC courses are only showing up for the admins").
   *
   * `isBeta` was deliberately DROPPED from this test. The page shipped gated on
   * `!isBeta && !isAdmin`, which let every beta tester in — and what is behind
   * it is the Center for Action and Contemplation's catalogue, not a Phoebe
   * feature, so "anyone we happen to be testing with" is the wrong audience.
   * Access is now a decision someone makes: a super admin, or a group a super
   * admin granted it to.
   *
   * The same expression guards all four surfaces (this page, cac-show,
   * cac-course, and the Learn row). Widen one, widen all.
   */
  if (isCac && !isAdmin && !cacLibraryGranted) {
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
          <Link href={backHref} className="mb-4 flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
            <ArrowLeft size={13} /> {backLabel}
          </Link>

          {isLoading && !show ? (
            <p className="py-8 text-center text-sm" style={{ color: CAC.inkMuted }}>Loading…</p>
          ) : !show ? (
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: CAC.card, border: `1px solid ${CAC.border}`, ...FROST }}>
              <p className="text-sm leading-relaxed" style={{ color: CAC.inkMuted }}>
                {online ? (
                  <>
                    We couldn't find that show. Head back to{" "}
                    <Link href={backHref} style={{ color: CAC.gold, textDecoration: "underline" }}>{backLabel}</Link>.
                  </>
                ) : (
                  // Offline the seasons never loaded; the show isn't missing.
                  // Courses stream and nothing of them is kept on the phone, so
                  // say that, the way the Courses page does.
                  "Not available offline. Courses stream from the internet, so this page loads once you're connected."
                )}
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

              {/* The show's own description, when the catalogue carries one
                  (owner, 2026-09-11: "with the description still"). */}
              {data?.show.description && (
                <p className="mb-6 max-w-lg text-[13px] leading-relaxed" style={{ color: CAC.inkMuted }}>
                  {data.show.description}
                </p>
              )}

              <div className="h-px" style={{ background: CAC.divider }} />

              {/* One compositing layer per list, so every card shares its origin
                  (see SeasonRow). */}
              <div className="mt-5 space-y-2" style={{ willChange: "transform" }}>
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
                  <div className="space-y-2" style={{ willChange: "transform" }}>
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
