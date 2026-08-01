// ─── CAC Course (beta) — one CAC podcast season, played Coursera-style ───────
//
// Detail view for a single (show, season) course from GET
// /api/podcasts/cac/courses (see lib/cacCourses.ts). Mirrors
// way-of-love-course.tsx's shape: episodes play through Phoebe's own podcast
// player, and finishing one marks it complete via PlayingEpisode
// .courseComplete — the same mechanism, just with a dynamic episode list
// instead of a hand-curated one. Styled to match cac.org (see lib/cacTheme).

import { Link, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, Circle, ListMusic, Pause, Play } from "lucide-react";
import { Layout } from "@/components/layout";
import { usePodcastPlayer, type PlayingEpisode } from "@/components/PodcastPlayer";
import { useCourseProgress } from "@/lib/courseProgress";
import { useCacCourses, formatDuration, type CacEpisode } from "@/lib/cacCourses";
import { useBetaStatus } from "@/hooks/useDemo";
import { CAC, CacFrame, CacButton } from "@/lib/cacTheme";

export default function CacCoursePage() {
  const { isBeta, isAdmin } = useBetaStatus();
  const { id } = useParams<{ id: string }>();
  const player = usePodcastPlayer();
  const { completedCount, isComplete, toggleComplete, setLast, markStarted } = useCourseProgress(id ?? "cac-unknown");

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
      <Layout>
        <CacFrame>
          <p className="py-16 text-center text-sm" style={{ color: CAC.inkMuted }}>
            This is a beta feature — not open yet.
          </p>
        </CacFrame>
      </Layout>
    );
  }

  return (
    <Layout>
      <CacFrame>
        <div className="mx-auto w-full max-w-2xl">
          <Link
            href={course ? `/cac-show/${course.showSlug}` : "/cac-courses"}
            className="mb-3 flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
            style={{ color: CAC.inkMuted, fontFamily: CAC.label }}
          >
            <ArrowLeft size={13} /> {course?.showTitle ?? "CAC Courses"}
          </Link>

          {isLoading && !course ? (
            <p className="py-8 text-center text-sm" style={{ color: CAC.inkMuted }}>Loading…</p>
          ) : !course ? (
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: CAC.card, border: `1px solid ${CAC.border}` }}>
              <p className="text-sm leading-relaxed" style={{ color: CAC.inkMuted }}>
                We couldn't find that course. Head back to{" "}
                <Link href="/cac-courses" style={{ color: CAC.gold, textDecoration: "underline" }}>CAC Courses</Link>.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h1 className="text-2xl font-normal" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                  {course.title}
                </h1>
                {course.title !== course.showTitle && (
                  <p className="mt-0.5 text-sm" style={{ color: CAC.inkMuted }}>{course.showTitle}</p>
                )}
                <p className="mt-0.5 text-[13px]" style={{ color: CAC.inkMuted }}>
                  Hosted by {course.author}
                </p>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: CAC.inkMuted }}>
                    <span>{completedCount} of {total} episodes complete</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: CAC.divider }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: CAC.gold }} />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <CacButton onClick={() => (firstIncomplete ? playEpisode(firstIncomplete) : playSeries())} disabled={episodes.length === 0}>
                    <Play size={13} />
                    {completedCount === 0 ? "Start the course" : firstIncomplete ? "Continue" : "Listen again"}
                  </CacButton>
                  <CacButton variant="outline" onClick={playSeries} disabled={episodes.length === 0}>
                    <ListMusic size={13} /> Play all
                  </CacButton>
                </div>
              </div>

              <div className="h-px" style={{ background: CAC.divider }} />

              <div className="mt-5 space-y-2">
                {episodes.map((ep, i) => {
                  const done = isComplete(ep.id);
                  const playing = player.isCurrent(course.showSlug, ep.id) && player.isPlaying;
                  const isUpNext = firstIncomplete?.id === ep.id;
                  return (
                    <div
                      key={ep.id}
                      className="flex items-center gap-3 rounded-2xl px-3 py-3"
                      style={{ background: isUpNext ? CAC.cardHi : CAC.card, border: `1px solid ${isUpNext ? CAC.gold : CAC.border}` }}
                    >
                      <button
                        onClick={() => playEpisode(ep)}
                        disabled={!ep.audioUrl}
                        aria-label={playing ? "Pause" : "Play"}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{ background: CAC.ink, color: CAC.bg }}
                      >
                        {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 text-[11px]" style={{ color: CAC.inkMuted }}>{i + 1}.</span>
                          <p className="truncate text-sm font-semibold" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                            {ep.title ?? "Untitled episode"}
                          </p>
                          {isUpNext && (
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: CAC.goldSoft, color: CAC.goldDark, fontFamily: CAC.label }}>
                              Up next
                            </span>
                          )}
                        </div>
                        {ep.durationSeconds ? (
                          <p className="mt-0.5 text-[11px]" style={{ color: CAC.inkMuted }}>
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
                          <CheckCircle2 size={22} style={{ color: CAC.gold }} />
                        ) : (
                          <Circle size={22} style={{ color: CAC.border }} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <p className="mt-6 px-1 text-[11px] italic leading-relaxed" style={{ color: CAC.inkMuted }}>
                Audio from the Center for Action and Contemplation. Plays in Phoebe's podcast player; your progress is saved on this device.
              </p>
            </>
          )}
        </div>
      </CacFrame>
    </Layout>
  );
}
