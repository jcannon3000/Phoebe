import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// ── /podcasts — the Discover index ──────────────────────────────────────
//
// One browsable home for the whole curated podcast library, grouped by
// publisher. Hallow-style cover-art grids. Tapping a show opens
// /podcasts/show/:slug — the episode list + in-app player.
//
// Search + themes: the search box and the thematic pills both query
// /api/podcasts/search, which searches EPISODE titles + descriptions
// across every show (not just show names), and returns matching shows
// too. Tapping an episode result opens its show page with that episode
// auto-loaded in the player (?ep=…).

const PALETTE = {
  bg: "#0C1F12",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";

type ShowCard = { slug: string; title: string; artist: string; artwork: string | null };
type Publisher = { slug: string; title: string; emoji: string; shows: ShowCard[] };
type Theme = { key: string; label: string; emoji: string };
type PodcastsResponse = { publishers: Publisher[]; themes?: Theme[] };
type EpisodeHit = {
  id: string;
  title: string | null;
  description: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  show: { slug: string; title: string; artist: string; artwork: string | null };
};
type SearchResponse = { shows: ShowCard[]; episodes: EpisodeHit[] };

function fmtDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
function fmtDate(rfc822: string | null): string | null {
  if (!rfc822) return null;
  const d = new Date(rfc822);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Full-bleed square cover art — the artwork is the hero. Falls back to a
// calm headphones tile when a feed has no artwork or its image fails.
function GridArt({ url, alt }: { url: string | null; alt: string }) {
  if (url) {
    return (
      <div style={{ position: "relative" }}>
        <img
          src={url}
          alt={alt}
          loading="lazy"
          style={{
            width: "100%", aspectRatio: "1 / 1", objectFit: "cover",
            borderRadius: 16, background: "rgba(143,175,150,0.12)", display: "block",
          }}
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            el.style.display = "none";
            const sib = el.nextElementSibling as HTMLElement | null;
            if (sib) sib.style.display = "flex";
          }}
        />
        <Fallback hidden />
      </div>
    );
  }
  return <Fallback />;
}

function Fallback({ hidden }: { hidden?: boolean }) {
  return (
    <div
      style={{
        width: "100%", aspectRatio: "1 / 1", borderRadius: 16,
        background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.3)",
        display: hidden ? "none" : "flex", alignItems: "center", justifyContent: "center",
        fontSize: 44,
      }}
      aria-hidden
    >
      🎧
    </div>
  );
}

