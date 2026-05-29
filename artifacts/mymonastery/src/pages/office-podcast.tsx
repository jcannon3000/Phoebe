import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useOfficePrefs, setOfficeAudioSource, type OfficeAudioSource } from "@/lib/officePrefs";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { usePodcastPlayer } from "@/components/PodcastPlayer";
import { useTranslation } from "react-i18next";

// ── /podcast/:show — daily office podcasts, embedded ──
//
// One generic player for the read-aloud Morning / Evening Prayer office.
// The show (side) is derived from the path: /podcast/evening-office vs
// anything else (/podcast/morning-office). Surfaced as options on the
// prayer chooser; this page plays today's episode inline with a thin
// Phoebe header, the same in-app-not-ejected feel as the National
// Cathedral watch page (/ncmp/watch).
//
// Source toggle: the office can be played in either of two traditions —
// Forward Movement (the US 1979 BCP offices, the default) or the Church
// of England (Common Worship Morning/Evening Prayer). The toggle writes
// the per-device `officeAudioSource` pref (also settable in Settings),
// and the /today fetch passes ?source= so the server returns the right
// feed's episode.
//
// Playback + engagement:
//   This page is a launch screen — it does NOT own an <audio> element.
//   Tapping Listen hands today's episode to the GLOBAL podcast player
//   (usePodcastPlayer().play), so the office gets the same persistent
//   mini-bar + minimize as podcasts and keeps playing while you navigate.
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
  side: "morning" | "evening";       // also the office-completed mode key
  headerLabel: string;
  fallbackTitle: string;
  blurb: string;
}> = {
  "morning-office": {
    apiSlug: "morning-office",
    surface: "morning-office-podcast",
    side: "morning",
    headerLabel: "🎧 Morning Prayer",
    fallbackTitle: "Daily Morning Prayer",
    blurb: "The full order of Morning Prayer from the Book of Common Prayer, read aloud. A new episode every morning.",
  },
  "evening-office": {
    apiSlug: "evening-office",
    surface: "evening-office-podcast",
    side: "evening",
    headerLabel: "🎧 Evening Prayer",
    fallbackTitle: "An Evening at Prayer",
    blurb: "The full order of Evening Prayer from the Book of Common Prayer, read aloud. A new episode every evening.",
  },
};

