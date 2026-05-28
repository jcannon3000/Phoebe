import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";

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
  bg: "#091A10",
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
type Recommender = { id: number; name: string; avatarUrl: string | null; note: string | null };
type RecommendedEpisode = {
  key: string;
  showSlug: string;
  episodeId: string;
  episodeTitle: string | null;
  episodeAudioUrl: string | null;
  episodeImageUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  showTitle: string | null;
  showArtwork: string | null;
  latestAt: string;
  recommenders: Recommender[];
};
type RecommendationsResponse = { recommendations: RecommendedEpisode[] };

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

function RecAvatar({ name, url, size = 24 }: { name: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size, border: "1.5px solid #0C1F12" }} />;
  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?";
  return (
    <div className="rounded-full flex items-center justify-center font-semibold"
      style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: Math.round(size * 0.4), fontFamily: FONT, border: "1.5px solid #0C1F12" }}>
      {initials}
    </div>
  );
}

// A community-recommendation card — episode + who recommended it + an
// optional note. Opens the show page with the episode auto-loaded.
function RecommendationRow({ rec, onOpen }: { rec: RecommendedEpisode; onOpen: () => void }) {
  const meta = [rec.showTitle, fmtDate(rec.publishedAt), fmtDuration(rec.durationSeconds)].filter(Boolean).join(" · ");
  const recs = rec.recommenders;
  const firstName = (recs[0]?.name || "Someone").split(/\s+/)[0];
  const byline = recs.length === 1 ? `Recommended by ${firstName}`
    : `Recommended by ${firstName} + ${recs.length - 1} other${recs.length - 1 === 1 ? "" : "s"}`;
  const note = recs.find((r) => r.note)?.note ?? null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="w-full rounded-2xl p-3.5 cursor-pointer transition-opacity hover:opacity-90"
      style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
    >
      <div className="flex items-start gap-3">
        <div style={{ width: 56, height: 56, flexShrink: 0 }}>
          <GridArt url={rec.episodeImageUrl ?? rec.showArtwork} alt={rec.showTitle ?? "Show"} />
        </div>
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 14.5, fontWeight: 600, color: PALETTE.warm, margin: 0, lineHeight: 1.25,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {rec.episodeTitle ?? "Untitled episode"}
          </p>
          <p style={{ fontSize: 11.5, color: PALETTE.faint, margin: "3px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {meta}
          </p>
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <div style={{ display: "flex" }}>
              {recs.slice(0, 3).map((r, i) => (
                <div key={r.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                  <RecAvatar name={r.name} url={r.avatarUrl} />
                </div>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "#A8C5A0", fontWeight: 600 }}>{byline}</span>
          </div>
          {note && (
            <p style={{ fontSize: 12.5, color: PALETTE.sage, margin: "6px 0 0", lineHeight: 1.4, fontStyle: "italic",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              “{note}”
            </p>
          )}
        </div>
        <span style={{ color: "rgba(143,175,150,0.5)", fontSize: 16, flexShrink: 0, marginTop: 2 }}>▶</span>
      </div>
    </div>
  );
}

export default function PodcastsPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<"discover" | "community">("discover");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data } = useQuery<PodcastsResponse>({
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

  // Community recommendations feed — only fetched when that tab is open.
  const { data: recData, isLoading: recLoading } = useQuery<RecommendationsResponse>({
    queryKey: ["/api/podcasts/recommendations"],
    queryFn: () => apiRequest("GET", "/api/podcasts/recommendations"),
    enabled: !!user && tab === "community",
    staleTime: 60_000,
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
          // Native shell sits below the system status bar already, so a
          // small fixed pad keeps the title high; web keeps the safe-area
          // inset. (Matches the double-count fix in layout.tsx.)
          paddingTop: isNativeShell() ? "0.75rem" : "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))",
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
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 16px", lineHeight: 1.1 }}>
          Podcasts
        </h1>

        {/* Discover ↔ Community tabs. Discover is the curated library +
            search; Community is the recommendations feed. */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {(["discover", "community"] as const).map((k) => {
            const active = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                style={{
                  flex: 1, padding: "9px 12px", borderRadius: 12,
                  fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
                  background: active ? "#2D5E3F" : "rgba(46,107,64,0.10)",
                  color: active ? PALETTE.warm : "rgba(168,197,160,0.9)",
                  border: `1px solid ${active ? "rgba(168,197,160,0.5)" : "rgba(46,107,64,0.28)"}`,
                }}
              >
                {k === "discover" ? "Discover" : "Community"}
              </button>
            );
          })}
        </div>

        {tab === "community" ? (
          // ── Community recommendations feed ────────────────────────────
          recLoading ? (
            <p style={{ fontSize: 14, color: PALETTE.faint, marginTop: 24, textAlign: "center" }}>Loading recommendations…</p>
          ) : (recData?.recommendations ?? []).length === 0 ? (
            <div style={{ textAlign: "center", marginTop: 36 }}>
              <p style={{ fontSize: 30, margin: "0 0 10px" }}>💬</p>
              <p style={{ fontSize: 14, color: PALETTE.sage, lineHeight: 1.5, maxWidth: 320, margin: "0 auto" }}>
                No community recommendations yet. Open a show and tap “Recommend” on an episode to share it here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {(recData?.recommendations ?? []).map((rec) => (
                <RecommendationRow
                  key={rec.key}
                  rec={rec}
                  onOpen={() => setLocation(`/podcasts/show/${rec.showSlug}?ep=${encodeURIComponent(rec.episodeId)}`)}
                />
              ))}
            </div>
          )
        ) : (
        <>
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
                    <div className="flex items-center" style={{ marginBottom: 14 }}>
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
                    <div className="flex items-center" style={{ marginBottom: 14 }}>
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
        </>
        )}
      </main>
    </div>
  );
}
