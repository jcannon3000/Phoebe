import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { useNewsSubscriptions, getNewsSeenAt, markNewsSeen } from "@/lib/newsPrefs";

// ── End-of-prayer "News & Actions" slide ──
//
// Shown at the close of prayer (prayer-mode's closing → news → habit
// sequence) ONLY when a followed source has new stories since the user
// last looked. The liturgical framing is the dismissal — "Go in peace to
// love and serve" — so news here is the bridge from prayer to action, not
// a feed to scroll: at most three items, calm, tap to read later. Marking
// seen on Continue means it won't repeat until something new arrives.

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
type NewsResponse = {
  sources: { slug: string; name: string; emoji: string; siteUrl: string }[];
  items: NewsItem[];
};

// New stories (capped at 3) from followed sources, published since the
// user last looked. Drives BOTH the closing-slide gate (prayer-mode reads
// `hasUnseen` to decide whether to route through the news phase) and this
// slide's content. Returns [] when the user follows nothing — the query
// is disabled then, so non-subscribers pay nothing.
export function useUnseenNews(): { items: NewsItem[]; hasUnseen: boolean } {
  const subs = useNewsSubscriptions();
  const { data } = useQuery<NewsResponse>({
    queryKey: ["/api/news"],
    queryFn: () => apiRequest("GET", "/api/news"),
    enabled: subs.length > 0,
    staleTime: 10 * 60_000,
  });
  const seenAt = getNewsSeenAt();
  const items = useMemo(() => {
    return (data?.items ?? [])
      .filter((it) => subs.includes(it.sourceSlug))
      .filter((it) => (it.publishedAt ? Date.parse(it.publishedAt) : 0) > seenAt)
      .slice(0, 3);
  }, [data, subs, seenAt]);
  return { items, hasUnseen: items.length > 0 };
}

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const ACCENT = "#A8C5A0";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export default function NewsClosingSlide({
  onDone,
  visible: _visible,
}: {
  onDone: () => void;
  visible?: boolean;
}) {
  const { items } = useUnseenNews();

  // Mark seen so the same stories don't reappear next time, then advance.
  const finish = () => {
    markNewsSeen();
    onDone();
  };

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
        padding: "8px 4px", maxWidth: 520, width: "100%", margin: "0 auto", textAlign: "center",
      }}
    >
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 600, color: FAINT, margin: 0, fontFamily: FONT }}>
        As you go
      </p>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: WARM, margin: 0, lineHeight: 1.25, fontFamily: FONT }}>
        News from those you follow
      </h2>
      <p style={{ fontSize: 14, color: SAGE, margin: "0 0 2px", lineHeight: 1.5 }}>
        Go in peace to love and serve — here's what's new. Read now, or come back to it.
      </p>

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          {items.map((it) => (
            <button
              key={`${it.sourceSlug}:${it.id}`}
              type="button"
              onClick={() => { if (it.link) openExternal(it.link); }}
              className="w-full rounded-2xl text-left transition-opacity hover:opacity-90"
              style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.30)", padding: 14, cursor: "pointer" }}
            >
              <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, color: ACCENT, margin: 0 }}>
                {it.sourceName}
              </p>
              <p style={{ fontSize: 15, fontWeight: 600, color: WARM, margin: "4px 0 0", lineHeight: 1.3, fontFamily: FONT }}>
                {it.title ?? "Untitled"}
              </p>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={finish}
        className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, marginTop: 4 }}
      >
        Continue
      </button>
    </div>
  );
}