// Per-source display copy. `provider` shows under the title; `blurb`
// describes the office in that tradition's terms.
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
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
  // Forward Movement blue — FDD / Forward Movement's identity color
  // across the app (home card, office-close pill, this player), kept
  // distinct from the green BCP offices and the purple National
  // Cathedral card on the chooser.
  border: "rgba(96,141,209,0.45)",
  cardBg: "rgba(96,141,209,0.15)",
  accent: "#8FB4E0",
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

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export default function OfficePodcastPage() {
  const [location, setLocation] = useLocation();
  const showKey: ShowKey = location.includes("evening") ? "evening-office" : "morning-office";
  const show = SHOWS[showKey];

  // Which tradition to play. Reactive to the pref event so toggling the
  // segmented control below (or changing the default in Settings) swaps
  // the feed without a remount.
  const { officeAudioSource } = useOfficePrefs();
  const sourceMeta = SOURCE_META[officeAudioSource];
  const { t } = useTranslation();
  const isCoE = officeAudioSource === "church-of-england";
  const sourceLabel = t(isCoE ? "podcasts.office_source_coe" : "podcasts.office_source_fm", { defaultValue: sourceMeta.provider });
  const blurb = t(`podcasts.office_blurb_${isCoE ? "coe" : "fm"}_${show.side}`, { defaultValue: sourceMeta.blurb(show.side) });

  const { data: episode, isLoading } = useQuery<Episode>({
    // Source is in the key so switching re-fetches the right feed.
    queryKey: [`/api/podcast/${show.apiSlug}/today`, officeAudioSource],
    queryFn: () =>
      apiRequest("GET", `/api/podcast/${show.apiSlug}/today?source=${encodeURIComponent(officeAudioSource)}`),
    staleTime: 30 * 60_000,
  });

  // The episode artwork comes from the external podcast feed (Forward
  // Movement); some of those image URLs hotlink-protect, CORS-block,
  // or 404, which renders the browser's broken-image icon. Track a
  // load failure so we can swap in a calm branded tile instead of a
  // broken box. Reset whenever the image URL changes (new episode).
  const [artworkFailed, setArtworkFailed] = useState(false);
  useEffect(() => { setArtworkFailed(false); }, [episode?.imageUrl]);

  // Playback runs through the GLOBAL podcast player (see file header), so
  // the office audio gets the same persistent mini-bar + minimize and
  // keeps playing as you navigate. We just hand it today's episode tagged
  // with the office surface + credit mode; the player owns the <audio>
  // element and all the session bookkeeping.
  const player = usePodcastPlayer();
  const playerSlug = `office-${show.side}`;        // office-morning | office-evening
  const episodeId = episode?.audioUrl ?? "";       // unique per recording / source
  const isThis = !!episode?.audioUrl && player.isCurrent(playerSlug, episodeId);
  const playingThis = isThis && player.isPlaying;

  function launch() {
    if (!episode?.audioUrl) return;
    if (isThis) { player.toggle(); return; }        // already loaded — just play/pause
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
      sessionSurface: show.surface,    // morning/evening-office-podcast
      creditMode: show.side,           // stamps office-completed at >=180s
      skipHistory: true,               // daily office — not podcast history
      hideRecommend: true,             // a daily office isn't a shareable ep
      showHref: `/podcast/${show.apiSlug}`,
    });
  }

  const durationLabel = formatDuration(episode?.durationSeconds ?? null);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        background: PALETTE.bg,
        color: PALETTE.warm,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AnimatedBackground base={PALETTE.bg} variant="pronounced" fadeTop />
      <header
        style={{
          paddingTop: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))",
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 10,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{
            justifySelf: "start",
            background: "none",
            border: "none",
            color: PALETTE.sage,
            fontFamily: FONT,
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← {t("common.back")}
        </button>
        <span
          className="rounded-full"
          style={{
            background: PALETTE.cardBg,
            border: `1px solid ${PALETTE.border}`,
            color: PALETTE.warm,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            padding: "6px 14px",
            whiteSpace: "nowrap",
          }}
        >
          🎧 {t(show.side === "evening" ? "offices.evening_prayer" : "offices.morning_prayer")}
        </span>
        <span />
      </header>

      <main
        style={{
          flex: 1,
          padding: "20px 20px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {/* Source switcher — Forward Movement ↔ Church of England.
            Always visible (even while today's episode loads) so the
            choice reads as part of the player, not an afterthought.
            Tapping persists the default via setOfficeAudioSource. */}
        <div
          role="tablist"
          aria-label={t("podcasts.office_tradition_aria")}
          style={{
            display: "flex",
            gap: 4,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 999,
            padding: 4,
          }}
        >
          {(["forward-movement", "church-of-england"] as const).map((s) => {
            const active = officeAudioSource === s;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setOfficeAudioSource(s)}
                style={{
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: FONT,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  background: active ? PALETTE.cardBg : "transparent",
                  border: `1px solid ${active ? PALETTE.border : "transparent"}`,
                  color: active ? PALETTE.warm : PALETTE.faint,
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {t(s === "church-of-england" ? "podcasts.office_source_coe" : "podcasts.office_source_fm", { defaultValue: SOURCE_META[s].label })}
              </button>
            );
          })}
        </div>

        {isLoading && !episode ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 48 }}>
            {t("podcasts.office_loading")}
          </p>
        ) : !episode?.audioUrl ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 48, textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
            {t("podcasts.office_error")}
          </p>
        ) : (
          <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            {episode.imageUrl && !artworkFailed ? (
              <img
                src={episode.imageUrl}
                alt={episode.feedTitle ?? show.fallbackTitle}
                onError={() => setArtworkFailed(true)}
                style={{
                  width: "min(72vw, 320px)",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  borderRadius: 20,
                  border: `1px solid ${PALETTE.border}`,
                }}
              />
            ) : (
              // Branded fallback when the feed artwork is missing or
              // fails to load — a calm candlelit tile rather than the
              // browser's broken-image icon or an empty bordered box.
              <div
                style={{
                  width: "min(72vw, 320px)",
                  aspectRatio: "1 / 1",
                  borderRadius: 20,
                  border: `1px solid ${PALETTE.border}`,
                  background: PALETTE.cardBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label={episode.feedTitle ?? show.fallbackTitle}
              >
                <span style={{ fontSize: 72, lineHeight: 1 }} aria-hidden>
                  {show.side === "evening" ? "🌙" : "🕯️"}
                </span>
              </div>
            )}

            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                  fontWeight: 600,
                  color: PALETTE.accent,
                  margin: 0,
                }}
              >
                {episode.feedTitle ?? show.fallbackTitle}
              </p>
              {episode.title && (
                <h1
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: PALETTE.warm,
                    margin: "6px 0 0",
                    lineHeight: 1.25,
                  }}
                >
                  {episode.title}
                </h1>
              )}
              <p style={{ fontSize: 12, color: PALETTE.sage, margin: "8px 0 0" }}>
                {durationLabel ? `${durationLabel} · ${sourceLabel}` : sourceLabel}
              </p>
            </div>

            {/* Hand off to the global player — gets the persistent
                mini-bar + minimize (⌄), and playback survives leaving
                this page. Once it's the current episode the button
                mirrors play/pause. */}
            <button
              type="button"
              onClick={launch}
              style={{
                marginTop: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                borderRadius: 999,
                padding: "13px 30px",
                fontSize: 15,
                fontWeight: 700,
                fontFamily: FONT,
                cursor: "pointer",
                background: PALETTE.accent,
                color: PALETTE.bg,
                border: "none",
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>{playingThis ? "⏸" : "▶"}</span>
              {playingThis ? t("podcasts.office_pause") : isThis ? t("podcasts.office_resume") : t("podcasts.office_listen")}
            </button>

            <p
              style={{
                fontSize: 13,
                color: PALETTE.warm,
                margin: "4px 0 0",
                lineHeight: 1.5,
                textAlign: "center",
                maxWidth: 380,
              }}
            >
              {blurb}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
