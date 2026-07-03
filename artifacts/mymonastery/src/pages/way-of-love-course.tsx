// ─── The Way of Love — a guided audio course (web only) ──────────────────────
//
// A Coursera-style walk through Bishop Mariann Budde's "Way of Love" series.
// The audio already lives in Phoebe as the `experiencing-jesus` podcast show, so
// this page draws the episodes from that feed, structures them into units +
// lessons, and plays them in Phoebe's own podcast player. Completion is tracked
// device-locally. Web-only (mirrors the Spiritual Journey course).

import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, ListMusic, Pause, Play } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { isNativeShell } from "@/lib/isNativeShell";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { usePodcastPlayer, type PlayingEpisode } from "@/components/PodcastPlayer";
import { useCourseProgress } from "@/lib/courseProgress";
import {
  WAY_OF_LOVE,
  WOL_LESSONS,
  WOL_TOTAL,
  resolveWolEpisodes,
  formatDuration,
  type PodcastEpisode,
  type WolLesson,
} from "@/lib/wayOfLoveCourse";

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

interface ShowResponse {
  show?: { slug: string; title: string; artist: string; artwork: string | null };
  episodes?: PodcastEpisode[];
}

export default function WayOfLoveCoursePage() {
  const player = usePodcastPlayer();
  const { completedCount, isComplete, toggleComplete, setLast } = useCourseProgress(WAY_OF_LOVE.id);
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const { data, isLoading } = useQuery<ShowResponse>({
    queryKey: [`/api/podcasts/show/${WAY_OF_LOVE.showSlug}`],
    queryFn: () => apiRequest("GET", `/api/podcasts/show/${WAY_OF_LOVE.showSlug}`),
    staleTime: 30 * 60_000,
  });

  const episodes = data?.episodes ?? [];
  const showArtwork = data?.show?.artwork ?? null;
  const epMap = useMemo(() => resolveWolEpisodes(episodes), [episodes]);

  const toPlaying = (ep: PodcastEpisode): PlayingEpisode => ({
    showSlug: WAY_OF_LOVE.showSlug,
    episodeId: ep.id,
    title: ep.title,
    audioUrl: ep.audioUrl ?? "",
    imageUrl: ep.imageUrl ?? showArtwork,
    showTitle: WAY_OF_LOVE.title,
    showArtwork,
    durationSeconds: ep.durationSeconds,
    publishedAt: ep.publishedAt,
    description: ep.description,
  });

  const playLesson = (lesson: WolLesson) => {
    const ep = epMap[lesson.key];
    if (!ep?.audioUrl) return;
    if (player.isCurrent(WAY_OF_LOVE.showSlug, ep.id)) {
      player.toggle();
      return;
    }
    player.play(toPlaying(ep));
    setLast(lesson.key);
  };

  const playSeries = () => {
    const queue = WOL_LESSONS.map((l) => epMap[l.key])
      .filter((e): e is PodcastEpisode => !!e?.audioUrl)
      .map(toPlaying);
    if (queue.length) player.playQueue(queue);
  };

  const firstIncomplete = WOL_LESSONS.find((l) => !isComplete(l.key)) ?? null;
  const pct = Math.round((completedCount / WOL_TOTAL) * 100);

  // ── Web-only gate ──────────────────────────────────────────────────────────
  if (isNativeShell()) {
    return (
      <Layout bgPhoto={leafBg}>
        <div className="mx-auto w-full max-w-md px-2 py-16 text-center">
          <p className="text-4xl">❤️</p>
          <h1 className="mt-4 text-xl font-bold" style={{ color: C.text, fontFamily: C.font }}>
            The Way of Love
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: C.sage }}>
            This guided course is on the web. Open{" "}
            <span style={{ color: C.dim }}>withphoebe.app/way-of-love-course</span> in your browser to
            walk Bishop Mariann's series and track your progress. You can still find the talks under
            Podcasts here.
          </p>
          <Link href="/menu/practices" className="mt-6 inline-flex items-center gap-1 text-sm" style={{ color: C.sage }}>
            <ArrowLeft size={14} /> Back to Practices
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout bgPhoto={leafBg}>
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-5">
          <Link
            href="/menu/practices"
            className="mb-3 flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
            style={{ color: C.sage }}
          >
            <ArrowLeft size={13} /> Practices
          </Link>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold" style={{ color: C.text, fontFamily: C.font }}>
              {WAY_OF_LOVE.title}
            </h1>
            <span className="text-lg">❤️</span>
          </div>
          <p className="mt-0.5 text-sm" style={{ color: C.sage }}>
            with {WAY_OF_LOVE.author}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: C.dim }}>
            {WAY_OF_LOVE.tagline}
          </p>

          {/* Overall progress */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: C.sage }}>
              <span>{completedCount} of {WOL_TOTAL} practices complete</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(200,212,192,0.12)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#2D5E3F,#5FBF7F)" }} />
            </div>
          </div>

          {/* Continue + Play all */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => (firstIncomplete ? playLesson(firstIncomplete) : playSeries())}
              disabled={isLoading || episodes.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: C.green, color: C.text }}
            >
              <Play size={15} />
              {completedCount === 0 ? "Start the course" : firstIncomplete ? "Continue" : "Listen again"}
            </button>
            <button
              onClick={playSeries}
              disabled={isLoading || episodes.length === 0}
              className="flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ background: C.greenSoft, color: C.sage, border: `1px solid ${C.border}`, ...FROST }}
            >
              <ListMusic size={15} /> Play all
            </button>
          </div>
        </div>

        <div className="h-px" style={{ background: C.line }} />

        {/* Units → lessons */}
        <div className="mt-5 space-y-5">
          {isLoading && episodes.length === 0 && (
            <p className="py-8 text-center text-sm" style={{ color: C.sage }}>Loading the series…</p>
          )}

          {!isLoading && episodes.length === 0 && (
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: C.card, border: `1px solid ${C.border}`, ...FROST }}>
              <p className="text-sm leading-relaxed" style={{ color: C.sage }}>
                We couldn't load the audio just now. You can find{" "}
                <Link href={`/podcasts/show/${WAY_OF_LOVE.showSlug}`} style={{ color: C.dim, textDecoration: "underline" }}>
                  the series under Podcasts
                </Link>{" "}
                and try again shortly.
              </p>
            </div>
          )}

          {episodes.length > 0 &&
            WAY_OF_LOVE.units.map((unit) => {
              const unitDone = unit.lessons.every((l) => isComplete(l.key));
              const unitCount = unit.lessons.filter((l) => isComplete(l.key)).length;
              return (
                <div key={unit.id}>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: unitDone ? "#5FBF7F" : "rgba(143,175,150,0.85)" }}>
                      {unit.title}
                    </h2>
                    <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)" }}>
                      {unitCount}/{unit.lessons.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {unit.lessons.map((lesson) => {
                      const ep = epMap[lesson.key];
                      const done = isComplete(lesson.key);
                      const playing = !!ep && player.isCurrent(WAY_OF_LOVE.showSlug, ep.id) && player.isPlaying;
                      const isUpNext = firstIncomplete?.key === lesson.key;
                      return (
                        <div
                          key={lesson.key}
                          className="flex items-center gap-3 rounded-2xl px-3 py-3"
                          style={{
                            background: isUpNext ? C.cardHi : C.card,
                            border: `1px solid ${isUpNext ? "rgba(95,191,127,0.4)" : C.border}`,
                            ...FROST,
                          }}
                        >
                          {/* Play / pause */}
                          <button
                            onClick={() => playLesson(lesson)}
                            disabled={!ep?.audioUrl}
                            aria-label={playing ? "Pause" : "Play"}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
                            style={{ background: C.green, color: C.text }}
                          >
                            {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
                          </button>

                          {/* Text */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{lesson.emoji}</span>
                              <p className="truncate text-sm font-semibold" style={{ color: C.text, fontFamily: C.font }}>
                                {lesson.practice}
                              </p>
                              {isUpNext && (
                                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: "rgba(95,191,127,0.18)", color: "#5FBF7F" }}>
                                  Up next
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[12px] leading-snug" style={{ color: C.sage }}>
                              {lesson.blurb}
                            </p>
                            {ep?.durationSeconds ? (
                              <p className="mt-0.5 text-[11px]" style={{ color: "rgba(143,175,150,0.55)" }}>
                                {formatDuration(ep.durationSeconds)}
                              </p>
                            ) : null}
                          </div>

                          {/* Mark complete */}
                          <button
                            onClick={() => toggleComplete(lesson.key)}
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
                </div>
              );
            })}
        </div>

        <p className="mt-6 px-1 text-[11px] italic leading-relaxed" style={{ color: "rgba(143,175,150,0.5)" }}>
          Audio from “The Way of Love: A Rule of Life,” Episcopal Diocese of Washington. Plays in Phoebe's
          podcast player; your progress is saved on this device.
        </p>
      </div>
    </Layout>
  );
}
