import { useEffect, useRef, type CSSProperties } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePodcastPlayer, type PlayingEpisode } from "@/components/PodcastPlayer";

// ── /podcasts/show/:slug — a show's episodes ────────────────────────────
//
// The browse-and-listen leaf. Lists a show's recent episodes; tapping one
// starts it in the GLOBAL player (see components/PodcastPlayer) so it
// keeps playing as you navigate away. Listening history + the listen-time
// prayer-session are recorded by the player, not here.
//
// Also: per-episode "✓ Listened" markers, a ♡ Recommend toggle that
// shares to the community feed, and ?ep=<id> deep-link auto-open.

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
    ...box, background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.3)",
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
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const player = usePodcastPlayer();

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
    imageUrl: ep.imageUrl ?? showData?.artwork ?? null,
    showTitle: showData?.title ?? null,
    showArtwork: showData?.artwork ?? null,
    durationSeconds: ep.durationSeconds,
    publishedAt: ep.publishedAt,
  });
  const playEpisode = (ep: Episode) => { if (ep.audioUrl) player.play(toPlaying(ep)); };

  // Auto-open the ?ep=<id> episode once the feed loads (deep-link from a
  // search / community result). Runs once.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    const eps = data?.episodes ?? [];
    if (eps.length === 0) return;
    let epId: string | null = null;
    try { epId = new URLSearchParams(window.location.search).get("ep"); } catch { /* ignore */ }
    autoSelectedRef.current = true;
    if (!epId) return;
    const match = eps.find((e) => e.id === epId);
    if (match && match.audioUrl) player.play(toPlaying(match));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Listening history + recommendations ──────────────────────────────
  const { data: me } = useQuery<{ listenedKeys: string[]; recommendedKeys: string[] }>({
    queryKey: ["/api/podcasts/me"],
    queryFn: () => apiRequest("GET", "/api/podcasts/me"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const listenedSet = new Set(me?.listenedKeys ?? []);
  const recommendedSet = new Set(me?.recommendedKeys ?? []);

  const snapshot = (ep: Episode) => ({
    showSlug: slug,
    episodeId: ep.id,
    episodeTitle: ep.title ?? undefined,
    episodeAudioUrl: ep.audioUrl ?? undefined,
    episodeImageUrl: ep.imageUrl ?? showData?.artwork ?? undefined,
    durationSeconds: ep.durationSeconds ?? undefined,
    publishedAt: ep.publishedAt ?? undefined,
    showTitle: showData?.title ?? undefined,
    showArtwork: showData?.artwork ?? undefined,
  });

  const recommendMut = useMutation({
    mutationFn: (ep: Episode) => apiRequest("POST", "/api/podcasts/recommendations", snapshot(ep)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/recommendations"] });
    },
  });
  const unrecommendMut = useMutation({
    mutationFn: (ep: Episode) => apiRequest("DELETE", "/api/podcasts/recommendations", { showSlug: slug, episodeId: ep.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/recommendations"] });
    },
  });
  const toggleRecommend = (ep: Episode) => {
    if (recommendedSet.has(epKey(ep))) unrecommendMut.mutate(ep);
    else recommendMut.mutate(ep);
  };

  if (authLoading || !user) return null;

  const show = data?.show;
  const episodes = data?.episodes ?? [];

  return (
    <div style={{ minHeight: "100dvh", background: PALETTE.bg, color: PALETTE.warm, fontFamily: FONT, paddingBottom: player.current ? 96 : 0 }}>
      <header
        style={{
          paddingTop: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))",
          paddingLeft: 20, paddingRight: 20, paddingBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={() => {
            // Respect how the user got here: from the CAC grid → back to
            // the grid; from a direct menu tap (single-show publisher)
            // → back to wherever they were. history.back() does both;
            // fall back to the publisher page / dashboard on a cold
            // deep-link with no history.
            if (window.history.length > 1) window.history.back();
            else if (show?.publisher) setLocation(`/podcasts/${show.publisher}`);
            else setLocation("/dashboard");
          }}
          style={{ background: "none", border: "none", color: PALETTE.sage, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}
        >
          ← Back
        </button>
      </header>

      <main className="w-full max-w-2xl mx-auto" style={{ padding: "8px 16px 40px" }}>
        {/* Show header — Hallow-style image-forward hero. */}
        <div className="flex flex-col items-center text-center mb-7">
          <HeroArt url={show?.artwork ?? null} alt={show?.title ?? "Show"} />
          <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600, color: PALETTE.faint, margin: "18px 0 0" }}>
            {show?.emoji ? `${show.emoji} ` : ""}{show?.publisherTitle ?? ""}
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "8px 0 0", lineHeight: 1.15, maxWidth: 420 }}>
            {show?.title ?? "Loading…"}
          </h1>
          <p style={{ fontSize: 13.5, color: PALETTE.sage, margin: "6px 0 0" }}>
            {show?.artist ?? ""}
          </p>
        </div>

        {isLoading && episodes.length === 0 ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 24 }}>Loading episodes…</p>
        ) : episodes.length === 0 ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 24, lineHeight: 1.5 }}>
            Couldn't load episodes right now. Please try again in a little while.
          </p>
        ) : (
          <div className="space-y-2.5">
            {episodes.map((ep) => {
              const active = player.isCurrent(slug, ep.id);
              const date = formatDate(ep.publishedAt);
              const dur = formatDuration(ep.durationSeconds);
              const listened = listenedSet.has(epKey(ep));
              const recommended = recommendedSet.has(epKey(ep));
              return (
                <div
                  key={ep.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => playEpisode(ep)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playEpisode(ep); } }}
                  className="w-full rounded-2xl p-3.5 cursor-pointer transition-opacity hover:opacity-90"
                  style={{
                    background: active ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.08)",
                    border: `1px solid ${active ? "rgba(168,197,160,0.45)" : "rgba(46,107,64,0.22)"}`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                        background: active ? "#A8C5A0" : "rgba(46,107,64,0.35)",
                        color: active ? "#0A1A0F" : "#F0EDE6",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                      }}
                      aria-hidden
                    >
                      {active && player.isPlaying ? "♪" : "▶"}
                    </div>
                    <div className="min-w-0 flex-1">
                      {listened && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#A8C5A0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          ✓ Listened
                        </span>
                      )}
                      <p style={{ fontSize: 14.5, fontWeight: 600, color: listened ? "rgba(240,237,230,0.72)" : PALETTE.warm, margin: listened ? "2px 0 0" : 0, lineHeight: 1.25 }}>
                        {ep.title ?? "Untitled episode"}
                      </p>
                      <p style={{ fontSize: 11.5, color: PALETTE.faint, margin: "3px 0 0" }}>
                        {[date, dur].filter(Boolean).join(" · ")}
                      </p>
                      {ep.description && (
                        <p
                          style={{ fontSize: 12.5, color: PALETTE.sage, margin: "6px 0 0", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                        >
                          {ep.description}
                        </p>
                      )}
                      {/* Recommend → shares this episode to the community
                          feed (/podcasts Community tab). stopPropagation so
                          tapping it doesn't also start playback. */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleRecommend(ep); }}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-opacity hover:opacity-90"
                        style={{
                          fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                          background: recommended ? "rgba(212,160,70,0.18)" : "rgba(46,107,64,0.14)",
                          color: recommended ? "#F0DCA8" : "rgba(168,197,160,0.95)",
                          border: `1px solid ${recommended ? "rgba(212,160,70,0.45)" : "rgba(46,107,64,0.3)"}`,
                        }}
                      >
                        {recommended ? "♥ Recommended" : "♡ Recommend"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
