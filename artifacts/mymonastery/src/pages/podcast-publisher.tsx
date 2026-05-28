import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

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

function ArtTile({ url, alt, size }: { url: string | null; alt: string; size: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        style={{ width: size, height: size, objectFit: "cover", borderRadius: 14, flexShrink: 0, background: "rgba(143,175,150,0.12)" }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 14, flexShrink: 0,
        background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4,
      }}
    >
      🎧
    </div>
  );
}

export default function PodcastPublisherPage() {
  const { publisher } = useParams<{ publisher: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

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
          ← Back
        </button>
      </header>

      <main className="w-full max-w-2xl mx-auto" style={{ padding: "8px 16px 40px" }}>
        <div className="flex items-center gap-3 mb-1">
          <span style={{ fontSize: 26 }} aria-hidden>{data?.emoji ?? "🎧"}</span>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1.15 }}>
            {data?.title ?? "Podcasts"}
          </h1>
        </div>
        <p style={{ fontSize: 13, color: PALETTE.sage, margin: "0 0 20px" }}>
          {isLoading ? "Loading shows…" : `${data?.shows.length ?? 0} ${(data?.shows.length ?? 0) === 1 ? "show" : "shows"} · listen in Phoebe`}
        </p>

        <div className="space-y-3">
          {(data?.shows ?? []).map((s) => (
            <div
              key={s.slug}
              role="button"
              tabIndex={0}
              onClick={() => setLocation(`/podcasts/show/${s.slug}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(`/podcasts/show/${s.slug}`); } }}
              className="w-full flex items-center gap-3.5 rounded-2xl p-3 cursor-pointer transition-opacity hover:opacity-90"
              style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.28)" }}
            >
              <ArtTile url={s.artwork} alt={s.title} size={64} />
              <div className="min-w-0 flex-1">
                <p style={{ fontSize: 16, fontWeight: 600, color: PALETTE.warm, margin: 0, lineHeight: 1.2 }}>
                  {s.title}
                </p>
                <p style={{ fontSize: 12.5, color: PALETTE.sage, margin: "3px 0 0" }}>
                  {s.artist}
                </p>
              </div>
              <span style={{ color: PALETTE.faint, fontSize: 18, flexShrink: 0 }}>›</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
