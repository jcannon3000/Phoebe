import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePodcastPlayer, type PlayingEpisode } from "@/components/PodcastPlayer";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { usePilotMode } from "@/hooks/usePilotMode";

// ── /podcasts — the Discover index ──────────────────────────────────────
//
// One browsable home for the whole curated podcast library, grouped by
// publisher. Hallow-style cover-art grids. Tapping a show opens
// /podcasts/show/:slug — the episode list + in-app player.
//
// Search: the search box queries /api/podcasts/search, which searches
// EPISODE titles + descriptions across every show (not just show names),
// and returns matching shows too. Tapping an episode result opens its
// show page with that episode auto-loaded in the player (?ep=…).

const PALETTE = {
  bg: "#091A10",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";

type ShowCard = { slug: string; title: string; artist: string; artwork: string | null };
type Publisher = { slug: string; title: string; emoji: string; shows: ShowCard[] };
type PodcastsResponse = { publishers: Publisher[] };
type EpisodeHit = {
  id: string;
  title: string | null;
  description: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  show: { slug: string; title: string; artist: string; artwork: string | null };
};
type SearchResponse = { shows: ShowCard[]; episodes: EpisodeHit[] };
type ListenListItem = {
  id: number;
  showSlug: string;
  episodeId: string;
  episodeTitle: string | null;
  episodeAudioUrl: string | null;
  episodeImageUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  showTitle: string | null;
  showArtwork: string | null;
  position: number;
};
type ListenListResponse = { items: ListenListItem[] };

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
        background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(46,107,64,0.3)",
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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [added, setAdded] = useState(false);
  const meta = [ep.show.title, fmtDate(ep.publishedAt), fmtDuration(ep.durationSeconds)].filter(Boolean).join(" · ");

  // Add to Listen List. Search hits don't carry the episode's audio URL,
  // so resolve it from the show feed first — otherwise the queued item
  // would be unplayable. The POST is idempotent server-side
  // (onConflictDoNothing), so a repeat tap is harmless.
  const addMut = useMutation({
    mutationFn: async () => {
      let episodeAudioUrl: string | undefined;
      let episodeImageUrl: string | undefined;
      try {
        const res = (await apiRequest("GET", `/api/podcasts/show/${encodeURIComponent(ep.show.slug)}`)) as {
          episodes?: Array<{ id: string; audioUrl: string | null; imageUrl: string | null }>;
        };
        const full = (res.episodes ?? []).find((e) => e.id === ep.id);
        episodeAudioUrl = full?.audioUrl ?? undefined;
        episodeImageUrl = full?.imageUrl ?? undefined;
      } catch { /* fall back to a metadata-only add */ }
      return apiRequest("POST", "/api/podcasts/listen-list", {
        showSlug: ep.show.slug,
        episodeId: ep.id,
        episodeTitle: ep.title ?? undefined,
        episodeAudioUrl,
        episodeImageUrl,
        durationSeconds: ep.durationSeconds ?? undefined,
        publishedAt: ep.publishedAt ?? undefined,
        showTitle: ep.show.title ?? undefined,
        showArtwork: ep.show.artwork ?? undefined,
      });
    },
    onSuccess: () => {
      setAdded(true);
      qc.invalidateQueries({ queryKey: ["/api/podcasts/me"] });
      qc.invalidateQueries({ queryKey: ["/api/podcasts/listen-list"] });
    },
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="w-full rounded-2xl p-3 cursor-pointer transition-opacity hover:opacity-90 flex items-start gap-3"
      style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(46,107,64,0.22)" }}
    >
      <div style={{ width: 52, height: 52, flexShrink: 0 }}>
        <GridArt url={ep.show.artwork} alt={ep.show.title} />
      </div>
      <div className="min-w-0 flex-1">
        <p style={{ fontSize: 14.5, fontWeight: 600, color: PALETTE.warm, margin: 0, lineHeight: 1.25,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {ep.title ?? t("podcasts.untitled_episode")}
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
      {/* Add to Listen List — on the right. stopPropagation so it
          doesn't trigger the row's open-episode tap. */}
      <button
        type="button"
        aria-label={added
          ? t("podcasts.in_listen_list", { defaultValue: "In Listen List" })
          : t("podcasts.add_to_listen_list", { defaultValue: "Add to Listen List" })}
        onClick={(e) => { e.stopPropagation(); if (!added && !addMut.isPending) addMut.mutate(); }}
        disabled={added || addMut.isPending}
        style={{
          flexShrink: 0,
          width: 30, height: 30, borderRadius: 999,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, lineHeight: 1, fontWeight: 600, marginTop: 2,
          cursor: added ? "default" : "pointer",
          background: added ? "rgba(46,107,64,0.30)" : "rgba(46,107,64,0.16)",
          border: "1px solid rgba(46,107,64,0.45)",
          color: "#A8C5A0",
          fontFamily: FONT,
        }}
      >
        {added ? "✓" : addMut.isPending ? "…" : "+"}
      </button>
    </div>
  );
}


function ListenListRow({
  item,
  onPlay,
  onRemove,
}: {
  item: ListenListItem;
  onPlay: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const art = item.episodeImageUrl ?? item.showArtwork;
  const meta = [item.showTitle, fmtDuration(item.durationSeconds)].filter(Boolean).join(" · ");
  return (
    <div
      className="w-full rounded-2xl p-3.5 flex items-center gap-3"
      style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(46,107,64,0.22)" }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onPlay}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlay(); } }}
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer transition-opacity hover:opacity-90"
      >
        <div style={{ width: 46, height: 46, flexShrink: 0 }}>
          {art ? (
            <img src={art} alt="" loading="lazy"
              style={{ width: 46, height: 46, borderRadius: 10, objectFit: "cover", background: "rgba(143,175,150,0.12)", display: "block" }} />
          ) : (
            <div style={{ width: 46, height: 46, borderRadius: 10, background: "rgba(46,107,64,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎧</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 14, fontWeight: 600, color: PALETTE.warm, margin: 0, lineHeight: 1.25,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.episodeTitle ?? t("podcasts.untitled_episode")}
          </p>
          {meta && <p style={{ fontSize: 11.5, color: PALETTE.faint, margin: "3px 0 0" }}>{meta}</p>}
        </div>
        <span style={{ color: "rgba(143,175,150,0.5)", fontSize: 15, flexShrink: 0 }}>▶</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("podcasts.remove_from_list")}
        style={{ flexShrink: 0, background: "none", border: "none", color: "rgba(143,175,150,0.5)", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: "4px 2px", marginLeft: 2 }}
      >
        ✕
      </button>
    </div>
  );
}

export default function PodcastsPage() {
  // Wide landscape backdrop on the web; the bundled leaf photo on native.
  const podcastBg = pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[0]! : null);
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<"discover" | "listen-list">("discover");
  const player = usePodcastPlayer();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { isPilot } = usePilotMode();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data } = useQuery<PodcastsResponse>({
    queryKey: ["/api/podcasts"],
    queryFn: () => apiRequest("GET", "/api/podcasts"),
    enabled: !!user,
    // The library is server-defined (publisher order / show list). Keep cached
    // data for a quick paint, but refetch on each open so server-side changes
    // (e.g. moving a show between publishers) show up without waiting out a long
    // stale window or a cold relaunch.
    staleTime: 5 * 60_000,
    refetchOnMount: "always",
  });

  const [query, setQuery] = useState("");

  // Debounce the free-text query so we don't fire a library-wide episode
  // search on every keystroke.
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debouncedQ.length > 0;

  const { data: searchData, isLoading: searchLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/podcasts/search", debouncedQ],
    queryFn: () => apiRequest("GET", `/api/podcasts/search?q=${encodeURIComponent(debouncedQ)}`),
    enabled: !!user && searching,
    staleTime: 5 * 60_000,
  });


  // Listen list — fetched when that tab is open.
  const { data: listenListData, isLoading: listenListLoading } = useQuery<ListenListResponse>({
    queryKey: ["/api/podcasts/listen-list"],
    queryFn: () => apiRequest("GET", "/api/podcasts/listen-list"),
    enabled: !!user && tab === "listen-list",
    staleTime: 30_000,
  });

  const removeFromListMut = useMutation({
    mutationFn: ({ showSlug, episodeId }: { showSlug: string; episodeId: string }) =>
      apiRequest("DELETE", "/api/podcasts/listen-list", { showSlug, episodeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/listen-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/me"] });
    },
  });

  if (authLoading || !user) return null;

  // Pilot drops the CAC (Center for Action & Contemplation) publisher; the rest
  // of the podcast library stays.
  const publishers = (data?.publishers ?? []).filter((p) => !isPilot || p.slug !== "cac");
  const showHits = searchData?.shows ?? [];
  const episodeHits = searchData?.episodes ?? [];
  const openEpisode = (ep: EpisodeHit) =>
    setLocation(`/podcasts/show/${ep.show.slug}?ep=${encodeURIComponent(ep.id)}`);

  return (
    <Layout bgPhoto={podcastBg}>
      <div className="w-full max-w-2xl mx-auto" style={{ color: PALETTE.warm, fontFamily: FONT, paddingBottom: player.current ? 112 : 48 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 16px", lineHeight: 1.1 }}>
          {t("podcasts.title")}
        </h1>

        {/* Discover ↔ Listen List tabs. */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {(["discover", "listen-list"] as ("discover" | "listen-list")[]).map((k) => {
            const active = tab === k;
            const label = k === "discover" ? t("podcasts.tab_discover") : t("podcasts.tab_listen_list");
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                style={{
                  flex: 1, padding: "9px 8px", borderRadius: 12,
                  fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
                  background: active ? "#2D5E3F" : "rgba(46,107,64,0.10)",
                  color: active ? PALETTE.warm : "rgba(168,197,160,0.9)",
                  border: `1px solid ${active ? "rgba(168,197,160,0.5)" : "rgba(46,107,64,0.28)"}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {tab === "listen-list" ? (
          // ── Listen List ───────────────────────────────────────────────
          listenListLoading ? (
            <p style={{ fontSize: 14, color: PALETTE.faint, marginTop: 24, textAlign: "center" }}>{t("common.loading")}</p>
          ) : (listenListData?.items ?? []).length === 0 ? (
            <div style={{ textAlign: "center", marginTop: 48 }}>
              <p style={{ fontSize: 36, margin: "0 0 12px" }}>🎧</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: PALETTE.warm, margin: "0 0 8px", fontFamily: FONT }}>
                {t("podcasts.listen_list_empty_title")}
              </p>
              <p style={{ fontSize: 13.5, color: PALETTE.sage, lineHeight: 1.5, maxWidth: 300, margin: "0 auto 20px" }}>
                {t("podcasts.listen_list_empty_body")}
              </p>
              <button
                type="button"
                onClick={() => setTab("discover")}
                style={{ background: "#2D5E3F", color: PALETTE.warm, border: "none", borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
              >
                {t("podcasts.browse_shows")}
              </button>
            </div>
          ) : (() => {
            const items = listenListData?.items ?? [];
            const toPlayingEpisode = (item: ListenListItem): PlayingEpisode => ({
              showSlug: item.showSlug,
              episodeId: item.episodeId,
              title: item.episodeTitle,
              audioUrl: item.episodeAudioUrl ?? "",
              imageUrl: item.episodeImageUrl ?? null,
              showTitle: item.showTitle,
              showArtwork: item.showArtwork,
              durationSeconds: item.durationSeconds,
              publishedAt: item.publishedAt,
            });
            return (
              <>
                <button
                  type="button"
                  onClick={() => player.playQueue(items.filter((i) => !!i.episodeAudioUrl).map(toPlayingEpisode))}
                  style={{
                    width: "100%", padding: "12px 20px", borderRadius: 14, marginBottom: 16,
                    background: "#2D5E3F", color: PALETTE.warm, border: "1px solid rgba(168,197,160,0.4)",
                    fontSize: 15, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
                  }}
                >
                  {t("podcasts.play_all", { count: items.length })}
                </button>
                <div className="space-y-2.5">
                  {items.map((item) => (
                    <ListenListRow
                      key={`${item.showSlug}:${item.episodeId}`}
                      item={item}
                      onPlay={() => {
                        if (item.episodeAudioUrl) player.play(toPlayingEpisode(item));
                      }}
                      onRemove={() => removeFromListMut.mutate({ showSlug: item.showSlug, episodeId: item.episodeId })}
                    />
                  ))}
                </div>
              </>
            );
          })()
        ) : (
        <>
        {/* Search across shows AND episodes. */}
        <div style={{ position: "relative", marginBottom: 16 }}>
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
            placeholder={t("podcasts.search_placeholder")}
            aria-label={t("podcasts.search_aria")}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 16px 12px 40px", borderRadius: 14,
              background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)",
              color: PALETTE.warm, fontFamily: FONT, fontSize: 15, outline: "none",
            }}
          />
        </div>

        {searching ? (
          // ── Search / theme results ──────────────────────────────────
          searchLoading ? (
            <p style={{ fontSize: 14, color: PALETTE.faint, marginTop: 24, textAlign: "center" }}>{t("podcasts.searching")}</p>
          ) : (showHits.length === 0 && episodeHits.length === 0) ? (
            <p style={{ fontSize: 14, color: PALETTE.faint, marginTop: 24, textAlign: "center" }}>
              {t("podcasts.no_results_for", { q: debouncedQ })}
            </p>
          ) : (
            <>
              {showHits.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: PALETTE.faint, margin: "0 0 12px" }}>
                    {t("podcasts.section_shows")}
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
                  {episodeHits.length >= 80 ? t("podcasts.section_episodes_top") : t("podcasts.section_episodes")}
                </h2>
                {episodeHits.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: PALETTE.faint }}>{t("podcasts.no_matching_episodes")}</p>
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
          // ── Default browse — every TITLED publisher keeps its own section,
          // rendered in publisher order (Way of Love → Sermons → Forward →
          // From around the church → CAC), even when it has a single show, so
          // the cascade matches the curated order. Only title-less publishers
          // get stacked into the combined "More shows" grid at the end. The
          // source still shows on every tile via the artist line.
          (() => {
            const multi = publishers.filter((p) => !!p.title);
            const singleShows = publishers
              .filter((p) => !p.title)
              .flatMap((p) => p.shows);
            return (
              <>
                {multi.map((pub) => (
                  <section key={pub.slug} style={{ marginBottom: 32 }}>
                    {pub.title && (
                      <div className="flex items-center" style={{ marginBottom: 14 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.15 }}>
                          {pub.title}
                        </h2>
                      </div>
                    )}
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
                        {t("podcasts.more_shows")}
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
      </div>
    </Layout>
  );
}
