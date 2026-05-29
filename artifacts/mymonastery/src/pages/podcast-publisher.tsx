import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

// ── /podcasts/:publisher — a publisher's shows ──────────────────────────
//
// Grid of show cards for one publisher (e.g. CAC's full slate). Tapping
// a card opens /podcasts/show/:slug — the episode list + in-app player.
// Single-show publishers (National Cathedral, VTS) are linked straight
// to their show page from the menu, so this page is mainly CAC; it still
// renders fine for any publisher.

const PALETTE = {
  bg: "#0C1F12",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";

type ShowCard = { slug: string; title: string; artist: string; artwork: string | null };
type PublisherResponse = { slug: string; title: string; emoji: string; shows: ShowCard[] };

// Full-bleed square cover art for the browse grid (Hallow-style — the
// artwork is the hero, not a thumbnail). Fills its grid cell; falls
// back to a calm headphones tile when a feed has no artwork or its
// image fails to load.
function GridArt({ url, alt }: { url: string | null; alt: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          objectFit: "cover",
          borderRadius: 16,
          background: "rgba(143,175,150,0.12)",
          display: "block",
        }}
        onError={(e) => {
          // Swap the broken <img> for the fallback tile rather than
          // leaving a blank/torn box (same lesson as the office-podcast
          // artwork fix).
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = "none";
          const sib = el.nextElementSibling as HTMLElement | null;
          if (sib) sib.style.display = "flex";
        }}
      />
    );
  }
  return <GridArtFallback />;
}

function GridArtFallback({ hidden }: { hidden?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 16,
        background: "rgba(46,107,64,0.18)",
        border: "1px solid rgba(46,107,64,0.3)",
        display: hidden ? "none" : "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 44,
      }}
      aria-hidden
    >
      🎧
    </div>
  );
}

export default function PodcastPublisherPage() {
  const { publisher } = useParams<{ publisher: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data, isLoading } = useQuery<PublisherResponse>({
    queryKey: [`/api/podcasts/publisher/${publisher}`],
    queryFn: () => apiRequest("GET", `/api/podcasts/publisher/${publisher}`),
    enabled: !!user && !!publisher,
    staleTime: 60 * 60_000,
  });

  if (authLoading || !user) return null;

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
          ← {t("common.back")}
        </button>
      </header>

      <main className="w-full max-w-2xl mx-auto" style={{ padding: "8px 16px 40px" }}>
        <div className="flex items-center gap-3 mb-1">
          <span style={{ fontSize: 26 }} aria-hidden>{data?.emoji ?? "🎧"}</span>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1.15 }}>
            {data?.title ?? t("podcasts.title")}
          </h1>
        </div>
        <p style={{ fontSize: 13, color: PALETTE.sage, margin: "0 0 20px" }}>
          {isLoading ? t("podcasts.publisher_loading") : t("podcasts.publisher_count", { count: data?.shows.length ?? 0 })}
        </p>

        {/* Image-forward 2-column grid (Hallow-style). The cover art is
            the hero; title + artist sit beneath in a tight stack. Tapping
            anywhere on a cell opens the show's episode list + player. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-6">
          {(data?.shows ?? []).map((s) => (
            <div
              key={s.slug}
              role="button"
              tabIndex={0}
              onClick={() => setLocation(`/podcasts/show/${s.slug}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(`/podcasts/show/${s.slug}`); } }}
              className="cursor-pointer transition-opacity hover:opacity-90"
            >
              <div style={{ position: "relative" }}>
                <GridArt url={s.artwork} alt={s.title} />
                {/* Hidden sibling the <img> onError reveals on a broken load. */}
                {s.artwork && <GridArtFallback hidden />}
              </div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: PALETTE.warm,
                  margin: "10px 0 0",
                  lineHeight: 1.2,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {s.title}
              </p>
              <p
                style={{
                  fontSize: 12.5,
                  color: PALETTE.sage,
                  margin: "3px 0 0",
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.artist}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
