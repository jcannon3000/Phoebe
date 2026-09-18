import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { usePodcastPlayer } from "@/components/PodcastPlayer";
import { markQuietHandoff } from "@/lib/handoffQuiet";

// ── /reflect/lectio — Guided Lectio Divina (Abiding Way Ministries) ────────
//
// Owner, 2026-09-18, with their site: "can we add their daily lectio
// podcast?" · "Call it Guided Lectio Divina" · "ANd have it work like Pray as
// You Go".
//
// So: the same shape as /reflect/payg. A pass-through page — fetch the day's
// episode, hand it to the app's own audio player (which keeps playing in the
// background, shows on the lock screen and collapses to the mini bar), and
// land on the home. Nothing of theirs is copied: the server reads their public
// podcast feed and the audio, title and artwork are served from them.
//
// Their episodes are titled by the day they are for and posted the evening
// before, so the server is told which day this phone is on and matches the
// title (routes/podcast.ts).

const PALETTE = {
  bg: "#091A10",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Episode = {
  feedTitle: string | null;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  imageUrl: string | null;
  /** Their own page for this session — the player's Transcript pill. */
  pageUrl?: string | null;
};

export default function ReflectLectioPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  // The listener's own day: their sessions are stamped for the day they are
  // for, and the next day's is usually up the evening before, so the server
  // needs to be told which day this phone is on.
  const today = new Date().toLocaleDateString("en-CA");

  const { data: episode, isLoading } = useQuery<Episode>({
    queryKey: ["/api/podcast/abiding-way-lectio/today", today],
    queryFn: () => apiRequest("GET", `/api/podcast/abiding-way-lectio/today?date=${today}`),
    staleTime: 30 * 60_000,
  });

  const player = usePodcastPlayer();
  const launched = useRef(false);
  useEffect(() => {
    if (launched.current || !episode?.audioUrl) return;
    launched.current = true;
    player.play({
      showSlug: "abiding-way-lectio",
      episodeId: episode.audioUrl,
      title: episode.title,
      audioUrl: episode.audioUrl,
      imageUrl: episode.imageUrl,
      showTitle: episode.feedTitle ?? "Guided Lectio Divina",
      showArtwork: episode.imageUrl,
      durationSeconds: episode.durationSeconds,
      publishedAt: episode.publishedAt,
      description: t("podcasts.abiding_lectio_blurb", {
        defaultValue: "The day's lectio divina from Abiding Way Ministries: a passage read slowly, with silence and a guide.",
      }),
      sessionSurface: "abiding-lectio-audio",
      // NOT a reflection source (that registry is Pray As You Go's and the
      // written ones); this is a contemplative practice you choose, so only
      // the time is credited.
      // Owner: "when someone listens to it have it count towards their
      // contemplation time too like breathing together does."
      creditContemplation: true,
      // No transcript pill here — owner, 2026-09-18: "also there is not
      // transcript button needed there". Their lectio page is the session
      // itself rather than a script to read along with, so the pill offered
      // something that wasn't there.
      showHref: "/reflect/lectio",
    });
    // Handed back to the home with audio already playing — one swell there,
    // not a tick under every card (lib/handoffQuiet).
    markQuietHandoff();
    setLocation("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.audioUrl]);

  // Only ever seen for the moment the fetch takes, and if their feed can't be
  // reached — never a blank screen (reference_blank_screen_bug_class).
  return (
    <div style={{
      position: "fixed", inset: 0, background: PALETTE.bg,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 16, fontFamily: FONT,
    }}>
      <AnimatedBackground base={PALETTE.bg} variant="pronounced" fadeTop />
      {!isLoading && !episode?.audioUrl ? (
        <>
          <p style={{ color: PALETTE.faint, fontSize: 13, textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
            {t("podcasts.abiding_lectio_error", { defaultValue: "Today's lectio couldn't be reached. Please try again in a moment." })}
          </p>
          <button
            type="button"
            onClick={() => setLocation("/dashboard")}
            style={{ background: "none", border: "none", color: PALETTE.sage, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}
          >
            ← {t("common.back")}
          </button>
        </>
      ) : (
        <p style={{ color: PALETTE.faint, fontSize: 13 }}>
          {t("podcasts.abiding_lectio_loading", { defaultValue: "Finding today's lectio…" })}
        </p>
      )}
    </div>
  );
}
