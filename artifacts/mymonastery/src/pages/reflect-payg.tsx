import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { usePodcastPlayer } from "@/components/PodcastPlayer";

// ── /reflect/payg — Pray As You Go Daily ────────────────────────────────────
//
// Owner, 2026-09-17, with a link to one of their sessions: "we want it as a
// daily reflection, but it comes up as an audio player", "instead of opening
// to there website … open to play the podcast", "no we want it in the standard
// ui for audio which is the backround library".
//
// So this is a reflection card like the CAC one, except that the tap opens the
// app's own audio player rather than a publisher's page — the SAME player the
// Audio library uses, which keeps playing in the background, shows on the lock
// screen and collapses to the mini bar. Nothing of theirs is copied: the
// server reads their public podcast feed (the one Apple lists) and hands back
// the day's episode; the audio, the title and the artwork are served from
// them. Unlike the Dean's Commentary, no text is brought into Phoebe.
//
// A pass-through page, exactly like office-podcast.tsx: fetch today's session,
// hand it to the player, land on the home. The player marks the reflection
// read once about two thirds of it has been heard (see creditReflection in
// PodcastPlayer) — the same bar the audio offices are counted at, and the same
// mark the card's dot reads.

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
};

export default function ReflectPaygPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  // The listener's own day: their sessions are stamped for the day they are
  // for, and the next day's is usually up the evening before, so the server
  // needs to be told which day this phone is on.
  const today = new Date().toLocaleDateString("en-CA");

  const { data: episode, isLoading } = useQuery<Episode>({
    queryKey: ["/api/podcast/pray-as-you-go/today", today],
    queryFn: () => apiRequest("GET", `/api/podcast/pray-as-you-go/today?date=${today}`),
    staleTime: 30 * 60_000,
  });

  const player = usePodcastPlayer();
  const launched = useRef(false);
  useEffect(() => {
    if (launched.current || !episode?.audioUrl) return;
    launched.current = true;
    player.play({
      showSlug: "pray-as-you-go",
      episodeId: episode.audioUrl,
      title: episode.title,
      audioUrl: episode.audioUrl,
      imageUrl: episode.imageUrl,
      showTitle: episode.feedTitle ?? "Pray As You Go Daily",
      showArtwork: episode.imageUrl,
      durationSeconds: episode.durationSeconds,
      publishedAt: episode.publishedAt,
      description: t("podcasts.payg_blurb", {
        defaultValue: "The day's prayer from Pray As You Go: music, a reading from scripture, and a few questions to sit with.",
      }),
      sessionSurface: "payg-audio",
      // Counts the reflection read once it has been heard — the card's dot,
      // the streak and any side that takes this as its prayer all follow.
      creditReflection: "payg",
      showHref: "/reflect/payg",
    });
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
            {t("podcasts.payg_error", { defaultValue: "Today's session couldn't be reached. Please try again in a moment." })}
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
          {t("podcasts.payg_loading", { defaultValue: "Finding today's session…" })}
        </p>
      )}
    </div>
  );
}
