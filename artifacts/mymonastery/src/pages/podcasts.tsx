import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// ── /podcasts — the Discover index ──────────────────────────────────────
//
// One browsable home for the whole curated podcast library, grouped by
// publisher (Forward Movement offices, CAC, National Cathedral, VTS).
// Hallow-style: each publisher is a section header over an image-forward
// 2-column cover-art grid. Tapping a show opens /podcasts/show/:slug —
// the episode list + in-app player. Registry metadata only (no feed
// fetch), so the page loads instantly.

const PALETTE = {
  bg: "#0C1F12",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";

type ShowCard = { slug: string; title: string; artist: string; artwork: string | null };
type Publisher = { slug: string; title: string; emoji: string; shows: ShowCard[] };
type PodcastsResponse = { publishers: Publisher[] };

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

  if (authLoading || !user) return null;

  const publishers = data?.publishers ?? [];

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
        <p style={{ fontSize: 14, color: PALETTE.sage, margin: "0 0 24px" }}>
          {isLoading ? "Loading the library…" : "Listen in Phoebe — the offices, contemplatives, and teachers we love."}
        </p>

        {publishers.map((pub) => (
          <section key={pub.slug} style={{ marginBottom: 32 }}>
            <div className="flex items-center gap-2.5" style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 20 }} aria-hidden>{pub.emoji}</span>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.15 }}>
                {pub.title}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6">
              {pub.shows.map((s) => (
                <div
                  key={s.slug}
                  role="button"
                  tabIndex={0}
                  onClick={() => setLocation(`/podcasts/show/${s.slug}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(`/podcasts/show/${s.slug}`); } }}
                  className="cursor-pointer transition-opacity hover:opacity-90"
                >
                  <GridArt url={s.artwork} alt={s.title} />
                  <p
                    style={{
                      fontSize: 15, fontWeight: 700, color: PALETTE.warm,
                      margin: "10px 0 0", lineHeight: 1.2,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}
                  >
                    {s.title}
                  </p>
                  <p
                    style={{
                      fontSize: 12.5, color: PALETTE.sage, margin: "3px 0 0", lineHeight: 1.3,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {s.artist}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
