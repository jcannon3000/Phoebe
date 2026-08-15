import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { ExternalLinkPill } from "@/components/ExternalLinkPill";
import { FeedEventCard, type FeedEvent } from "@/components/FeedEventCard";
import { addHomeCard, removeHomeCard, applyCachedHomeLayout, saveHomeLayout } from "@/lib/homeLayoutCache";
import { getReflectionSource, setReflectionSource, setSideReflection } from "@/lib/officePrefs";
import { VTS_TODAY_URL, markVtsRead, hasReadVtsToday } from "@/lib/cacReadState";
import { openExternalThenMarkRead } from "@/lib/openExternal";
import { swellHaptic } from "@/lib/swellHaptic";

// Feeds that unlock a specific daily-reflection practice by following them
// (see hooks/useEntitlements) — shown as its own CTA card right on the
// feed's page, not just tucked into the customizer after the fact.
const FEED_PRACTICE: Record<string, { label: string; url: string; markRead: () => void; hasReadToday: () => boolean }> = {
  vts: { label: "The Dean's Commentary", url: VTS_TODAY_URL, markRead: markVtsRead, hasReadToday: hasReadVtsToday },
};

// Feeds that put a card straight into the follower's routine when followed.
// Following VTS adds the Dean's Commentary — the reflection it unlocks —
// rather than making them go find it in the customizer afterwards. The card
// is an ordinary home module from then on, so removing it in the customizer
// works exactly like any other, and addHomeCard(respectRemoval) means a
// later re-follow won't override that removal.
const FEED_UNLOCKS_HOME_CARD: Record<string, string> = { vts: "vts" };

// Where a revoked reflection source falls back to. Forward Day by Day is
// the reflection the seeded starter rule uses (lib/guestSeed) and the first
// option in every picker, so it's the least surprising landing spot.
const DEFAULT_REFLECTION_SOURCE = "fdd" as const;

// Group upcoming events into a simple agenda — Today / This week / Later —
// so a feed with several events (e.g. Rural & Migrant Ministry) reads like
// a calendar's agenda view rather than one flat run. Events come back
// upcoming-only; sort ascending and bucket by days-from-today. Buckets
// render in this fixed order; empty ones are skipped.
type EventBucket = "today" | "week" | "later";
function bucketUpcomingEvents(events: FeedEvent[]): { bucket: EventBucket; items: FeedEvent[] }[] {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const today = startOf(new Date()).getTime();
  const sorted = [...events].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const groups = new Map<EventBucket, FeedEvent[]>();
  for (const ev of sorted) {
    const days = Math.round((startOf(new Date(ev.startsAt)).getTime() - today) / 86_400_000);
    const b: EventBucket = days <= 0 ? "today" : days < 7 ? "week" : "later";
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b)!.push(ev);
  }
  return (["today", "week", "later"] as EventBucket[])
    .filter((b) => groups.has(b))
    .map((b) => ({ bucket: b, items: groups.get(b)! }));
}

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
  // Distinct users who've posted/prayed against this intercession in
  // the rolling 7-day window. Surfaced as "N people have prayed this
  // this week" under the slide body. Optional — server is older or
  // table is empty when 0.
  weekPrayCount?: number;
  // Per-moment token. Each Continue tap POSTs /api/moment/{token}/amen
  // so the walk actually logs a check-in — that's what makes the
  // dashboard's "Begin praying / Prayer completed ✓" pill flip.
  momentToken?: string;
}

