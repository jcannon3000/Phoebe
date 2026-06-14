import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

// ── PodcastsRail — horizontal "podcasts available" carousel ─────────────
//
// A Hallow-style cover-art slider for the home screen: a row of show
// tiles that scroll horizontally, tapping one opens its episode list +
// player. Pulls the same curated library as the Discover page
// (/api/podcasts), so it stays in sync automatically. Renders nothing
// until shows load (no skeleton — it's a secondary surface near the
// page bottom).

const FONT = "'Space Grotesk', system-ui, sans-serif";

type ShowCard = { slug: string; title: string; artist: string; artwork: string | null };
type Publisher = { slug: string; title: string; emoji: string; shows: ShowCard[] };
type PodcastsResponse = { publishers: Publisher[] };

const CARD_W = 144;

function CardArt({ url, alt }: { url: string | null; alt: string }) {
  if (url) {
    return (
      <div style={{ position: "relative", width: CARD_W, height: CARD_W }}>
        <img
          src={url}
          alt={alt}
          loading="lazy"
          style={{ width: CARD_W, height: CARD_W, objectFit: "cover", borderRadius: 14, display: "block", background: "rgba(143,175,150,0.12)" }}
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
        width: CARD_W, height: CARD_W, borderRadius: 14,
        background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.3)",
        display: hidden ? "none" : "flex", alignItems: "center", justifyContent: "center", fontSize: 40,
      }}
      aria-hidden
    >
      🎧
    </div>
  );
}

export function PodcastsRail({ title = "🎧 Podcasts" }: { title?: string }) {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError, refetch } = useQuery<PodcastsResponse>({
    queryKey: ["/api/podcasts"],
    queryFn: () => apiRequest("GET", "/api/podcasts"),
    staleTime: 60 * 60_000,
    retry: 2,
  });

  // Flatten every publisher's shows, de-duped, capped for the rail.
  const seen = new Set<string>();
  const shows: ShowCard[] = [];
  for (const pub of data?.publishers ?? []) {
    for (const s of pub.shows) {
      if (seen.has(s.slug)) continue;
      seen.add(s.slug);
      shows.push(s);
      if (shows.length >= 16) break;
    }
    if (shows.length >= 16) break;
  }
  // Shared header so the rail keeps its identity across loading / error /
  // loaded states instead of silently vanishing (a failed or slow fetch used
  // to read as "podcasts gone").
  const header = (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-bold" style={{ color: "#F0EDE6", fontFamily: FONT }}>
        {title}
      </h2>
      <Link href="/podcasts" className="text-sm font-semibold" style={{ color: "#A8C5A0", fontFamily: FONT }}>
        See all →
      </Link>
    </div>
  );

  if (shows.length === 0) {
    // Still fetching — show placeholder tiles so the section is visibly there.
    if (isLoading) {
      return (
        <section className="mt-10">
          {header}
          <div style={{ display: "flex", gap: 14, overflow: "hidden" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ width: CARD_W, flexShrink: 0 }}>
                <div style={{ width: CARD_W, height: CARD_W, borderRadius: 14, background: "rgba(143,175,150,0.10)" }} />
                <div style={{ height: 12, width: "75%", borderRadius: 4, background: "rgba(143,175,150,0.10)", margin: "10px 0 0" }} />
              </div>
            ))}
          </div>
        </section>
      );
    }
    // Loaded but the fetch errored — offer a retry instead of disappearing.
    if (isError) {
      return (
        <section className="mt-10">
          {header}
          <button
            type="button"
            onClick={() => refetch()}
            style={{ width: "100%", textAlign: "left", background: "rgba(46,107,64,0.14)", border: "1px solid rgba(46,107,64,0.3)", borderRadius: 14, padding: "14px 16px", color: "#A8C5A0", fontFamily: FONT, fontSize: 14, cursor: "pointer" }}
          >
            Couldn't load podcasts. Tap to retry →
          </button>
        </section>
      );
    }
    // Loaded successfully with genuinely no shows — nothing to show.
    return null;
  }

  return (
    <section className="mt-10">
      {header}
      <div
        style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        {shows.map((s) => (
          <div
            key={s.slug}
            role="button"
            tabIndex={0}
            onClick={() => setLocation(`/podcasts/show/${s.slug}`)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(`/podcasts/show/${s.slug}`); } }}
            className="cursor-pointer transition-opacity hover:opacity-90"
            style={{ width: CARD_W, flexShrink: 0 }}
          >
            <CardArt url={s.artwork} alt={s.title} />
            <p
              style={{
                fontSize: 13.5, fontWeight: 700, color: "#F0EDE6", fontFamily: FONT,
                margin: "8px 0 0", lineHeight: 1.2,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}
            >
              {s.title}
            </p>
            <p
              style={{
                fontSize: 11.5, color: "#8FAF96", fontFamily: FONT, margin: "2px 0 0", lineHeight: 1.3,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {s.artist}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