// One cover-art cell. Shared by the publisher sections and the search
// results grid so the card looks identical in both.
function ShowTile({ show, onOpen }: { show: ShowCard; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer transition-opacity hover:opacity-90"
    >
      <GridArt url={show.artwork} alt={show.title} />
      <p
        style={{
          fontSize: 15, fontWeight: 700, color: PALETTE.warm,
          margin: "10px 0 0", lineHeight: 1.2,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}
      >
        {show.title}
      </p>
      <p
        style={{
          fontSize: 12.5, color: PALETTE.sage, margin: "3px 0 0", lineHeight: 1.3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {show.artist}
      </p>
    </div>
  );
}

// A single episode search result — artwork thumb + episode title +
// show / date / duration + a one-line preview. Opens the show page with
// this episode auto-loaded in the player.
function EpisodeRow({ ep, onOpen }: { ep: EpisodeHit; onOpen: () => void }) {
  const meta = [ep.show.title, fmtDate(ep.publishedAt), fmtDuration(ep.durationSeconds)].filter(Boolean).join(" · ");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="w-full rounded-2xl p-3 cursor-pointer transition-opacity hover:opacity-90 flex items-start gap-3"
      style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
    >
      <div style={{ width: 52, height: 52, flexShrink: 0 }}>
        <GridArt url={ep.show.artwork} alt={ep.show.title} />
      </div>
      <div className="min-w-0 flex-1">
        <p style={{ fontSize: 14.5, fontWeight: 600, color: PALETTE.warm, margin: 0, lineHeight: 1.25,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {ep.title ?? "Untitled episode"}
        </p>
        <p style={{ fontSize: 11.5, color: PALETTE.faint, margin: "3px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {meta}
        </p>
        {ep.description && (
          <p style={{ fontSize: 12.5, color: PALETTE.sage, margin: "5px 0 0", lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {ep.description}
          </p>
        )}
      </div>
      <span style={{ color: "rgba(143,175,150,0.5)", fontSize: 16, flexShrink: 0, marginTop: 2 }}>▶</span>
    </div>
  );
}

export default function PodcastsPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data, isLoading } = useQuery<PodcastsResponse>({
    queryKey: ["/api/podcasts"],
    queryFn: () => apiRequest("GET", "/api/podcasts"),
    enabled: !!user,
    staleTime: 60 * 60_000,
  });

  const [query, setQuery] = useState("");
  const [activeTheme, setActiveTheme] = useState<string | null>(null);

  // Debounce the free-text query so we don't fire a library-wide episode
  // search on every keystroke.
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const themes = data?.themes ?? [];
  const searching = debouncedQ.length > 0 || !!activeTheme;

  const { data: searchData, isLoading: searchLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/podcasts/search", debouncedQ, activeTheme],
    queryFn: () => apiRequest(
      "GET",
      `/api/podcasts/search?q=${encodeURIComponent(debouncedQ)}&theme=${encodeURIComponent(activeTheme ?? "")}`,
    ),
    enabled: !!user && searching,
    staleTime: 5 * 60_000,
  });

  if (authLoading || !user) return null;

  const publishers = data?.publishers ?? [];
  const showHits = searchData?.shows ?? [];
  const episodeHits = searchData?.episodes ?? [];
  const openEpisode = (ep: EpisodeHit) =>
    setLocation(`/podcasts/show/${ep.show.slug}?ep=${encodeURIComponent(ep.id)}`);
  const activeThemeLabel = themes.find((t) => t.key === activeTheme)?.label;

  return (
    <div style={{ minHeight: "100dvh", background: PALETTE.bg, color: PALETTE.warm, fontFamily: FONT }}>
      <header
        style={{
          paddingTop: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))",
          paddingLeft: 20, paddingRight: 20, paddingBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{ background: "none", border: "none", color: PALETTE.sage, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}
        >
          ← Back
        </button>
      </header>

      <main className="w-full max-w-2xl mx-auto" style={{ padding: "8px 16px 48px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px", lineHeight: 1.1 }}>
          Podcasts
        </h1>
        <p style={{ fontSize: 14, color: PALETTE.sage, margin: "0 0 16px" }}>
          {isLoading ? "Loading the library…" : "Listen in Phoebe — the offices, contemplatives, and teachers we love."}
        </p>

        {/* Search across shows AND episodes. */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <span
            aria-hidden
            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.6 }}
          >
            🔍
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shows & episodes…"
            aria-label="Search podcasts"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 16px 12px 40px", borderRadius: 14,
              background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)",
              color: PALETTE.warm, fontFamily: FONT, fontSize: 15, outline: "none",
            }}
          />
        </div>

        {/* Thematic pills — tap to search episodes by theme. Horizontally
            scrollable so the row never wraps. */}
        {themes.length > 0 && (
          <div
            style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 22, WebkitOverflowScrolling: "touch" }}
          >
            {themes.map((t) => {
              const active = activeTheme === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTheme(active ? null : t.key)}
                  style={{
                    flexShrink: 0,
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 13px", borderRadius: 999,
                    fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                    whiteSpace: "nowrap",
                    background: active ? "#2D5E3F" : "rgba(46,107,64,0.12)",
                    color: active ? PALETTE.warm : "rgba(168,197,160,0.95)",
                    border: `1px solid ${active ? "rgba(168,197,160,0.5)" : "rgba(46,107,64,0.3)"}`,
                  }}
                >
                  <span aria-hidden>{t.emoji}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {searching ? (
          // ── Search / theme results ──────────────────────────────────
          searchLoading ? (
            <p style={{ fontSize: 14, color: PALETTE.faint, marginTop: 24, textAlign: "center" }}>Searching…</p>
          ) : (showHits.length === 0 && episodeHits.length === 0) ? (
            <p style={{ fontSize: 14, color: PALETTE.faint, marginTop: 24, textAlign: "center" }}>
              No results for {activeTheme ? `“${activeThemeLabel}”` : `“${debouncedQ}”`}{debouncedQ && activeTheme ? ` in ${activeThemeLabel}` : ""}.
            </p>
          ) : (
            <>
              {showHits.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: PALETTE.faint, margin: "0 0 12px" }}>
                    Shows
                  </h2>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                    {showHits.map((s) => (
                      <ShowTile key={s.slug} show={s} onOpen={() => setLocation(`/podcasts/show/${s.slug}`)} />
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: PALETTE.faint, margin: "0 0 12px" }}>
                  {episodeHits.length > 0 ? `Episodes${episodeHits.length >= 80 ? " (top 80)" : ""}` : "Episodes"}
                </h2>
                {episodeHits.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: PALETTE.faint }}>No matching episodes.</p>
                ) : (
                  <div className="space-y-2.5">
                    {episodeHits.map((ep) => (
                      <EpisodeRow key={`${ep.show.slug}:${ep.id}`} ep={ep} onOpen={() => openEpisode(ep)} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )
        ) : (
          // ── Default browse — multi-show publishers each keep their own
          // section; single-show publishers are stacked together into one
          // combined grid so they pack two-across instead of each taking a
          // half-empty section + header of its own. The source still shows
          // on every tile via the artist line (e.g. "Ross Kane · VTS").
          (() => {
            const multi = publishers.filter((p) => p.shows.length > 1);
            const singleShows = publishers
              .filter((p) => p.shows.length === 1)
              .flatMap((p) => p.shows);
            return (
              <>
                {multi.map((pub) => (
                  <section key={pub.slug} style={{ marginBottom: 32 }}>
                    <div className="flex items-center gap-2.5" style={{ marginBottom: 14 }}>
                      <span style={{ fontSize: 20 }} aria-hidden>{pub.emoji}</span>
                      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.15 }}>
                        {pub.title}
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                      {pub.shows.map((s) => (
                        <ShowTile key={s.slug} show={s} onOpen={() => setLocation(`/podcasts/show/${s.slug}`)} />
                      ))}
                    </div>
                  </section>
                ))}
                {singleShows.length > 0 && (
                  <section style={{ marginBottom: 32 }}>
                    <div className="flex items-center gap-2.5" style={{ marginBottom: 14 }}>
                      <span style={{ fontSize: 20 }} aria-hidden>🎙️</span>
                      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.15 }}>
                        More shows
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                      {singleShows.map((s) => (
                        <ShowTile key={s.slug} show={s} onOpen={() => setLocation(`/podcasts/show/${s.slug}`)} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            );
          })()
        )}
      </main>
    </div>
  );
}
