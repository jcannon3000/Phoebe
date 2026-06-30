import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePodcastPlayer, type PlayingEpisode } from "@/components/PodcastPlayer";
import { toggleShowFollowed, useIsShowFollowed } from "@/lib/podcastHome";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// ── /podcasts/show/:slug — a show's episodes ────────────────────────────
//
// The browse-and-listen leaf. Lists a show's recent episodes; tapping one
// starts it in the GLOBAL player (see components/PodcastPlayer) so it
// keeps playing as you navigate away. Listening history + the listen-time
// prayer-session are recorded by the player, not here.
//
// Also: per-episode "✓ Listened" markers and ?ep=<id> deep-link
// auto-open. (Recommend ♡ now lives on the full-screen player.)

const PALETTE = {
  bg: "#0C1F12",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
  accent: "#A8C5A0",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Episode = {
  id: string;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  description: string | null;
  imageUrl: string | null;
};
type ShowResponse = {
  show: {
    slug: string; title: string; artist: string; artwork: string | null;
    publisher: string; publisherTitle: string; emoji: string;
    description: string | null;
  };
  episodes: Episode[];
};

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function formatDate(rfc822: string | null): string | null {
  if (!rfc822) return null;
  const d = new Date(rfc822);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Large centered cover art for the show header — Hallow-style, the
// artwork is the hero. Falls back to a calm headphones tile if the feed
// has no artwork or the image fails to load.
function HeroArt({ url, alt }: { url: string | null; alt: string }) {
  const box: CSSProperties = {
    width: "min(220px, 60vw)", aspectRatio: "1 / 1", borderRadius: 20,
    objectFit: "cover", display: "block", boxShadow: "0 12px 34px rgba(0,0,0,0.34)",
  };
  const fallback: CSSProperties = {
    ...box, background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(46,107,64,0.3)",
    alignItems: "center", justifyContent: "center", fontSize: 64,
  };
  if (url) {
    return (
      <div style={{ position: "relative" }}>
        <img
          src={url}
          alt={alt}
          style={{ ...box, background: "rgba(143,175,150,0.12)" }}
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            el.style.display = "none";
            const sib = el.nextElementSibling as HTMLElement | null;
            if (sib) sib.style.display = "flex";
          }}
        />
        <div style={{ ...fallback, display: "none" }} aria-hidden>🎧</div>
      </div>
    );
  }
  return <div style={{ ...fallback, display: "flex" }} aria-hidden>🎧</div>;
}

