import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// Creator setup page for a Prayer Feed. Mirrors community-new.tsx in
// tone and styling. The feed starts in `draft` state — the calendar
// editor is where the creator composes entries and eventually flips
// the feed to `live`.
export default function PrayerFeedNewPage() {
  const { user, isLoading } = useAuth();
  // rawIsBeta + isLoading guard avoids the refresh-bounce-to-
  // dashboard race (unresolved beta-status query → isBeta false →
  // redirect before data lands).
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();

  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [coverEmoji, setCoverEmoji] = useState("🕊️");

  const EMOJI_OPTIONS = ["🕊️","🌍","🌱","🌳","🌾","🌸","🙏🏽","✝️","📖","🕯️","🫂","💧","🔥","☀️","🌙","🌊","🏔️","🌻","🍞","🕊"];

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
    if (!isLoading && !betaLoading && user && !rawIsBeta) setLocation("/dashboard");
  }, [user, isLoading, betaLoading, rawIsBeta, setLocation]);

  // When the user reached this page from a community's "+ Prayer
  // Feed" button, the source slug is in the URL as ?community=…
  // We pass it to the create endpoint as initialGroupSlug so the
  // server binds the new feed to the community AND auto-subscribes
  // every joined member. Without this the create silently dropped
  // the slug and the feed appeared unbound.
  const initialGroupSlug = (() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("community");
    return v && v.length > 0 ? v : null;
  })();

  const createMutation = useMutation({
    mutationFn: () => apiRequest<{ feed: { slug: string } }>("POST", "/api/prayer-feeds", {
      title: title.trim(),
      tagline: tagline.trim() || null,
      coverEmoji,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      ...(initialGroupSlug ? { initialGroupSlug } : {}),
    }),
    onSuccess: (data) => {
      setLocation(`/prayer-feeds/${data.feed.slug}/manage`);
    },
  });

  const canSubmit = title.trim().length > 0 && !createMutation.isPending;

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="max-w-lg mx-auto w-full">
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
          Start a Prayer Feed
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
          A cause people can subscribe to. Each day you publish a specific intention —
          today pray for one thing, tomorrow for another.
        </p>

        <div className="space-y-4">
          {/* Cover emoji */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
              Cover
            </label>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-4xl w-14 h-14 flex items-center justify-center rounded-2xl flex-shrink-0"
                style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}>
                {coverEmoji}
              </div>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map(e => (
                  <button key={e} onClick={() => setCoverEmoji(e)} type="button"
                    className="text-xl w-9 h-9 flex items-center justify-center rounded-xl transition-all"
                    style={{
                      background: coverEmoji === e ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                      border: `1px solid ${coverEmoji === e ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.15)"}`,
                    }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Climate Justice"
              maxLength={80}
              className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
              Tagline (optional)
            </label>
            <input
              type="text"
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              placeholder="One line about the cause."
              maxLength={200}
              className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
            />
          </div>

          <p className="text-[11px] italic" style={{ color: "rgba(143,175,150,0.65)" }}>
            Prayer Feeds are a beta feature. You'll write each day's specific intention from the feed's calendar.
          </p>

          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{
              background: "#2D5E3F",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {createMutation.isPending ? "Creating..." : "Create Feed"}
          </button>

          {createMutation.isError && (
            <p className="text-sm text-center" style={{ color: "#E57373" }}>
              Something went wrong. Try again.
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
