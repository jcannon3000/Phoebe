import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { useHiddenStoryIds, hideStory } from "@/lib/newsPrefs";

// ── NewsRail — horizontal "stories" carousel ────────────────────────────
//
// A Hallow-style cover-image slider for the home screen, mirroring
// PodcastsRail: a row of square story tiles that scroll horizontally.
// Pulls the merged partner-org news feed (/api/news — the same source the
// /news page uses), so it stays in sync automatically. Tapping a tile opens
// the full article in the in-app browser.
//
// Each tile carries an eye-off button (top-right corner) that hides the
// story from the rail and saves the preference to localStorage. Hidden
// stories are excluded immediately; the user can restore all via
// clearHiddenStories() (exposed on /news if needed).

const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_W = 144;

type NewsItem = {
  id: string;
  sourceName: string;
  title: string | null;
  link: string | null;
  imageUrl: string | null;
};
type NewsResponse = { items: NewsItem[] };

function CardImage({ url, alt }: { url: string | null; alt: string }) {
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
      📰
    </div>
  );
}

export function NewsRail() {
  const { data } = useQuery<NewsResponse>({
    queryKey: ["/api/news"],
    queryFn: () => apiRequest("GET", "/api/news"),
    staleTime: 30 * 60_000,
  });
  const hiddenIds = useHiddenStoryIds();

  // Only stories that can be opened + named, excluding hidden ones, capped for the rail.
  const stories = (data?.items ?? [])
    .filter((s) => s.link && s.title && !hiddenIds.has(s.id))
    .slice(0, 16);

  if (stories.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold" style={{ color: "#F0EDE6", fontFamily: FONT }}>
          📰 News
        </h2>
        <Link href="/news" className="text-sm font-semibold" style={{ color: "#A8C5A0", fontFamily: FONT }}>
          See all →
        </Link>
      </div>
      <div
        style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        {stories.map((s) => (
          <div
            key={s.id}
            style={{ width: CARD_W, flexShrink: 0, position: "relative" }}
          >
            {/* Article link area */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => { if (s.link) openExternal(s.link); }}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && s.link) { e.preventDefault(); openExternal(s.link); } }}
              className="cursor-pointer transition-opacity hover:opacity-90"
            >
              <CardImage url={s.imageUrl} alt={s.title ?? "Story"} />
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
                {s.sourceName}
              </p>
            </div>

            {/* Eye-off button — top-right corner of the image */}
            <button
              type="button"
              aria-label="Hide this story"
              onClick={(e) => {
                e.stopPropagation();
                hideStory(s.id);
              }}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.52)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "rgba(255,255,255,0.75)",
                padding: 0,
                lineHeight: 0,
              }}
            >
              <EyeOff size={13} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