export default function PodcastShowPage() {
  const podcastBg = LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[0]! : null;
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const player = usePodcastPlayer();
  const { t } = useTranslation();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data, isLoading } = useQuery<ShowResponse>({
    queryKey: [`/api/podcasts/show/${slug}`],
    queryFn: () => apiRequest("GET", `/api/podcasts/show/${slug}`),
    enabled: !!user && !!slug,
    staleTime: 15 * 60_000,
  });

  const showData = data?.show;
  const epKey = (ep: Episode) => `${slug}:${ep.id}`;

  // Build the global-player payload from a feed episode + show.
  const toPlaying = (ep: Episode): PlayingEpisode => ({
    showSlug: slug,
    episodeId: ep.id,
    title: ep.title,
    audioUrl: ep.audioUrl ?? "",
    imageUrl: ep.imageUrl ?? null,
    showTitle: showData?.title ?? null,
    showArtwork: showData?.artwork ?? null,
    durationSeconds: ep.durationSeconds,
    publishedAt: ep.publishedAt,
    description: ep.description,
  });
  const playEpisode = (ep: Episode) => { if (ep.audioUrl) player.play(toPlaying(ep)); };

  // Auto-open an episode once the feed loads. ?ep=<id> opens a specific episode
  // (deep-link from a search / community result); ?play=latest (or ?ep=latest)
  // opens today's / the most recent episode straight in the player — used by the
  // Jardín "Oración Matutina" entry so it lands right on the podcast player.
  // Runs once.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    const eps = data?.episodes ?? [];
    if (eps.length === 0) return;
    let epId: string | null = null;
    let playLatest = false;
    try {
      const sp = new URLSearchParams(window.location.search);
      epId = sp.get("ep");
      playLatest = sp.get("play") === "latest" || epId === "latest";
    } catch { /* ignore */ }
    autoSelectedRef.current = true;
    if (playLatest) {
      const first = eps.find((e) => e.audioUrl);
      if (first) player.play(toPlaying(first));
      return;
    }
    if (!epId) return;
    const match = eps.find((e) => e.id === epId);
    if (match && match.audioUrl) player.play(toPlaying(match));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Listening history (drives the "✓ Listened" row markers) ──────────
  const queryClient = useQueryClient();
  const { data: me } = useQuery<{ listenedKeys: string[]; recommendedKeys: string[]; listenListKeys: string[] }>({
    queryKey: ["/api/podcasts/me"],
    queryFn: () => apiRequest("GET", "/api/podcasts/me"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const listenedSet = new Set(me?.listenedKeys ?? []);
  const listenListSet = new Set(me?.listenListKeys ?? []);

  const listenListMut = useMutation({
    mutationFn: ({ add, ep }: { add: boolean; ep: Episode }) => {
      if (add) {
        return apiRequest("POST", "/api/podcasts/listen-list", {
          showSlug: slug,
          episodeId: ep.id,
          episodeTitle: ep.title ?? undefined,
          episodeAudioUrl: ep.audioUrl ?? undefined,
          episodeImageUrl: ep.imageUrl ?? undefined,
          durationSeconds: ep.durationSeconds ?? undefined,
          publishedAt: ep.publishedAt ?? undefined,
          showTitle: showData?.title ?? undefined,
          showArtwork: showData?.artwork ?? undefined,
        });
      }
      return apiRequest("DELETE", "/api/podcasts/listen-list", { showSlug: slug, episodeId: ep.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/listen-list"] });
    },
  });

  // In-show episode list controls: free-text search + newest/oldest sort.
  const [query, setQuery] = useState("");
  const [sortNewest, setSortNewest] = useState(true);
  const episodes = data?.episodes ?? [];
  const visibleEpisodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? episodes.filter((ep) => `${ep.title ?? ""} ${ep.description ?? ""}`.toLowerCase().includes(q))
      : episodes;
    return [...filtered].sort((a, b) => {
      const ta = new Date(a.publishedAt ?? 0).getTime();
      const tb = new Date(b.publishedAt ?? 0).getTime();
      return sortNewest ? tb - ta : ta - tb;
    });
  }, [episodes, query, sortNewest]);

  if (authLoading || !user) return null;

  const show = data?.show;
  const followed = useIsShowFollowed(slug);

  return (
    <Layout bgPhoto={podcastBg}>
      <div className="w-full max-w-2xl mx-auto" style={{ color: PALETTE.warm, fontFamily: FONT, paddingBottom: player.current ? 96 : 40 }}>
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else if (show?.publisher) setLocation(`/podcasts/${show.publisher}`);
              else setLocation("/dashboard");
            }}
            style={{ background: "none", border: "none", color: PALETTE.sage, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            ← {t("common.back")}
          </button>
        </div>
        {/* Show header — Hallow-style image-forward hero. */}
        <div className="flex flex-col items-center text-center mb-7">
          <HeroArt url={show?.artwork ?? null} alt={show?.title ?? t("podcasts.show_fallback")} />
          <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600, color: PALETTE.faint, margin: "18px 0 0" }}>
            {show?.emoji ? `${show.emoji} ` : ""}{show?.publisherTitle ?? ""}
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "8px 0 0", lineHeight: 1.15, maxWidth: 420 }}>
            {show?.title ?? t("common.loading")}
          </h1>
          <p style={{ fontSize: 13.5, color: PALETTE.sage, margin: "6px 0 0" }}>
            {show?.artist ?? ""}
          </p>
          {show?.description && (
            <p
              style={{
                fontSize: 13.5, color: "rgba(200,212,192,0.82)", lineHeight: 1.55,
                margin: "14px 0 0", maxWidth: 460,
                display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}
            >
              {show.description}
            </p>
          )}
          {/* Add this show to the home screen — renders a progress card on
              the dashboard (see lib/podcastHome + PodcastHomeCard). */}
          {show && (
            <button
              type="button"
              onClick={() => toggleShowFollowed({ slug: show.slug, title: show.title, artwork: show.artwork })}
              style={{
                marginTop: 18,
                display: "inline-flex", alignItems: "center", gap: 7,
                background: followed ? "rgba(46,107,64,0.30)" : "transparent",
                border: `1px solid ${followed ? "rgba(46,107,64,0.55)" : "rgba(143,175,150,0.4)"}`,
                color: followed ? "#A8C5A0" : PALETTE.sage,
                fontFamily: FONT, fontSize: 13, fontWeight: 600,
                padding: "8px 16px", borderRadius: 999, cursor: "pointer",
              }}
            >
              {followed ? "✓ On your home" : "+ Add to home"}
            </button>
          )}
          {/* Scripture Day by Day reads four passages a day — jump straight to
              hearing any one of them (OT, Psalm, NT, Gospel). */}
          {slug === "scripture-day-by-day" && (
            <button
              type="button"
              onClick={() => setLocation("/scripture/readings")}
              style={{
                marginTop: 12,
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "#2D5E3F", border: "1px solid rgba(168,197,160,0.4)",
                color: PALETTE.warm, fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
                padding: "10px 18px", borderRadius: 999, cursor: "pointer",
              }}
            >
              📖 Listen reading by reading →
            </button>
          )}
        </div>

        {isLoading && episodes.length === 0 ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 24 }}>{t("podcasts.loading_episodes")}</p>
        ) : episodes.length === 0 ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 24, lineHeight: 1.5 }}>
            {t("podcasts.episodes_error")}
          </p>
        ) : (
          <>
            {/* Search + newest/oldest sort */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <span aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.6 }}>🔍</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("podcasts.search_episodes_placeholder")}
                  aria-label={t("podcasts.search_episodes_aria")}
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", borderRadius: 12, background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)", color: PALETTE.warm, fontFamily: FONT, fontSize: 14, outline: "none" }}
                />
              </div>
              <button
                type="button"
                onClick={() => setSortNewest((s) => !s)}
                aria-label={t("podcasts.sort_toggle_aria")}
                style={{ flexShrink: 0, padding: "9px 13px", borderRadius: 12, background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.30)", color: "rgba(168,197,160,0.95)", fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {sortNewest ? t("podcasts.sort_newest") : t("podcasts.sort_oldest")}
              </button>
            </div>
            {visibleEpisodes.length === 0 ? (
              <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 8 }}>{t("podcasts.no_episodes_match", { query })}</p>
            ) : (
            <div className="space-y-2.5">
              {visibleEpisodes.map((ep) => {
              const active = player.isCurrent(slug, ep.id);
              const date = formatDate(ep.publishedAt);
              const dur = formatDuration(ep.durationSeconds);
              const listened = listenedSet.has(epKey(ep));
              const inList = listenListSet.has(epKey(ep));
              return (
                <div
                  key={ep.id}
                  className="w-full rounded-2xl p-3.5"
                  style={{
                    background: "rgba(9,26,16, 0.297)",
                    backdropFilter: "blur(11.34px)",
                    WebkitBackdropFilter: "blur(11.34px)",
                    border: `1px solid ${active ? "rgba(168,197,160,0.45)" : "rgba(46,107,64,0.22)"}`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Play button + episode info — tap to play */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => playEpisode(ep)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playEpisode(ep); } }}
                      className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer transition-opacity hover:opacity-90"
                    >
                      {/* Episode thumbnail with subtle play overlay */}
                      <div style={{ width: 52, height: 52, flexShrink: 0, position: "relative", borderRadius: 10, overflow: "hidden" }}>
                        {(ep.imageUrl ?? showData?.artwork) ? (
                          <img
                            src={ep.imageUrl ?? showData?.artwork ?? ""}
                            alt=""
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", background: "rgba(143,175,150,0.12)" }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div style={{ width: "100%", height: "100%", background: "rgba(46,107,64,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎧</div>
                        )}
                        <div style={{
                          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          background: active ? "rgba(0,0,0,0.38)" : "rgba(0,0,0,0.16)",
                        }}>
                          <span style={{ color: active ? "#A8C5A0" : "rgba(255,255,255,0.85)", fontSize: 15, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                            {active && player.isPlaying ? "♪" : "▶"}
                          </span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        {listened && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#A8C5A0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            ✓ {t("podcasts.listened")}
                          </span>
                        )}
                        <p style={{ fontSize: 14.5, fontWeight: 600, color: listened ? "rgba(240,237,230,0.72)" : PALETTE.warm, margin: listened ? "2px 0 0" : 0, lineHeight: 1.25 }}>
                          {ep.title ?? t("podcasts.untitled_episode")}
                        </p>
                        <p style={{ fontSize: 11.5, color: PALETTE.faint, margin: "3px 0 0" }}>
                          {[date, dur].filter(Boolean).join(" · ")}
                        </p>
                        {ep.description && (
                          <p style={{ fontSize: 12.5, color: PALETTE.sage, margin: "6px 0 0", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {ep.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Add / remove from listen list */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); listenListMut.mutate({ add: !inList, ep }); }}
                      aria-label={inList ? t("podcasts.remove_from_list") : t("podcasts.add_to_list")}
                      title={inList ? t("podcasts.remove_from_list") : t("podcasts.add_to_list")}
                      style={{
                        flexShrink: 0, marginTop: 4,
                        width: 30, height: 30, borderRadius: "50%", border: "none",
                        background: inList ? "rgba(168,197,160,0.22)" : "rgba(46,107,64,0.25)",
                        color: inList ? "#A8C5A0" : "rgba(168,197,160,0.75)",
                        fontSize: inList ? 13 : 18, lineHeight: 1,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      {inList ? "✓" : "+"}
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
