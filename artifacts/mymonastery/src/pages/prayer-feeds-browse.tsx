import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// Simple discovery list of every `live` Prayer Feed. Beta-only; the
// server will 403 non-beta callers regardless.

interface BrowseFeed {
  id: number;
  slug: string;
  title: string;
  tagline: string | null;
  coverEmoji: string | null;
  subscriberCount: number;
  isSubscribed: boolean;
}

export default function PrayerFeedsBrowsePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta } = useBetaStatus();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!authLoading && user && !isBeta) setLocation("/dashboard");
  }, [user, authLoading, isBeta, setLocation]);

  const feedsQ = useQuery<{ feeds: BrowseFeed[] }>({
    queryKey: ["/api/prayer-feeds"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds"),
    enabled: !!user && isBeta,
  });
  const feeds = feedsQ.data?.feeds ?? [];

  if (authLoading || !user) return null;

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        <button
          onClick={() => setLocation("/dashboard")}
          className="text-xs mb-4 flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#8FAF96" }}
        >
          ← Back
        </button>

        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Prayer Feeds
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
          Subscribe to a cause. Pray for a new specific intention each day.
        </p>

        {feedsQ.isLoading && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>Loading…</p>
        )}

        {!feedsQ.isLoading && feeds.length === 0 && (
          <div
            className="rounded-2xl p-5 text-sm"
            style={{ background: "rgba(62,124,122,0.06)", border: "1px solid rgba(62,124,122,0.18)", color: "#8FAF96" }}
          >
            No feeds are live yet.{" "}
            <Link href="/prayer-feeds/new">
              <span className="underline cursor-pointer" style={{ color: "#A8C5A0" }}>Start one →</span>
            </Link>
          </div>
        )}

        <div className="space-y-2">
          {feeds.map(f => (
            <Link key={f.id} href={`/prayer-feeds/${f.slug}`}>
              <div
                className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-opacity hover:opacity-90"
                style={{ background: "rgba(62,124,122,0.08)", border: "1px solid rgba(62,124,122,0.22)" }}
              >
                <div
                  className="text-2xl w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{ background: "rgba(62,124,122,0.15)", border: "1px solid rgba(62,124,122,0.3)" }}
                >
                  {f.coverEmoji ?? "🕊️"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{f.title}</p>
                  {f.tagline && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: "#8FAF96" }}>{f.tagline}</p>
                  )}
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                    {f.subscriberCount} praying along
                    {f.isSubscribed && " · ✓ Subscribed"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 pt-6" style={{ borderTop: "1px solid rgba(143,175,150,0.15)" }}>
          <Link href="/prayer-feeds/new">
            <span className="text-sm font-semibold cursor-pointer" style={{ color: "#A8C5A0" }}>
              + Start your own prayer feed
            </span>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
