import { useEffect, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLinkPill } from "@/components/ExternalLinkPill";

// Subscriber detail page for a Prayer Feed.
//
// A feed is a flat, ongoing list of community-intercession cards — no
// day scheduling. Each intercession is its own card (a prayer, with an
// optional Learn more / Take action link) that links to its
// /moments/:id detail page, where the who-prayed roster lives. The
// "Pray the full list" button walks the whole list as a slideshow.
//
// The same URL works for the creator — `isCreator` surfaces a "Manage"
// button into the intercession composer.

type FeedState = "draft" | "live" | "paused";

interface Feed {
  id: number;
  slug: string;
  title: string;
  tagline: string | null;
  coverEmoji: string | null;
  coverImageUrl: string | null;
  creatorUserId: number;
  timezone: string;
  state: FeedState;
  subscriberCount: number;
}

interface FeedResponse {
  feed: Feed;
  isCreator: boolean;
  isSubscribed: boolean;
}

// A feed intercession — a shared_moments row scoped to this feed. This
// is the feed's whole content now: an ongoing list, newest first.
interface FeedIntercession {
  id: number;
  name: string;
  intention: string | null;
  intercessionTopic: string | null;
  intercessionFullText: string | null;
  intercessionSource: string | null;
  learnMoreUrl: string | null;
  state: string;
  createdAt: string;
}

