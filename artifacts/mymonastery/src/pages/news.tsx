import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { useNewsSubscriptions, toggleNewsSubscription } from "@/lib/newsPrefs";

// ── /news — News & Actions ──
//
// A scrollable list of recent stories from Episcopal-affiliated partner
// orgs (currently Rural & Migrant Ministry), pulled from each org's RSS
// feed server-side (/api/news) with a hero image resolved per story.
// Tapping a story opens the full article in the in-app browser — the
// feed only carries an excerpt. Reachable from the side-drawer menu.

type NewsItem = {
  id: string;
  sourceSlug: string;
  sourceName: string;
  title: string | null;
  link: string | null;
  publishedAt: string | null;
  excerpt: string | null;
  categories: string[];
  imageUrl: string | null;
};
type NewsSourceMeta = { slug: string; name: string; emoji: string; siteUrl: string };
type NewsResponse = { sources: NewsSourceMeta[]; items: NewsItem[] };

const PALETTE = {
  bg: "#091A10",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
  cardBg: "rgba(46,107,64,0.08)",
  cardBorder: "rgba(46,107,64,0.22)",
  accent: "#A8C5A0",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function StoryCard({ item }: { item: NewsItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const date = fmtDate(item.publishedAt);
  const meta = [item.sourceName, date].filter(Boolean).join(" · ");
  const category = item.categories[0] ?? null;
  const open = () => { if (item.link) openExternal(item.link); };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      className="w-full rounded-2xl overflow-hidden cursor-pointer transition-opacity hover:opacity-90"
      style={{ background: PALETTE.cardBg, border: `1px solid ${PALETTE.cardBorder}` }}
    >
      {item.imageUrl && !imgFailed && (
        <div style={{ width: "100%", aspectRatio: "16 / 9", background: "#0F2818" }}>
          <img
            src={item.imageUrl}
            alt=""
            onError={() => setImgFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}
      <div style={{ padding: 16 }}>
        {category && (
          <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, color: PALETTE.accent, margin: "0 0 6px" }}>
            {category}
          </p>
        )}
        <p style={{ fontSize: 16, fontWeight: 700, color: PALETTE.warm, margin: 0, lineHeight: 1.3, fontFamily: FONT }}>
          {item.title ?? "Untitled"}
        </p>
        <p style={{ fontSize: 12, color: PALETTE.faint, margin: "6px 0 0" }}>{meta}</p>
        {item.excerpt && (
          <p
            style={{
              fontSize: 13.5, color: PALETTE.sage, margin: "8px 0 0", lineHeight: 1.5,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {item.excerpt}
          </p>
        )}
      </div>
    </div>
  );
}

export default function NewsPage() {
  const [, setLocation] = useLocation();
  const subs = useNewsSubscriptions();
  const { data, isLoading } = useQuery<NewsResponse>({
    queryKey: ["/api/news"],
    queryFn: () => apiRequest("GET", "/api/news"),
    staleTime: 10 * 60_000,
  });
  const items = data?.items ?? [];
  const sources = data?.sources ?? [];
  const primarySource = sources[0] ?? null;

  return (
    <div style={{ minHeight: "100dvh", background: PALETTE.bg, color: PALETTE.warm, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
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

      <main style={{ flex: 1, padding: "8px 20px 40px", maxWidth: 640, width: "100%", margin: "0 auto" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "8px 0 4px", letterSpacing: "-0.02em" }}>News &amp; Actions</h1>
        <p style={{ fontSize: 14, color: PALETTE.sage, margin: "0 0 18px", lineHeight: 1.5 }}>
          Recent stories and ways to act from partners in ministry.
        </p>

        {/* Follow toggles — following a source surfaces its new stories
            as a short slide at the end of your prayer. */}
        {sources.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
            {sources.map((s) => {
              const following = subs.includes(s.slug);
              return (
                <div
                  key={s.slug}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 14, background: PALETTE.cardBg, border: `1px solid ${PALETTE.cardBorder}`,
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{s.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: PALETTE.warm, margin: 0, fontFamily: FONT }}>{s.name}</p>
                    <p style={{ fontSize: 11.5, color: PALETTE.faint, margin: "2px 0 0", lineHeight: 1.35 }}>
                      {following ? "New stories appear at the end of your prayer" : "Follow to see new stories at the end of prayer"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleNewsSubscription(s.slug)}
                    className="rounded-full"
                    style={{
                      flexShrink: 0, fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
                      padding: "6px 14px", cursor: "pointer", whiteSpace: "nowrap",
                      background: following ? "rgba(46,107,64,0.30)" : "transparent",
                      border: `1px solid ${following ? "rgba(46,107,64,0.55)" : "rgba(143,175,150,0.4)"}`,
                      color: following ? PALETTE.accent : PALETTE.sage,
                    }}
                  >
                    {following ? "✓ Following" : "Follow"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {isLoading && items.length === 0 ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 24 }}>Loading stories…</p>
        ) : items.length === 0 ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 24, lineHeight: 1.5 }}>
            No stories right now. Please check back soon.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {items.map((it) => (
              <StoryCard key={`${it.sourceSlug}:${it.id}`} item={it} />
            ))}
          </div>
        )}

        {primarySource && (
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button
              type="button"
              onClick={() => openExternal(primarySource.siteUrl)}
              className="rounded-full"
              style={{
                background: "rgba(46,107,64,0.16)", border: "1px solid rgba(46,107,64,0.45)",
                color: PALETTE.accent, fontFamily: FONT, fontSize: 13, fontWeight: 600,
                padding: "8px 18px", cursor: "pointer",
              }}
            >
              View all on {primarySource.name} ↗
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
