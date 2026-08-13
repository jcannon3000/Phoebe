/**
 * Turn / Learn / Pray detail page — reached by tapping the weekly dot card
 * on the home. The card itself leads (same component, same live state), then
 * one explanation card per practice below it, so a curious tap answers "what
 * counts as each of these?" without leaving the app.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { WayOfLoveTurnLearnPray } from "@/components/WayOfLoveTurnLearnPray";
import { usePodcastPlayer, type PlayingEpisode } from "@/components/PodcastPlayer";
import { useCourseProgress } from "@/lib/courseProgress";
import { WAY_OF_LOVE, resolveWolEpisodes, type PodcastEpisode } from "@/lib/wayOfLoveCourse";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_BORDER = "rgba(200,212,192,0.35)";

// Same page-backdrop recipe used elsewhere (about.tsx, invite-share.tsx): a
// still leaf photo behind everything with a frosted gradient wash — never
// position:fixed (flashes on iOS); absolute inset-0 inside an isolated
// stacking context instead. Picked once per mount.
function useBgPhoto(): string | null {
  return useState(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null))[0];
}

// Maps each explanation card to its Way of Love course lesson — the same
// "experiencing-jesus" podcast episodes the /way-of-love-course page plays,
// so tapping the CTA here uses the exact same player + completion tracking.
const EXPLANATIONS: Array<{ letter: string; title: string; blurb: string; lessonKey: string }> = [
  {
    letter: "T",
    title: "Turn",
    blurb: "Showing up at all. Opening Phoebe today is Turn — there's nothing else to do for it. It's the first, smallest step of the Way of Love: turning toward God before anything else happens.",
    lessonKey: "turn",
  },
  {
    letter: "L",
    title: "Learn",
    blurb: "Reading something that carries Scripture. A reflection (CAC, Forward Day by Day, or SSJE), or a side whose chosen practice is the Office or a Devotion — Praying the Psalms, Contemplation, the Examen, and Simple Guided Prayer don't count here, since none of them carry an actual lectionary lesson.",
    lessonKey: "learn",
  },
  {
    letter: "P",
    title: "Pray",
    blurb: "Keeping any anchor at all today — Morning or Evening Prayer, Compline, Contemplation, Creation Prayer, the Examen, whatever you've set. One kept anchor is enough to fill Pray for the day.",
    lessonKey: "pray",
  },
];

interface ShowResponse {
  show?: { slug: string; title: string; artist: string; artwork: string | null };
  episodes?: PodcastEpisode[];
}

export default function TurnLearnPrayPage() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const bgPhoto = useBgPhoto();
  const player = usePodcastPlayer();
  const { isComplete, setLast, markStarted } = useCourseProgress(WAY_OF_LOVE.id);
  const { data } = useQuery<ShowResponse>({
    queryKey: [`/api/podcasts/show/${WAY_OF_LOVE.showSlug}`],
    queryFn: () => apiRequest("GET", `/api/podcasts/show/${WAY_OF_LOVE.showSlug}`),
    staleTime: 30 * 60_000,
  });
  const episodes = data?.episodes ?? [];
  const showArtwork = data?.show?.artwork ?? null;
  const epMap = useMemo(() => resolveWolEpisodes(episodes), [episodes]);

  const playLesson = (lessonKey: string) => {
    const ep = epMap[lessonKey];
    if (!ep?.audioUrl) return;
    const playing: PlayingEpisode = {
      showSlug: WAY_OF_LOVE.showSlug,
      episodeId: ep.id,
      title: ep.title,
      audioUrl: ep.audioUrl,
      imageUrl: ep.imageUrl ?? showArtwork,
      showTitle: WAY_OF_LOVE.title,
      showArtwork,
      durationSeconds: ep.durationSeconds,
      publishedAt: ep.publishedAt,
      description: ep.description,
      courseComplete: { courseId: WAY_OF_LOVE.id, lessonKey },
    };
    player.play(playing);
    setLast(lessonKey);
    markStarted();
  };

  if (isLoading) return null;
  if (!user) { setLocation("/"); return null; }

  return (
    <Layout>
      {/* Page backdrop — a still leaf photo + frosted gradient wash, same
          recipe as about.tsx / invite-share.tsx. isolate + absolute inset-0,
          never position:fixed (that flashes on iOS). */}
      <div className="relative" style={{ isolation: "isolate" }}>
        {bgPhoto && (
          <>
            <img
              src={bgPhoto}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: -2 }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                zIndex: -1,
                background: "linear-gradient(180deg, rgba(8,18,12,0.62) 0%, rgba(8,18,12,0.5) 45%, rgba(8,18,12,0.78) 100%)",
                backdropFilter: "blur(2px)",
                WebkitBackdropFilter: "blur(2px)",
              }}
            />
          </>
        )}
        <div className="max-w-2xl mx-auto w-full pb-24">
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="inline-flex items-center gap-1.5 text-sm mb-5"
            style={{ color: SAGE, background: "none", border: "none", cursor: "pointer" }}
          >
            <ChevronLeft size={14} /> {t("common.back", { defaultValue: "Back" })}
          </button>

          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: FAINT, fontFamily: FONT }}>
            Way of Love
          </p>
          <h1 className="text-2xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
            Weekly Progress
          </h1>
          <p className="text-[14px] mt-2 mb-2 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
            The first three of the Episcopal Church's seven Way of Love practices — the daily spine underneath the weekly ones (Worship, Bless, Go, Rest).
          </p>

          {/* Same card as the home — a status mirror, not a new place to log
              anything. Its own tap target still points here, which is a
              harmless no-op re-navigation on this page. */}
          <WayOfLoveTurnLearnPray />

          {/* Second section — the three practice explanations, each with a
              "listen" CTA. */}
          <div className="flex items-center gap-3 mt-9 mb-2">
            <h2 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>
              Turn Learn Pray
            </h2>
            <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
          </div>
          <div className="flex flex-col gap-3">
          {EXPLANATIONS.map((e) => (
            <div
              key={e.letter}
              className="relative flex rounded-3xl overflow-hidden"
              style={{ background: "rgba(46,107,64,0.07)", border: `1px solid ${CARD_BORDER}` }}
            >
              <div className="w-1.5 flex-shrink-0" style={{ background: "rgba(110,180,130,0.72)" }} />
              <div className="flex-1 px-5 py-5">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex-shrink-0 flex items-center justify-center rounded-full text-[13px] font-semibold"
                    style={{ width: 26, height: 26, background: "rgba(110,180,130,0.18)", color: WARM, fontFamily: FONT }}
                  >
                    {e.letter}
                  </span>
                  <p className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>{e.title}</p>
                </div>
                <p className="text-[13.5px] mt-2 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
                  {e.blurb}
                </p>
                {/* Only offered while this practice's lesson hasn't been
                    finished yet — once it's marked complete (the player
                    stamps it on the episode ending), the CTA drops rather
                    than nag a lesson you've already heard. Hidden entirely
                    if the episode hasn't resolved from the feed yet. */}
                {epMap[e.lessonKey]?.audioUrl && !isComplete(e.lessonKey) && (
                  <button
                    type="button"
                    onClick={() => playLesson(e.lessonKey)}
                    className="mt-3.5 inline-flex items-center gap-2 rounded-full text-[13px] font-semibold transition-opacity hover:opacity-90 active:scale-[0.99]"
                    style={{
                      background: "rgba(110,180,130,0.18)",
                      color: WARM,
                      fontFamily: FONT,
                      padding: "8px 16px",
                      border: "1px solid rgba(110,180,130,0.4)",
                      cursor: "pointer",
                    }}
                  >
                    <Play size={13} fill="currentColor" />
                    Listen to Podcast on {e.title} by Bishop Budde
                  </button>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