export default function PrayerFeedDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  // The slide walker — "Pray the full list" opens the whole feed;
  // tapping a card opens a one-slide deck. null = closed.
  const [slideshow, setSlideshow] = useState<{
    deck: FeedIntercession[];
    index: number;
  } | null>(null);

  useEffect(() => {
    // Prayer feeds are reachable by any signed-in account now — public
    // feeds are open to everyone and the API enforces public/private.
    // Only the not-signed-in case bounces.
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation, slug]);

  // ── Feed + intercessions ────────────────────────────────────────────────
  const feedQ = useQuery<FeedResponse>({
    queryKey: [`/api/prayer-feeds/${slug}`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}`),
    enabled: !!user && !!slug,
  });
  const feed = feedQ.data?.feed ?? null;

  // The feed's intercessions — shared_moments scoped to this feed. The
  // feed's entire content: a flat, ongoing list. Newest first so a new
  // intercession lands at the top.
  const intercessionsQ = useQuery<{ intercessions: FeedIntercession[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/intercessions`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/intercessions`),
    enabled: !!feed,
  });
  const intercessions = [...(intercessionsQ.data?.intercessions ?? [])]
    .filter((it) => it.state !== "archived")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ── Mutations ──────────────────────────────────────────────────────────
  const subscribe = useMutation({
    mutationFn: () => apiRequest("POST", `/api/prayer-feeds/${slug}/subscribe`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}`] }),
  });
  const unsubscribe = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/prayer-feeds/${slug}/subscribe`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}`] }),
  });

  function openSlideshow(deck: FeedIntercession[], index: number) {
    if (deck.length === 0) return;
    setSlideshow({ deck, index: Math.max(0, Math.min(index, deck.length - 1)) });
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (authLoading || !user || feedQ.isLoading) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>
          Loading…
        </div>
      </Layout>
    );
  }
  if (!feed) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>
          This feed isn't available.
        </div>
      </Layout>
    );
  }

  const isCreator = feedQ.data?.isCreator ?? false;
  const isSubscribed = feedQ.data?.isSubscribed ?? false;

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

        {/* Feed header */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            {feed.coverEmoji ?? "🕊️"}
          </div>
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl font-bold leading-tight"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {feed.title}
            </h1>
            {feed.tagline && (
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{feed.tagline}</p>
            )}
            <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
              {feed.subscriberCount} praying along
            </p>
          </div>
          {isCreator && (
            <Link href={`/prayer-feeds/${slug}/manage`}>
              <span
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-opacity hover:opacity-85"
                style={{ background: "rgba(62,124,122,0.2)", border: "1px solid rgba(62,124,122,0.4)", color: "#F0EDE6" }}
              >
                Manage
              </span>
            </Link>
          )}
        </div>

        {/* Subscribe row */}
        {!isCreator && (
          <div className="mb-6">
            {isSubscribed ? (
              <button
                onClick={() => unsubscribe.mutate()}
                disabled={unsubscribe.isPending}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)", color: "#8FAF96" }}
              >
                ✓ Subscribed · tap to unsubscribe
              </button>
            ) : (
              <button
                onClick={() => subscribe.mutate()}
                disabled={subscribe.isPending || feed.state !== "live"}
                className="text-sm font-semibold px-5 py-2.5 rounded-full transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#3E7C7A", color: "#F0EDE6" }}
              >
                {feed.state === "live" ? "Subscribe" : "Coming soon"}
              </button>
            )}
          </div>
        )}

        {/* Pray-with-this-feed box — carries the "Pray the full list"
            CTA, which walks every intercession in the feed as one
            slideshow. */}
        {intercessions.length > 0 && (
          <div
            className="mb-6 rounded-2xl overflow-hidden flex"
            style={{
              background: "rgba(46,107,64,0.15)",
              border: "1px solid rgba(46,107,64,0.45)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
            }}
          >
            <div className="w-1 flex-shrink-0" style={{ background: "#2E6B40" }} />
            <div className="flex-1 px-4 py-3.5 min-w-0">
              <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
                🕯️ Pray with {feed.title}
              </p>
              <p className="text-sm mt-0.5 mb-3" style={{ color: "#8FAF96" }}>
                {intercessions.length} ongoing{" "}
                {intercessions.length === 1 ? "intercession" : "intercessions"} to carry in prayer.
              </p>
              <button
                type="button"
                onClick={() => openSlideshow(intercessions, 0)}
                className="w-full text-sm font-semibold rounded-full py-2.5 transition-opacity hover:opacity-90"
                style={{ background: "#2E6B40", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                🕯️ Pray the full list →
              </button>
            </div>
          </div>
        )}

        {/* The feed's intercessions — one flat, ongoing list, newest
            first. Each card links to its /moments/:id detail page,
            where the who-prayed roster lives. */}
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "rgba(200,212,192,0.45)" }}
        >
          Prayers
        </p>
        {intercessions.length === 0 ? (
          <p className="text-sm italic" style={{ color: "rgba(143,175,150,0.6)" }}>
            {isCreator
              ? "No intercessions yet — add the first from Manage."
              : "No intercessions in this feed yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {intercessions.map((it) => {
              const isAction = it.intercessionSource === "action";
              return (
                <div
                  key={it.id}
                  className="rounded-2xl px-4 py-3"
                  style={{ background: "rgba(62,124,122,0.12)", border: "1px solid rgba(62,124,122,0.3)" }}
                >
                  <div className="flex items-start gap-3">
                    <Link href={`/moments/${it.id}`} className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug" style={{ color: "#F0EDE6" }}>
                        {it.intention || it.name}
                      </p>
                      {it.intercessionFullText && (
                        <p
                          className="text-[12px] mt-1 leading-snug"
                          style={{
                            color: "rgba(143,175,150,0.8)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {it.intercessionFullText}
                        </p>
                      )}
                    </Link>
                    {/* CTA pill — opens the link without navigating to
                        the moment page. Uses ExternalLinkPill so the
                        first-tap glow + click persistence matches the
                        slideshow and the intercession detail page. */}
                    {it.learnMoreUrl && (
                      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                        <ExternalLinkPill
                          url={it.learnMoreUrl}
                          label={isAction ? "Take action →" : "Learn more →"}
                          size="small"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Slide walker — "Pray the full list" walks every intercession
          in the feed. Each slide is the prayer text + a Learn more /
          Take action link. */}
      <AnimatePresence>
        {slideshow && (() => {
          const cur = slideshow.deck[slideshow.index];
          if (!cur) return null;
          const total = slideshow.deck.length;
          const isLast = slideshow.index >= total - 1;
          const advance = () => {
            if (isLast) setSlideshow(null);
            else setSlideshow({ deck: slideshow.deck, index: slideshow.index + 1 });
          };
          const back = () => {
            if (slideshow.index > 0) {
              setSlideshow({ deck: slideshow.deck, index: slideshow.index - 1 });
            }
          };
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex flex-col"
              style={{ background: "#0C1F12" }}
            >
              <button
                type="button"
                onClick={() => setSlideshow(null)}
                aria-label="Close"
                className="absolute flex items-center justify-center rounded-full"
                style={{
                  top: "calc(env(safe-area-inset-top, 0px) + 12px)",
                  right: 16,
                  width: 36,
                  height: 36,
                  background: "rgba(46,107,64,0.18)",
                  border: "1px solid rgba(46,107,64,0.35)",
                  color: "#C8D4C0",
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: "pointer",
                  zIndex: 1,
                }}
              >
                ×
              </button>
              <div
                className="flex-1 flex flex-col items-center text-center px-6"
                style={{
                  maxWidth: 560,
                  margin: "0 auto",
                  width: "100%",
                  paddingTop: "clamp(72px, 14vh, 140px)",
                  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
                  gap: 18,
                  overflowY: "auto",
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "rgba(143,175,150,0.5)" }}
                >
                  {feed.title}
                  {total > 1 ? ` · ${slideshow.index + 1} of ${total}` : ""}
                </p>
                <h2
                  className="text-xl font-semibold leading-snug"
                  style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {cur.intention || cur.name}
                </h2>
                {cur.intercessionFullText && (
                  <p
                    className="italic"
                    style={{
                      color: "#E8E4D8",
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: 20,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {cur.intercessionFullText}
                  </p>
                )}
                {cur.learnMoreUrl && (
                  <ExternalLinkPill
                    url={cur.learnMoreUrl}
                    label={cur.intercessionSource === "action" ? "Take action →" : "Learn more →"}
                    size="medium"
                  />
                )}

                {/* Walk controls — Continue advances the deck; the last
                    slide finishes and closes. Back steps one slide. */}
                <div className="flex flex-col items-center gap-2.5 mt-2">
                  <button
                    type="button"
                    onClick={advance}
                    className="text-sm font-semibold rounded-full py-2.5 transition-opacity hover:opacity-90"
                    style={{
                      background: "#2D5E3F",
                      border: "1px solid rgba(46,107,64,0.7)",
                      color: "#F0EDE6",
                      fontFamily: "'Space Grotesk', sans-serif",
                      cursor: "pointer",
                      minWidth: 200,
                    }}
                  >
                    {isLast ? (total > 1 ? "Finish 🌿" : "Done") : "Continue →"}
                  </button>
                  {slideshow.index > 0 && (
                    <button
                      type="button"
                      onClick={back}
                      className="text-[13px] transition-opacity hover:opacity-80"
                      style={{
                        color: "rgba(143,175,150,0.7)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      ← Back
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </Layout>
  );
}
