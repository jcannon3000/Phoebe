// ─── CAC Course (beta) — one CAC podcast season, played Coursera-style ───────
//
// Detail view for a single (show, season) course from GET
// /api/podcasts/cac/courses (see lib/cacCourses.ts). Mirrors
// way-of-love-course.tsx's shape: episodes play through Phoebe's own podcast
// player, and finishing one marks it complete via PlayingEpisode
// .courseComplete — the same mechanism, just with a dynamic episode list
// instead of a hand-curated one.

import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, Circle, ListMusic, Pause, Play } from "lucide-react";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { usePodcastPlayer, type PlayingEpisode } from "@/components/PodcastPlayer";
import { useCourseProgress } from "@/lib/courseProgress";
import { useCacCourses, formatDuration, type CacEpisode } from "@/lib/cacCourses";
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

export default function CacCoursePage() {
  const { isBeta, isAdmin } = useBetaStatus();
  const { id } = useParams<{ id: string }>();
  const player = usePodcastPlayer();
  const { completedCount, isComplete, toggleComplete, setLast, markStarted } = useCourseProgress(id ?? "cac-unknown");
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const { data, isLoading } = useCacCourses();
  const course = (data?.courses ?? []).find((c) => c.id === id) ?? null;
  const episodes = course?.episodes ?? [];

  const toPlaying = (ep: CacEpisode): PlayingEpisode => ({
    showSlug: course?.showSlug ?? "",
    episodeId: ep.id,
    title: ep.title,
    audioUrl: ep.audioUrl ?? "",
    imageUrl: ep.imageUrl ?? course?.artwork,
    showTitle: course?.showTitle,
    showArtwork: course?.artwork,
    durationSeconds: ep.durationSeconds,
    publishedAt: ep.publishedAt,
    description: ep.description,
    courseComplete: course ? { courseId: course.id, lessonKey: ep.id } : undefined,
  });

  const playEpisode = (ep: CacEpisode) => {
    if (!ep.audioUrl || !course) return;
    if (player.isCurrent(course.showSlug, ep.id) && player.isPlaying) {
      player.toggle();
      return;
    }
    player.play(toPlaying(ep));
    setLast(ep.id);
    markStarted();
  };

  const playSeries = () => {
    if (!course) return;
    const queue = episodes.map(toPlaying).filter((e) => !!e.audioUrl);
    if (queue.length) { player.playQueue(queue); markStarted(); }
  };

  const firstIncomplete = episodes.find((ep) => !isComplete(ep.id)) ?? null;
  const total = episodes.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  if (!isBeta && !isAdmin) {
    return (
      <Layout bgPhoto={leafBg}>
        <div className="mx-auto w-full max-w-md px-2 py-16 text-center">
          <p className="text-4xl">🌵</p>
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
        <Link href="/cac-courses" className="mb-3 flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: C.sage }}>
          <ArrowLeft size={13} /> CAC Courses
        </Link>

        {isLoading && !course ? (
          <p className="py-8 text-center text-sm" style={{ color: C.sage }}>Loading…</p>
        ) : !course ? (
          <div className="rounded-2xl px-5 py-6 text-center" style={{ background: C.card, border: `1px solid ${C.border}`, ...FROST }}>
            <p className="text-sm leading-relaxed" style={{ color: C.sage }}>
              We couldn't find that course. Head back to{" "}
              <Link href="/cac-courses" style={{ color: C.dim, textDecoration: "underline" }}>CAC Courses</Link>.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <div className="flex items-baseline gap-2">
                <h1 className="text-2xl font-bold" style={{ color: C.text, fontFamily: C.font }}>
                  {course.showTitle}
                </h1>
                <span className="text-lg">🌵</span>
              </div>
              {course.title !== course.showTitle && (
                <p className="mt-0.5 text-sm font-medium" style={{ color: C.dim }}>{course.title}</p>
              )}
              <p className="mt-0.5 text-sm" style={{ color: C.sage }}>
                with {course.author}
              </p>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: C.sage }}>
                  <span>{completedCount} of {total} episodes complete</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(200,212,192,0.12)" }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#2D5E3F,#5FBF7F)" }} />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => (firstIncomplete ? playEpisode(firstIncomplete) : playSeries())}
                  disabled={episodes.length === 0}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: C.green, color: C.text }}
                >
                  <Play size={15} />
                  {completedCount === 0 ? "Start the course" : firstIncomplete ? "Continue" : "Listen again"}
                </button>
                <button
                  onClick={playSeries}
                  disabled={episodes.length === 0}
                  className="flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: C.greenSoft, color: C.sage, border: `1px solid ${C.border}`, ...FROST }}
                >
                  <ListMusic size={15} /> Play all
                </button>
              </div>
            </div>

            <div className="h-px" style={{ background: C.line }} />

            <div className="mt-5 space-y-2">
              {episodes.map((ep, i) => {
                const done = isComplete(ep.id);
                const playing = player.isCurrent(course.showSlug, ep.id) && player.isPlaying;
                const isUpNext = firstIncomplete?.id === ep.id;
                return (
                  <div
                    key={ep.id}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3"
                    style={{ background: isUpNext ? C.cardHi : C.card, border: `1px solid ${isUpNext ? "rgba(95,191,127,0.4)" : C.border}`, ...FROST }}
                  >
                    <button
                      onClick={() => playEpisode(ep)}
                      disabled={!ep.audioUrl}
                      aria-label={playing ? "Pause" : "Play"}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{ background: C.green, color: C.text }}
                    >
                      {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0 text-[11px]" style={{ color: "rgba(143,175,150,0.6)" }}>{i + 1}.</span>
                        <p className="truncate text-sm font-semibold" style={{ color: C.text, fontFamily: C.font }}>
                          {ep.title ?? "Untitled episode"}
                        </p>
                        {isUpNext && (
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: "rgba(95,191,127,0.18)", color: "#5FBF7F" }}>
                            Up next
                          </span>
                        )}
                      </div>
                      {ep.durationSeconds ? (
                        <p className="mt-0.5 text-[11px]" style={{ color: "rgba(143,175,150,0.55)" }}>
                          {formatDuration(ep.durationSeconds)}
                        </p>
                      ) : null}
                    </div>

                    <button
                      onClick={() => toggleComplete(ep.id)}
                      aria-label={done ? "Mark not complete" : "Mark complete"}
                      className="flex h-10 w-10 shrink-0 items-center justify-center transition-opacity hover:opacity-80"
                    >
                      {done ? (
                        <CheckCircle2 size={22} style={{ color: "#5FBF7F" }} />
                      ) : (
                        <Circle size={22} style={{ color: "rgba(143,175,150,0.45)" }} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="mt-6 px-1 text-[11px] italic leading-relaxed" style={{ color: "rgba(143,175,150,0.5)" }}>
              Audio from the Center for Action and Contemplation. Plays in Phoebe's podcast player; your progress is saved on this device.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
