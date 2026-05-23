import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

// "My Prayer Feeds" — lists every feed the caller created, INCLUDING
// drafts / archived ones that don't show in the public /prayer-feeds
// discovery list (which is live-only). This is where the "Manage shows
// 2 feeds but the browse page shows 1" gap gets resolved: a stray
// draft is visible here with its state badge and a delete affordance.
//
// Routed from Admin Tools → Manage Prayer Feeds when the caller owns
// 2+ feeds. Single-feed owners still deep-link straight to that one
// feed's manage page.

const SPACE_GROTESK = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";

type MyFeed = {
  id: number;
  slug: string;
  title: string;
  coverEmoji: string | null;
  state: string;
  visibility?: string | null;
  subscriberCount: number | null;
};

function stateColor(state: string) {
  switch (state) {
    case "live": return { bg: "rgba(46,107,64,0.22)", fg: "#A8C5A0" };
    case "draft": return { bg: "rgba(193,154,58,0.18)", fg: "#E8B872" };
    case "archived": return { bg: "rgba(143,175,150,0.12)", fg: "rgba(200,212,192,0.6)" };
    default: return { bg: "rgba(143,175,150,0.12)", fg: "rgba(200,212,192,0.6)" };
  }
}

export default function MyPrayerFeedsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ feeds: MyFeed[] }>({
    queryKey: ["/api/prayer-feeds/mine"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/mine"),
    enabled: !!user,
  });
  const feeds = data?.feeds ?? [];

  const del = useMutation({
    mutationFn: (slug: string) => apiRequest("DELETE", `/api/prayer-feeds/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds"] });
    },
  });

  if (!user) return null;

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full pb-20">
        <div className="mb-4">
          <Link href="/admin/tools">
            <span style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 13, cursor: "pointer" }}>
              ← Admin tools
            </span>
          </Link>
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          My Prayer Feeds
        </h1>
        <p className="text-sm mb-6" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          Every feed you created, including drafts that don&rsquo;t appear on the public browse page.
        </p>

        {isLoading && <p className="text-sm" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Loading…</p>}

        {!isLoading && feeds.length === 0 && (
          <p className="text-sm" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
            You haven&rsquo;t created any prayer feeds yet.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {feeds.map((f) => {
            const colors = stateColor(f.state);
            return (
              <div
                key={f.id}
                className="rounded-xl px-4 py-3"
                style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{f.coverEmoji ?? "🕊️"}</span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                        {f.title}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
                        {f.slug} · {f.subscriberCount ?? 0} subscribers
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: colors.bg, color: colors.fg, fontFamily: SPACE_GROTESK }}
                  >
                    {f.state}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setLocation(`/prayer-feeds/${f.slug}/manage`)}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-opacity hover:opacity-90"
                    style={{
                      background: "rgba(46,107,64,0.22)",
                      border: "1px solid rgba(46,107,64,0.4)",
                      color: "#C8D4C0",
                      fontFamily: SPACE_GROTESK,
                    }}
                  >
                    Manage →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined" && !window.confirm(`Delete "${f.title}"? This removes the feed and all its entries + subscriptions. This can't be undone.`)) return;
                      del.mutate(f.slug);
                    }}
                    disabled={del.isPending}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(193,154,58,0.4)",
                      color: "#E8B872",
                      fontFamily: SPACE_GROTESK,
                    }}
                  >
                    {del.isPending && del.variables === f.slug ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
