import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";

// ── /news — News & Actions ──────────────────────────────────────────────────
//
// Podcasts-style feed of partner-org stories. Two tabs:
//   All   — every source merged, sorted newest first
//   <Org> — one source's stories in website feed order (one tab per source)

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

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Story row — horizontal thumbnail + text, Podcasts-episode style ─────────

function StoryRow({ item }: { item: NewsItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const date = fmtDate(item.publishedAt);
  const meta = [item.sourceName, date].filter(Boolean).join(" · ");
  const open = () => { if (item.link) openExternal(item.link); };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      className="w-full rounded-2xl cursor-pointer transition-opacity hover:opacity-90 flex items-start gap-3"
      style={{ padding: "14px", background: PALETTE.cardBg, border: `1px solid ${PALETTE.cardBorder}` }}
    >
      {/* Thumbnail */}
      <div style={{ width: 76, height: 76, flexShrink: 0 }}>
        {item.imageUrl && !imgFailed ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            style={{ width: 76, height: 76, borderRadius: 12, objectFit: "cover", display: "block", background: "rgba(143,175,150,0.1)" }}
          />
        ) : (
          <div
            style={{
              width: 76, height: 76, borderRadius: 12,
              background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
            }}
            aria-hidden
          >
            📰
          </div>
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p
          style={{
            fontSize: 14.5, fontWeight: 700, color: PALETTE.warm, margin: 0, lineHeight: 1.25, fontFamily: FONT,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}
        >
          {item.title ?? "Untitled"}
        </p>
        <p style={{ fontSize: 11.5, color: PALETTE.faint, margin: "4px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {meta}
        </p>
        {item.excerpt && (
          <p
            style={{
              fontSize: 12.5, color: PALETTE.sage, margin: "6px 0 0", lineHeight: 1.4, fontFamily: FONT,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {item.excerpt}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const [, setLocation] = useLocation();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  const [tab, setTab] = useState("all");

  const { data, isLoading } = useQuery<NewsResponse>({
    queryKey: ["/api/news"],
    queryFn: () => apiRequest("GET", "/api/news"),
    enabled: isBeta,
    staleTime: 10 * 60_000,
  });

  // Gate: redirect non-beta users once status resolves
  if (!betaLoading && !isBeta) {
    setLocation("/dashboard");
    return null;
  }

  const allItems = data?.items ?? [];
  const sources = data?.sources ?? [];

  const displayedItems = useMemo(() => {
    if (tab === "all") {
      return [...allItems].sort((a, b) => {
        const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return tb - ta;
      });
    }
    // Per-source: keep feed order (= website page order)
    return allItems.filter((it) => it.sourceSlug === tab);
  }, [allItems, tab]);

  const tabs: Array<{ key: string; label: string }> = [
    { key: "all", label: "All" },
    ...sources.map((s) => ({ key: s.slug, label: s.name })),
  ];

  const activeSource = tab !== "all" ? sources.find((s) => s.slug === tab) : null;

  if (betaLoading) {
    return (
      <div style={{ minHeight: "100dvh", background: PALETTE.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: PALETTE.faint, fontSize: 13, fontFamily: FONT }}>Loading…</p>
      </div>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", color: PALETTE.warm, fontFamily: FONT, paddingBottom: 48 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          News &amp; Actions
        </h1>
        <p style={{ fontSize: 14, color: PALETTE.sage, margin: "0 0 18px", lineHeight: 1.5 }}>
          Recent stories from partners in ministry.
        </p>

        {/* Source tabs */}
        {tabs.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            {tabs.map(({ key, label }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  style={{
                    flex: 1,
                    padding: "9px 10px",
                    borderRadius: 12,
                    fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
                    background: active ? "#2D5E3F" : "rgba(46,107,64,0.10)",
                    color: active ? PALETTE.warm : "rgba(168,197,160,0.9)",
                    border: `1px solid ${active ? "rgba(168,197,160,0.5)" : "rgba(46,107,64,0.28)"}`,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Story list */}
        {isLoading && allItems.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <p style={{ fontSize: 14, color: PALETTE.faint }}>Loading stories…</p>
          </div>
        ) : displayedItems.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <p style={{ fontSize: 30, margin: "0 0 12px" }}>📰</p>
            <p style={{ fontSize: 14, color: PALETTE.faint, lineHeight: 1.5 }}>No stories right now. Check back soon.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {displayedItems.map((it) => (
              <StoryRow key={`${it.sourceSlug}:${it.id}`} item={it} />
            ))}
          </div>
        )}

        {/* "View all on source" footer for per-source tabs */}
        {activeSource && (
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button
              type="button"
              onClick={() => openExternal(activeSource.siteUrl)}
              style={{
                background: "rgba(46,107,64,0.16)", border: "1px solid rgba(46,107,64,0.45)",
                color: PALETTE.accent, fontFamily: FONT, fontSize: 13, fontWeight: 600,
                padding: "8px 18px", cursor: "pointer", borderRadius: 999,
              }}
            >
              View all on {activeSource.name} ↗
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
