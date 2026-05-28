import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// ── /podcasts/show/:slug — a show's episodes + in-app player ────────────
//
// The browse-and-listen leaf. Lists a show's recent episodes; tapping
// one starts it in a sticky bottom player without leaving Phoebe (think
// Hallow). One generic "podcast" prayer-session row is committed with
// the real listened time on leave — it feeds the "time praying" rollup
// but does NOT credit a daily office (these are general spiritual
// content, not Morning/Evening Prayer; the office podcasts have their
// own surfaces for that).

const PALETTE = {
  bg: "#0C1F12",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
  accent: "#A8C5A0",
  barBg: "#0A1A0F",
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

function ArtTile({ url, alt, size, radius = 12 }: { url: string | null; alt: string; size: number; radius?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        style={{ width: size, height: size, objectFit: "cover", borderRadius: radius, flexShrink: 0, background: "rgba(143,175,150,0.12)" }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4 }}>
      🎧
    </div>
  );
}

// Large centered cover art for the show header — Hallow-style, the
// artwork is the hero. Matches the full-bleed square art of the cover
// grids the user taps to get here. Falls back to a calm headphones tile
// if the feed has no artwork or the image fails to load.
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

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data, isLoading } = useQuery<ShowResponse>({
    queryKey: [`/api/podcasts/show/${slug}`],
    queryFn: () => apiRequest("GET", `/api/podcasts/show/${slug}`),
    enabled: !!user && !!slug,
    staleTime: 15 * 60_000,
  });

  const [nowPlaying, setNowPlaying] = useState<Episode | null>(null);

  // ── Listen-time accumulator (page-scoped). Segments are opened on the
  // audio's `play` and closed on `pause` / `ended` / episode-switch /
  // background; one "podcast" row is committed on leave. Mirrors the
  // office-podcast player, minus the office credit.
  const startedAtRef = useRef<Date | null>(null);
  const segmentStartRef = useRef<number | null>(null);
  const accumulatedRef = useRef<number>(0);
  const committedRef = useRef(false);
  // One-time auto-open: when arrived here from an episode search result
  // (/podcasts/show/:slug?ep=<id>), open that episode in the player as
  // soon as the feed loads.
  const autoSelectedRef = useRef(false);

  const closeSegment = () => {
    const s = segmentStartRef.current;
    if (s === null) return;
    const elapsedMs = Date.now() - s;
    if (elapsedMs > 0) accumulatedRef.current += elapsedMs / 1000;
    segmentStartRef.current = null;
  };
  const openSegment = () => {
    if (!startedAtRef.current) startedAtRef.current = new Date();
    if (segmentStartRef.current === null) segmentStartRef.current = Date.now();
  };
  const commit = () => {
    if (committedRef.current) return;
    closeSegment();
    const total = Math.round(accumulatedRef.current);
    const startedAt = startedAtRef.current;
    if (total <= 0 || !startedAt) return;
    committedRef.current = true;
    apiRequest("POST", "/api/prayer-sessions", {
      surface: "podcast",
      durationSeconds: total,
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
    }).catch(() => { /* best-effort */ });
  };

  // Commit on page leave + pause accounting when backgrounded.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") closeSegment(); };
    const onPageHide = () => commit();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      commit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playEpisode = (ep: Episode) => {
    if (!ep.audioUrl) return;
    if (nowPlaying?.id === ep.id) return; // already selected
    closeSegment(); // close the prior episode's segment before switching
    setNowPlaying(ep);
  };

  // Auto-open the ?ep=<id> episode once the feed loads (deep-link from an
  // episode search result). Runs once.
  useEffect(() => {
    if (autoSelectedRef.current) return;
    const eps = data?.episodes ?? [];
    if (eps.length === 0) return;
    let epId: string | null = null;
    try { epId = new URLSearchParams(window.location.search).get("ep"); } catch { /* ignore */ }
    autoSelectedRef.current = true;
    if (!epId) return;
    const match = eps.find((e) => e.id === epId);
    if (match && match.audioUrl) { closeSegment(); setNowPlaying(match); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (authLoading || !user) return null;

  const show = data?.show;
  const episodes = data?.episodes ?? [];

  return (
    <div style={{ minHeight: "100dvh", background: PALETTE.bg, color: PALETTE.warm, fontFamily: FONT, paddingBottom: nowPlaying ? 132 : 0 }}>
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
            // → back to wherever they were (dashboard). history.back()
            // does both; fall back to the publisher page / dashboard on
            // a cold deep-link with no history.
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
        {/* Show header — Hallow-style image-forward hero: big centered
            cover art over the title + publisher, echoing the cover-art
            grids the user browses to get here. */}
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
              const playing = nowPlaying?.id === ep.id;
              const date = formatDate(ep.publishedAt);
              const dur = formatDuration(ep.durationSeconds);
              return (
                <div
                  key={ep.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => playEpisode(ep)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playEpisode(ep); } }}
                  className="w-full rounded-2xl p-3.5 cursor-pointer transition-opacity hover:opacity-90"
                  style={{
                    background: playing ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.08)",
                    border: `1px solid ${playing ? "rgba(168,197,160,0.45)" : "rgba(46,107,64,0.22)"}`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                        background: playing ? "#A8C5A0" : "rgba(46,107,64,0.35)",
                        color: playing ? "#0A1A0F" : "#F0EDE6",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                      }}
                      aria-hidden
                    >
                      {playing ? "♪" : "▶"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: 14.5, fontWeight: 600, color: PALETTE.warm, margin: 0, lineHeight: 1.25 }}>
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Sticky bottom player. Remounts (key) per episode so the audio
          element reloads + autoplays the new source. Native controls
          give scrubbing, and iOS lock-screen / Control Center playback
          come along automatically. */}
      {nowPlaying && nowPlaying.audioUrl && (
        <div
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
            background: PALETTE.barBg,
            borderTop: "1px solid rgba(168,197,160,0.18)",
            paddingTop: 10,
            paddingBottom: "max(10px, env(safe-area-inset-bottom))",
            paddingLeft: 14, paddingRight: 14,
          }}
        >
          <div className="w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-1.5">
              <ArtTile url={nowPlaying.imageUrl ?? show?.artwork ?? null} alt={nowPlaying.title ?? "Episode"} size={36} radius={8} />
              <p style={{ fontSize: 12.5, fontWeight: 600, color: PALETTE.warm, margin: 0, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {nowPlaying.title ?? "Now playing"}
              </p>
              <button
                type="button"
                onClick={() => { closeSegment(); setNowPlaying(null); }}
                aria-label="Close player"
                style={{ background: "none", border: "none", color: PALETTE.faint, fontSize: 18, cursor: "pointer", padding: "0 4px", flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
            <audio
              key={nowPlaying.id}
              src={nowPlaying.audioUrl}
              controls
              autoPlay
              preload="metadata"
              onPlay={openSegment}
              onPause={closeSegment}
              onEnded={closeSegment}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