export default function PrayerFeedDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const practice = slug ? FEED_PRACTICE[slug] : undefined;
  const [practiceReadToday, setPracticeReadToday] = useState(() => practice?.hasReadToday() ?? false);

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

  // Upcoming events the feed manager published. Subscribers-only —
  // the endpoint has no anon branch.
  const eventsQ = useQuery<{ events: FeedEvent[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/events`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/events`),
    enabled: !!feed,
  });
  const events = eventsQ.data?.events ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────
  // Following/unfollowing also changes FEED-GATED ENTITLEMENTS (following
  // `vts` unlocks the Dean's Commentary — see hooks/useEntitlements). That
  // query is cached for 5 minutes, so without invalidating it here the user
  // taps Follow and the thing they just unlocked stays invisible for
  // minutes. Invalidate both the feed page and the entitlements.
  const invalidateAfterFollowChange = () => {
    qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}`] });
    qc.invalidateQueries({ queryKey: ["/api/me/entitlements"] });
    // The home feed list is derived from the same subscriptions.
    qc.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
  };
  const subscribe = useMutation({
    mutationFn: () => apiRequest("POST", `/api/prayer-feeds/${slug}/subscribe`, {}),
    onSuccess: async () => {
      // Put the unlocked card into their routine immediately, so following
      // VTS *does something* visible instead of quietly granting access to
      // an option buried in the customizer. Best-effort and deliberately
      // AFTER the subscribe succeeded — a failed layout save must not make
      // the follow itself look like it failed.
      const moduleKey = FEED_UNLOCKS_HOME_CARD[slug];
      if (moduleKey && user) {
        try {
          const current = applyCachedHomeLayout(user).homeLayout ?? null;
          const { layout, changed } = addHomeCard(current, moduleKey, { respectRemoval: true });
          if (changed) {
            await saveHomeLayout(layout);
            qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
          }
        } catch { /* the follow still stands; they can add the card manually */ }
      }
      invalidateAfterFollowChange();
    },
  });
  const unsubscribe = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/prayer-feeds/${slug}/subscribe`),
    onSuccess: async () => {
      // Unfollowing REVOKES the gated content, so actively clean the choice
      // up instead of leaving a selection pointing at something they can no
      // longer have. Hiding it in the pickers alone isn't enough: the light
      // customizer renders its current value as
      // `opts.find(v)?.label ?? opts[0].label`, so a hidden-but-still-saved
      // "vts" would make the Newsletter row display "Forward Day by Day"
      // while the stored value stayed vts — the row would misreport their
      // own setting. Removing the card and resetting the source keeps every
      // surface telling the truth.
      const moduleKey = FEED_UNLOCKS_HOME_CARD[slug];
      if (moduleKey && user) {
        try {
          const current = applyCachedHomeLayout(user).homeLayout ?? null;
          const { layout, changed } = removeHomeCard(current, moduleKey);
          if (changed) {
            await saveHomeLayout(layout);
            qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
          }
        } catch { /* best-effort — the gate still hides it either way */ }
        // Fall back to the default reflection if the revoked one was their
        // chosen source, so they're left with a real reflection rather than
        // an inert pointer at content they can't open.
        try {
          if (getReflectionSource() === moduleKey) {
            setReflectionSource(DEFAULT_REFLECTION_SOURCE);
            setSideReflection("morning", DEFAULT_REFLECTION_SOURCE);
            setSideReflection("evening", DEFAULT_REFLECTION_SOURCE);
          }
        } catch { /* best-effort */ }
      }
      invalidateAfterFollowChange();
    },
  });

  // Legacy ?play=1 — old dashboard CTA used to deep-link here and
  // auto-launch the inline modal slideshow. The CTA now routes
  // directly to /prayer-mode?queue=feed&slug={slug}, so on any
  // stale tab still carrying ?play=1 we just forward to the new
  // canonical URL instead of re-opening the legacy modal.
  const autoPlayRef = useRef(false);
  const wantsAutoPlay = (() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("play") === "1";
  })();
  useEffect(() => {
    if (!wantsAutoPlay) return;
    if (autoPlayRef.current) return;
    autoPlayRef.current = true;
    setLocation(`/prayer-mode?queue=feed&slug=${slug}`);
  }, [wantsAutoPlay, slug, setLocation]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (authLoading || !user || feedQ.isLoading) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>
          {t("common.loading")}
        </div>
      </Layout>
    );
  }
  if (!feed) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>
          {t("prayer_feed_detail.not_available")}
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
          {t("common.back")}
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
          </div>
          {isCreator && (
            <Link href={`/prayer-feeds/${slug}/manage`}>
              <span
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-opacity hover:opacity-85"
                style={{ background: "rgba(62,124,122,0.2)", border: "1px solid rgba(62,124,122,0.4)", color: "#F0EDE6" }}
              >
                {t("prayer_feed_detail.manage")}
              </span>
            </Link>
          )}
        </div>

        {/* Subscribe row. Deliberately NOT gated on !isCreator: for a
            platform-owned feed (creatorUserId null — e.g. VTS, Phoebe
            Climate) canEditFeed() grants "manage" to every beta admin, so
            an admin viewing VTS always had isCreator=true and this whole
            block was skipped — no Follow button ever appeared for them,
            even though the server has no rule stopping an admin from
            subscribing (POST .../subscribe has no isCreator check at all).
            Managing a feed and personally following it for its entitlement
            (VTS unlocks the Dean's Commentary — see hooks/useEntitlements)
            are different things; an admin needs both. */}
        <div className="mb-6">
            {isSubscribed ? (
              <button
                onClick={() => unsubscribe.mutate()}
                disabled={unsubscribe.isPending}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)", color: "#8FAF96" }}
              >
                {t("prayer_feed_detail.subscribed_tap")}
              </button>
            ) : (
              <button
                onClick={() => subscribe.mutate()}
                disabled={subscribe.isPending || feed.state !== "live"}
                className="text-sm font-semibold px-5 py-2.5 rounded-full transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#3E7C7A", color: "#F0EDE6" }}
              >
                {feed.state === "live" ? t("prayer_feed_detail.subscribe") : t("prayer_feed_detail.coming_soon")}
              </button>
            )}
        </div>

        {/* Following this feed unlocks a specific daily-reflection practice
            (VTS -> the Dean's Commentary) — surfaced right here, not just
            tucked into the customizer afterwards. Only for subscribers,
            since the entitlement itself is follow-gated. */}
        {practice && isSubscribed && (
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
                📖 {practice.label}
              </p>
              <p className="text-sm mt-0.5 mb-3" style={{ color: "#8FAF96" }}>
                Unlocked by following {feed.title} — today's reflection.
              </p>
              <button
                type="button"
                // FIXED: markRead()/setPracticeReadToday used to fire HERE,
                // immediately at tap — completely bypassing
                // openExternalThenMarkRead's "wait for the browser to close"
                // mechanism (swellHaptic, a haptic buzz with no read-tracking
                // effect, was what it actually waited to run). Same bug as
                // DailyProgressBody.tsx's reflection cards — moved the real
                // mark into the callback so it only fires on actual return.
                onClick={() => {
                  // VTS opens the in-app paragraph slideshow (permission was
                  // given to bring the text into Phoebe) — it marks read
                  // itself once actually stepped through, not on tap.
                  if (slug === "vts") { setLocation("/vts-reading"); return; }
                  openExternalThenMarkRead(practice.url, () => {
                    practice.markRead();
                    setPracticeReadToday(true);
                    swellHaptic();
                  }, { reader: true });
                }}
                className="text-sm font-semibold px-5 py-2.5 rounded-full transition-opacity hover:opacity-90"
                style={{ background: "#2E6B40", color: "#F0EDE6" }}
              >
                {practiceReadToday ? "Read ✓" : `Read today's ${practice.label}`}
              </button>
            </div>
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
                🕯️ {t("prayer_feed_detail.pray_with_feed", { feed: feed.title })}
              </p>
              <p className="text-sm mt-0.5 mb-3" style={{ color: "#8FAF96" }}>
                {t("prayer_feed_detail.ongoing_intercessions", { count: intercessions.length })}
              </p>
              {/* "Pray the full list" routes to /prayer-mode's
                  shared intercession-slideshow with queue=feed so the
                  user gets the same template as the daily walk —
                  community-intercession eyebrow, feed pill, big
                  italic body, week-pray count, Take action / Learn
                  more pill, Amen + Not today, closing summary. */}
              <button
                type="button"
                onClick={() => setLocation(`/prayer-mode?queue=feed&slug=${slug}`)}
                className="w-full text-sm font-semibold rounded-full py-2.5 transition-opacity hover:opacity-90"
                style={{ background: "#2E6B40", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                🕯️ {t("prayer_feed_detail.pray_full_list")}
              </button>
            </div>
          </div>
        )}

        {/* Upcoming events the manager attached to this feed. */}
        {events.length > 0 && (
          <div className="mb-6">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "rgba(200,212,192,0.45)" }}
            >
              {t("prayer_feed_detail.upcoming_events")}
            </p>
            {bucketUpcomingEvents(events).map(({ bucket, items }) => (
              <div key={bucket} className="mb-3">
                <p
                  className="text-[11px] font-semibold mb-1.5"
                  style={{ color: "rgba(143,175,150,0.8)", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {bucket === "today"
                    ? t("prayer_feed_detail.events_today", { defaultValue: "Today" })
                    : bucket === "week"
                      ? t("prayer_feed_detail.events_this_week", { defaultValue: "This week" })
                      : t("prayer_feed_detail.events_later", { defaultValue: "Later" })}
                </p>
                <div className="flex flex-col gap-2">
                  {items.map((ev) => (
                    <FeedEventCard key={ev.id} event={ev} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* The feed's intercessions — one flat, ongoing list, newest
            first. Each card links to its /moments/:id detail page,
            where the who-prayed roster lives. */}
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "rgba(200,212,192,0.45)" }}
        >
          {t("prayer_feed_detail.prayers")}
        </p>
        {intercessions.length === 0 ? (
          <p className="text-sm italic" style={{ color: "rgba(143,175,150,0.6)" }}>
            {isCreator
              ? t("prayer_feed_detail.empty_creator")
              : t("prayer_feed_detail.empty_subscriber")}
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
                          label={isAction ? t("prayer_feed_detail.take_action") : t("prayer_feed_detail.learn_more")}
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

    </Layout>
  );
}
