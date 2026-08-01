// ─── CAC Courses (beta) — CAC's podcast seasons, browsable Coursera-style ────
//
// Owner (2026-08-01): bring the Center for Action and Contemplation's shows
// back into view, organized by SHOW first, then by SEASON within each show
// (season ascending — the order the teaching series actually unfolded in).
// Beta-only for now (entry point lives in Admin Tools) while the
// season-grouping (server groups by <itunes:season>) gets tried against
// real feeds.

import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { useCacCourses, courseCompletion, type CacCourse } from "@/lib/cacCourses";
import { useAnyCourseProgressTick } from "@/lib/courseProgress";
import { useBetaStatus } from "@/hooks/useDemo";

const C = {
  card: "rgba(9,26,16,0.46)",
  cardHi: "rgba(18,45,28,0.55)",
  line: "rgba(200,212,192,0.12)",
  border: "rgba(46,107,64,0.38)",
  text: "#F0EDE6",
  sage: "#8FAF96",
  dim: "#C8D4C0",
  green: "#2D5E3F",
  greenSoft: "rgba(46,107,64,0.16)",
  font: "'Space Grotesk', sans-serif",
} as const;
const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

// A single season row, nested under its show's header — so the card only
// needs to carry the season label + progress, not the show name again.
function SeasonRow({ course, completedCount, total, isDone }: { course: CacCourse; completedCount: number; total: number; isDone: boolean }) {
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  return (
    <Link
      href={`/cac-course/${course.id}`}
      className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-opacity hover:opacity-90"
      style={{ background: isDone ? C.card : C.cardHi, border: `1px solid ${isDone ? C.border : "rgba(95,191,127,0.4)"}`, ...FROST }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold" style={{ color: C.text, fontFamily: C.font }}>
            {course.title}
          </p>
          {isDone && <CheckCircle2 size={15} style={{ color: "#5FBF7F", flexShrink: 0 }} />}
        </div>
        <p className="mt-0.5 truncate text-[12px]" style={{ color: C.sage }}>
          {total} episode{total === 1 ? "" : "s"}
        </p>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "rgba(200,212,192,0.12)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: isDone ? "#5FBF7F" : "linear-gradient(90deg,#2D5E3F,#5FBF7F)" }}
          />
        </div>
      </div>
      <p className="shrink-0 text-[11px]" style={{ color: isDone ? "#5FBF7F" : C.sage }}>
        {completedCount}/{total}
      </p>
    </Link>
  );
}

export default function CacCoursesPage() {
  const { isBeta, isAdmin } = useBetaStatus();
  const { data, isLoading } = useCacCourses();
  // Forces a re-render (fresh completedCount/checkmarks) whenever ANY
  // course's progress changes — e.g. finishing an episode elsewhere, then
  // navigating back here.
  useAnyCourseProgressTick();
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const courses = data?.courses ?? [];
  // Group by show (registry order, preserved from the server response),
  // then by season ascending within each show — the order the teaching
  // series actually unfolded in, not a completion-based sort.
  const shows = useMemo(() => {
    const byShow = new Map<string, { showSlug: string; showTitle: string; author: string; artwork: string | null; seasons: CacCourse[] }>();
    for (const c of courses) {
      let group = byShow.get(c.showSlug);
      if (!group) {
        group = { showSlug: c.showSlug, showTitle: c.showTitle, author: c.author, artwork: c.artwork, seasons: [] };
        byShow.set(c.showSlug, group);
      }
      group.seasons.push(c);
    }
    for (const group of byShow.values()) group.seasons.sort((a, b) => a.season - b.season);
    return [...byShow.values()];
  }, [courses]);

  if (!isBeta && !isAdmin) {
    return (
      <Layout bgPhoto={leafBg}>
        <div className="mx-auto w-full max-w-md px-2 py-16 text-center">
          <p className="text-4xl">🌵</p>
          <h1 className="mt-4 text-xl font-bold" style={{ color: C.text, fontFamily: C.font }}>
            CAC Courses
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: C.sage }}>
            This is a beta feature — not open yet.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout bgPhoto={leafBg}>
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/menu" className="mb-3 flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: C.sage }}>
          <ArrowLeft size={13} /> Menu
        </Link>
        <div className="mb-5">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold" style={{ color: C.text, fontFamily: C.font }}>
              CAC Courses
            </h1>
            <span className="text-lg">🌵</span>
          </div>
          <p className="mt-0.5 text-sm" style={{ color: C.sage }}>
            Center for Action and Contemplation
          </p>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: C.dim }}>
            Each teacher's show, one season at a time — walk through one like a course, at your own pace.
          </p>
          <p className="mt-1.5 rounded-full inline-block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(95,191,127,0.14)", color: "#5FBF7F" }}>
            Beta
          </p>
        </div>

        <div className="h-px" style={{ background: C.line }} />

        <div className="mt-5">
          {isLoading && (
            <p className="py-8 text-center text-sm" style={{ color: C.sage }}>Loading the library…</p>
          )}
          {!isLoading && courses.length === 0 && (
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: C.card, border: `1px solid ${C.border}`, ...FROST }}>
              <p className="text-sm leading-relaxed" style={{ color: C.sage }}>
                We couldn't load the CAC library just now. Try again shortly.
              </p>
            </div>
          )}

          <div className="space-y-6">
            {shows.map((show) => (
              <div key={show.showSlug}>
                <div className="mb-2 flex items-center gap-2.5 px-1">
                  <div
                    className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-black/30"
                    style={show.artwork ? { backgroundImage: `url(${show.artwork})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold" style={{ color: C.text, fontFamily: C.font }}>
                      {show.showTitle}
                    </p>
                    <p className="truncate text-[11px]" style={{ color: C.sage }}>
                      with {show.author} · {show.seasons.length} season{show.seasons.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {show.seasons.map((course) => {
                    const { completedCount, total, isDone } = courseCompletion(course);
                    return <SeasonRow key={course.id} course={course} completedCount={completedCount} total={total} isDone={isDone} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 px-1 text-[11px] italic leading-relaxed" style={{ color: "rgba(143,175,150,0.5)" }}>
          Audio from the Center for Action and Contemplation. Plays in Phoebe's podcast player; your progress is saved on this device.
        </p>
      </div>
    </Layout>
  );
}
