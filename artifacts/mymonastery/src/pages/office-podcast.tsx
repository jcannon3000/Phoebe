import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useOfficePrefs, type OfficeAudioSource } from "@/lib/officePrefs";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { usePodcastPlayer } from "@/components/PodcastPlayer";
import { useTranslation } from "react-i18next";

// ── /podcast/:show — daily office podcasts, pass-through launcher ──
//
// One generic launcher for the read-aloud Morning / Evening Prayer office.
// The show (side) is derived from the path: /podcast/evening-office vs
// anything else (/podcast/morning-office). Surfaced as options on the
// prayer chooser.
//
// This page is a pass-through — it fetches today's episode and hands it
// to the GLOBAL podcast player (usePodcastPlayer().play) as soon as the
// data is ready, then navigates to the dashboard. The player opens in
// full-screen mode immediately; there is no intermediate launch card.
// The source toggle (Forward Movement ↔ Church of England) now lives
// on the full-screen player itself.
//
// Playback + engagement:
//   We tag the handed-off episode with sessionSurface
//   ("{morning,evening}-office-podcast") and creditMode ("morning" |
//   "evening"): the player accumulates ACTUAL playback time and, on
//   commit (background / close / episode-change), POSTs one prayer-
//   session row under that surface. A session >= 3 minutes stamps the
//   local office-completed flag for that side so the dashboard lights up
//   immediately, and the server independently treats a >=180s row as
//   that office (see users.ts), so credit survives a refetch / device.

type ShowKey = "morning-office" | "evening-office";

const SHOWS: Record<ShowKey, {
  apiSlug: string;
  surface: string;
  side: "morning" | "evening";
  headerLabel: string;
  fallbackTitle: string;
}> = {
  "morning-office": {
    apiSlug: "morning-office",
    surface: "morning-office-podcast",
    side: "morning",
    headerLabel: "🎧 Morning Prayer",
    fallbackTitle: "Daily Morning Prayer",
  },
  "evening-office": {
    apiSlug: "evening-office",
    surface: "evening-office-podcast",
    side: "evening",
    headerLabel: "🎧 Evening Prayer",
    fallbackTitle: "An Evening at Prayer",
  },
};

const SOURCE_META: Record<OfficeAudioSource, {
  label: string;
  provider: string;
  blurb: (side: "morning" | "evening") => string;
}> = {
  "forward-movement": {
    label: "Forward Movement",
    provider: "Forward Movement",
    blurb: (side) =>
      `The full order of ${side === "evening" ? "Evening" : "Morning"} Prayer from the Book of Common Prayer, read aloud. A new episode every ${side === "evening" ? "evening" : "morning"}.`,
  },
  "church-of-england": {
    label: "Church of England",
    provider: "Church of England",
    blurb: (side) =>
      `Common Worship ${side === "evening" ? "Evening" : "Morning"} Prayer from the Church of England, read aloud. A new recording every day.`,
  },
};

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

export default function OfficePodcastPage() {
  const [location, setLocation] = useLocation();
  const showKey: ShowKey = location.includes("evening") ? "evening-office" : "morning-office";
  const show = SHOWS[showKey];

  const { officeAudioSource } = useOfficePrefs();
  const sourceMeta = SOURCE_META[officeAudioSource];
  const { t } = useTranslation();
  const isCoE = officeAudioSource === "church-of-england";
  const blurb = t(`podcasts.office_blurb_${isCoE ? "coe" : "fm"}_${show.side}`, { defaultValue: sourceMeta.blurb(show.side) });

  const { data: episode, isLoading } = useQuery<Episode>({
    queryKey: [`/api/podcast/${show.apiSlug}/today`, officeAudioSource],
    queryFn: () =>
      apiRequest("GET", `/api/podcast/${show.apiSlug}/today?source=${encodeURIComponent(officeAudioSource)}`),
    staleTime: 30 * 60_000,
  });

  // The dedicated "pray-along" page is now superseded by the immersive office
  // player (PodcastPlayer), which carries the live liturgy section titles
  // itself — so every listener gets the section-title feature in one place,
  // not just beta + Forward Movement. The old redirect is disabled; the page
  // below always hands the episode to the full-screen player.
  const prayAlong = false;

  const player = usePodcastPlayer();
  const playerSlug = `office-${show.side}`;
  const episodeId = episode?.audioUrl ?? "";
  const isThis = !!episode?.audioUrl && player.isCurrent(playerSlug, episodeId);

  function launch() {
    if (!episode?.audioUrl) return;
    if (isThis) { player.toggle(); return; }
    player.play({
      showSlug: playerSlug,
      episodeId,
      title: episode.title,
      audioUrl: episode.audioUrl,
      imageUrl: episode.imageUrl,
      showTitle: episode.feedTitle ?? show.fallbackTitle,
      showArtwork: episode.imageUrl,
      durationSeconds: episode.durationSeconds,
      publishedAt: episode.publishedAt,
      description: blurb,
      sessionSurface: show.surface,
      creditMode: show.side,
      skipHistory: true,
      hideRecommend: true,
      showHref: `/podcast/${show.apiSlug}`,
      // When the office finishes, hand off to the closing flow (reflection /
      // whatever the user has set after the office), same as before.
      afterEndHref: `/prayer-mode?afterOffice=1&side=${show.side}`,
    });
  }

  // As soon as today's episode is available, hand it to the global player
  // (which opens full-screen) and navigate to the dashboard. No card screen.
  const launched = useRef(false);
  useEffect(() => {
    if (prayAlong || launched.current || !episode?.audioUrl) return;
    launched.current = true;
    launch();
    setLocation("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.audioUrl, prayAlong]);

  // Brief loading / error fallback — normally covered by the player overlay
  // before the user has time to notice it.
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
            {t("podcasts.office_error")}
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
          {t("podcasts.office_loading")}
        </p>
      )}
    </div>
  );
}
