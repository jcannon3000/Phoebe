/**
 * Turn / Learn / Pray detail page — reached by tapping the weekly dot card
 * on the home. The card itself leads (same component, same live state), then
 * one explanation card per practice below it, so a curious tap answers "what
 * counts as each of these?" without leaving the app.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { WayOfLoveTurnLearnPray, usePracticeModePref } from "@/components/WayOfLoveTurnLearnPray";
import { PracticeCard } from "@/components/DailyProgressBody";
import { usePodcastPlayer, type PlayingEpisode } from "@/components/PodcastPlayer";
import { useCourseProgress } from "@/lib/courseProgress";
import { WAY_OF_LOVE, resolveWolEpisodes, type PodcastEpisode } from "@/lib/wayOfLoveCourse";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { useRhythmState } from "@/hooks/useRhythmState";
import { getSideLevel, sideOfficeTitle } from "@/lib/officePrefs";
import { markCustomPrayed, unmarkCustomPrayed } from "@/lib/cacReadState";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_BORDER = "rgba(200,212,192,0.35)";

// Owner: the backdrop should actually rotate, not just pick once and hold
// for the whole visit — every other page's "rotates" (see contemplation.tsx)
// only means "a different one next time you MOUNT this page," which reads
// static if you just sit here. This is a genuinely new behavior: cycles to
// a fresh random photo every 20s while the page stays open. Layout's own
// LayoutBackdrop already fades in on a photo-prop change (decode-aware,
// 0.8s opacity transition), so simply changing what this hook returns is
// enough to get a smooth crossfade-ish rotation for free — no new
// transition logic needed here.
const BG_ROTATE_MS = 20_000;
function useBgPhoto(): string | null {
  const pick = () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null);
  const [photo, setPhoto] = useState<string | null>(pick);
  useEffect(() => {
    if (LEAF_PHOTOS.length <= 1) return; // nothing else to rotate to
    const id = setInterval(() => {
      setPhoto((current) => {
        // Avoid an immediate repeat — with only a couple of photos a plain
        // random pick would visibly "rotate" back to the same one often.
        let next = pick();
        let guard = 0;
        while (next === current && guard < 5) { next = pick(); guard++; }
        return next;
      });
    }, BG_ROTATE_MS);
    return () => clearInterval(id);
  }, []);
  return photo;
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

// The Morning/Contemplative/Evening reading of the same three explanation
// cards — shown instead of EXPLANATIONS when the viewer has that Settings
// toggle on. No lessonKey/podcast CTA: Bishop Budde's Way of Love episodes
// are specifically about Turn/Learn/Pray, not this framing, so it's dropped
// rather than shown out of context.
const MCE_EXPLANATIONS: Array<{ letter: string; title: string; blurb: string; slot: "morning" | "contemplative" | "evening" }> = [
  {
    letter: "M",
    title: "Morning",
    blurb: "Whatever opens your day — Morning Prayer, a devotion, Praying the Psalms, or a practice you've named yourself.",
    slot: "morning",
  },
  {
    letter: "C",
    title: "Contemplative",
    blurb: "Time set aside for silence — a contemplation sit, Creation Prayer, or however you observe it, morning or evening.",
    slot: "contemplative",
  },
  {
    letter: "E",
    title: "Evening",
    blurb: "Whatever closes the day — Evening Prayer, Compline, or your own evening anchor.",
    slot: "evening",
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
  const practiceMode = usePracticeModePref();
  const rhythm = useRhythmState();
  // Same source data computeWeeklyGrid (lib/weeklyGrid.ts) reads for its
  // Morning/Contemplative/Evening row-done flags — not calling that function
  // itself here since it also needs a practice-week network fetch this
  // summary doesn't; these three lines just mirror its one-line expressions.
  const creationStyle = rhythm.contemplationStyle === "cobreathe";
  // Which slots the viewer actually has turned on — a row with nothing kept
  // in it isn't a live status, so it's dropped rather than shown empty.
  const contemplativeActive = rhythm.morningContemplationActive || rhythm.eveningContemplationActive
    || rhythm.silenceGoalCardActive || rhythm.cobreatheActive;
  const slotActive: Record<"morning" | "contemplative" | "evening", boolean> = {
    morning: rhythm.morningActive,
    contemplative: contemplativeActive,
    evening: rhythm.eveningActive,
  };
  const slotStatus: Record<"morning" | "contemplative" | "evening", { title: string; emoji: string; done: boolean; href: string; onClick?: () => void }> = {
    morning: {
      title: sideOfficeTitle("Morning", rhythm.prayerKind, t),
      emoji: "🌅",
      done: rhythm.morningDone,
      href: getSideLevel("morning") === "custom" ? "" : "/begin-prayer?side=morning",
      onClick: getSideLevel("morning") === "custom" ? () => (rhythm.morningDone ? unmarkCustomPrayed("morning") : markCustomPrayed("morning")) : undefined,
    },
    contemplative: {
      title: creationStyle ? t("rhythm.card_creation", { defaultValue: "Creation Prayer" }) : t("rhythm.card_contemplation", { defaultValue: "Contemplation" }),
      emoji: creationStyle ? "🌍" : "🕯️",
      done: rhythm.morningContemplationDone || rhythm.eveningContemplationDone || rhythm.silenceGoalCardDone || rhythm.cobreatheDone,
      href: creationStyle ? "/cobreathe?start=1" : "/contemplation",
    },
    evening: {
      title: sideOfficeTitle("Evening", rhythm.prayerKind, t),
      emoji: "🌙",
      done: rhythm.eveningDone,
      href: getSideLevel("evening") === "custom" ? "" : "/begin-prayer?side=evening",
      onClick: getSideLevel("evening") === "custom" ? () => (rhythm.eveningDone ? unmarkCustomPrayed("evening") : markCustomPrayed("evening")) : undefined,
    },
  };
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
    // Page backdrop delegated to Layout's own bgPhoto/bgOpacity — this page
    // used to hand-roll its own img + gradient wash (absolute inset-0 inside
    // a plain `relative` div), but that div's height is driven by the whole
    // page's content, which on a page this long (podcast cards + course
    // lessons + the weekly grid + 3 explanation cards) stretched the photo
    // across a much taller area than intended, producing the distorted,
    // awkwardly-cropped backdrop reported. Layout's LayoutBackdrop instead
    // uses `position: fixed` bound to the viewport (with a decode-aware
    // fade-in so it doesn't flash) — the same well-tested mechanism most of
    // the app's pages already use; about.tsx uses this exact prop pattern
    // for the same photo+wash treatment.
    <Layout bgPhoto={bgPhoto} bgOpacity={0.4}>
        <div className="max-w-2xl mx-auto w-full pb-24">
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="inline-flex items-center gap-1.5 text-sm mb-5"
            style={{ color: SAGE, background: "none", border: "none", cursor: "pointer" }}
          >
            <ChevronLeft size={14} /> {t("common.back", { defaultValue: "Back" })}
          </button>

          {!practiceMode && (
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: FAINT, fontFamily: FONT }}>
              Way of Love
            </p>
          )}
          <h1 className="text-2xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
            Weekly Progress
          </h1>

          {/* Same card as the home — a status mirror, not a new place to log
              anything. Its own tap target still points here, which is a
              harmless no-op re-navigation on this page. */}
          <WayOfLoveTurnLearnPray />

          {/* Second section — the three practice explanations, each with a
              "listen" CTA. */}
          <div className="flex items-center gap-3 mt-9 mb-2">
            <h2 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>
              {/* Owner: call this "Anchor practices". The old heading was just
                  the three row labels run together, which read as a fragment
                  rather than a name for what the section is — and the middle
                  row isn't always "Contemplative" now (it becomes Reflection
                  for someone who keeps a newsletter and no silent practice),
                  so the literal list had started to lie as well. */}
              {practiceMode ? "Anchor practices" : "Turn Learn Pray"}
            </h2>
            <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
          </div>
          <p className="text-[14px] mb-2 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
            {practiceMode
              ? "Each row in the grid above is a practice; each column is a day. Here's what each row stands for, and where you are on it today."
              : "The first three of the Episcopal Church's seven Way of Love practices — the daily spine underneath the weekly ones (Worship, Bless, Go, Rest)."}
          </p>
          <div className="flex flex-col gap-3">
          {practiceMode ? MCE_EXPLANATIONS.filter((e) => slotActive[e.slot]).map((e) => {
            const s = slotStatus[e.slot];
            return (
              <div
                key={e.letter}
                className="relative flex rounded-3xl overflow-hidden"
                style={{ background: "rgba(46,107,64,0.07)", border: `1px solid ${CARD_BORDER}` }}
              >
                <div className="w-1.5 flex-shrink-0" style={{ background: "rgba(110,180,130,0.72)" }} />
                <div className="flex-1 px-5 py-5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex-shrink-0 flex items-center justify-center rounded-full text-[15px]"
                      style={{ width: 26, height: 26, background: "rgba(110,180,130,0.18)" }}
                    >
                      {s.emoji}
                    </span>
                    <p className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>{e.title}</p>
                  </div>
                  <p className="text-[13.5px] mt-2 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
                    {e.blurb}
                  </p>
                  {/* The actual practice in this slot today — same compact
                      card the home screen renders, so this reads as a live
                      status, not just prose. */}
                  <div className="mt-3.5">
                    <PracticeCard
                      href={s.href}
                      emoji={s.emoji}
                      title={s.title}
                      blurb={s.done ? "Kept today" : "Not yet today"}
                      cta={t("rhythm.begin", { defaultValue: "Begin" })}
                      done={s.done}
                      rgb={e.slot === "contemplative" ? "62,124,122" : "46,107,64"}
                      later={false}
                      onClick={s.onClick}
                    />
                  </div>
                </div>
              </div>
            );
          }) : EXPLANATIONS.map((e) => (
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
          {/* Owner: a "shape your routine" button at the bottom of this. The
              page explains what each row IS; the natural next thought is
              changing them, and until now that meant backing out to the menu. */}
          {practiceMode && (
            <button
              type="button"
              onClick={() => setLocation("/rule-of-life")}
              className="w-full mt-5 rounded-2xl text-[15px] font-semibold transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{
                background: "rgba(46,107,64,0.55)",
                border: `1px solid ${CARD_BORDER}`,
                color: WARM, fontFamily: FONT, padding: "14px 20px", cursor: "pointer",
              }}
            >
              {t("menu.shape_routine", { defaultValue: "Shape your routine" })} →
            </button>
          )}
        </div>
    </Layout>
  );
}
