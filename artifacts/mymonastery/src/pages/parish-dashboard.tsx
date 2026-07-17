/**
 * Phoebe Parish — simplified dashboard for parish-only users.
 *
 * What lives here (and ONLY here, for users in the parish-only tier):
 *   • The parish identity card — name, today's intercessions
 *   • Daily Office / Daily Devotion entry points (Morning + Evening)
 *   • A small footer link to settings (office reminder prefs, parish
 *     picker, sign out)
 *
 * What does NOT live here — anything user-generated. No garden, no
 * prayer requests, no communities, no letters. Those surfaces are
 * gated behind the full-app tier (beta or community member).
 *
 * Layout intentionally minimal. The whole point of Parish is that a
 * non-Phoebe-power-user can open the app, see the day's intercessions,
 * and tap into Morning Prayer. No nav drawer, no badges to chase.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { LiturgicalDateHeader } from "@/components/LiturgicalDateHeader";
import {
  PrayerOfficeCard,
  FeedPrayerCard,
  FeedHeroCard,
  type SubscribedFeed as SubscribedFeedDashboard,
} from "./dashboard";

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BORDER = "rgba(200,212,192,0.15)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

interface ParishToday {
  parish: {
    id: number;
    slug: string;
    title: string;
    tagline: string | null;
    coverEmoji: string | null;
    timezone: string;
  };
  // The 3 published slot entries for today (max). Less than 3 if the
  // parish admin hasn't programmed all slots; empty array if no
  // intentions are live for today yet.
  todayEntries: Array<{
    id: number;
    slot: number;
    title: string;
    body: string;
    scriptureRef: string | null;
    state: "draft" | "scheduled" | "published";
    prayCount: number;
  }>;
  // Rolling 7-day count of distinct parishioners who've prayed any
  // office/devotion. Powers the soft "your parish is praying" line
  // under the header.
  parishionersPrayingThisWeek: number;
}

const SLOT_LABEL: Record<number, string> = { 1: "First", 2: "Second", 3: "Third" };

export default function ParishDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  // Beta-preview mode: a beta user is full-tier by derivation (beta
  // wins in parishGate.ts), but should still be able to walk the
  // Parish surface end-to-end. We treat them as parish-only for the
  // purpose of redirects + data fetches when they have a parishFeedId,
  // and route them to /parish/onboarding to pick one when they don't.
  const isParishPreviewer = !!user && user.accessTier === "full" && rawIsBeta;
  const showParishContent = !!user && (user.accessTier === "parish-only" || isParishPreviewer);

  // Sanity-redirect: if the user landed here but isn't actually in the
  // parish-only tier, send them where they belong. The router-level
  // gate covers the same case but a direct URL hit shouldn't hang on
  // a blank page.
  useEffect(() => {
    if (authLoading || betaLoading) return;
    if (!user) { setLocation("/"); return; }
    // Onboarding takes priority over every other bounce: an
    // assigned-tier user who hasn't walked the post-signup slideshow
    // does that first, then comes back to whatever surface they were
    // headed for. Used to be the LAST setLocation in this effect and
    // worked by "last call wins" — explicit early return makes the
    // priority order obvious and mutually exclusive with the other
    // bounces.
    if (user.accessTier !== "unassigned" && !user.onboardingCompleted) {
      setLocation("/onboarding"); return;
    }
    // Beta previewers without a parishFeedId belong on the picker, not
    // a blank dashboard. parish-only users without one shouldn't exist
    // (the tier is derived from parishFeedId being set), but the same
    // bounce handles them just in case.
    if (isParishPreviewer && user.parishFeedId == null) { setLocation("/parish/onboarding"); return; }
    if (user.accessTier === "unassigned") { setLocation("/parish/onboarding"); return; }
    if (user.accessTier === "full" && !rawIsBeta) { setLocation("/dashboard"); return; }
  }, [user, authLoading, betaLoading, rawIsBeta, isParishPreviewer, setLocation]);

  const todayQuery = useQuery<ParishToday>({
    queryKey: ["/api/parish/today"],
    queryFn: () => apiRequest("GET", "/api/parish/today"),
    enabled: showParishContent,
    staleTime: 60_000,
  });

  // Subscribed prayer feeds — only meaningful for offices-only users
  // who came in via /feed/:slug (the public-feed signup auto-subscribes
  // them) or who later browsed and subscribed manually. For parish-only
  // users we keep the surface focused on the parish itself.
  //
  // Type imported from dashboard.tsx so FeedPrayerCard can consume the
  // same row shape — gives offices-only users the identical
  // "Begin praying" / "X New Prayers" UI as the full app.
  type SubscribedFeed = SubscribedFeedDashboard;
  const subscribedFeedsQuery = useQuery<{ subscriptions: SubscribedFeed[] }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    enabled: !!user && user?.accessTier === "offices-only",
    staleTime: 60_000,
  });

  // For offices-only users we render the feed's intercessions as a
  // "Prayer List"-style card stack at the bottom of the page — the
  // direct analogue of the personal prayer-request list the full
  // dashboard surfaces. Each card taps through to /moments/:id.
  // Fetched from /api/prayer-feeds/:slug/intercessions for each
  // subscribed feed; queries are deduped by feed slug.
  type FeedIntercession = {
    id: number;
    intercessionTopic: string | null;
    intercessionFullText: string | null;
    name: string;
    feedSlug?: string;
    feedTitle?: string;
    feedEmoji?: string | null;
  };
  const subscribedFeedsData = subscribedFeedsQuery.data?.subscriptions ?? [];
  const firstFeedSlug = subscribedFeedsData[0]?.feed.slug ?? null;
  const feedIntercessionsQuery = useQuery<{ intercessions: FeedIntercession[] }>({
    queryKey: [`/api/prayer-feeds/${firstFeedSlug}/intercessions`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${firstFeedSlug}/intercessions`),
    enabled: !!user && user?.accessTier === "offices-only" && !!firstFeedSlug,
    staleTime: 60_000,
  });
  // Don't cap here — the rendered Prayer List section uses the same
  // ~3.5-card clamp + bottom-fade pattern the full dashboard's
  // PrayerListCarousel uses, so the user can scroll for more rather
  // than the section silently truncating at 5.
  const feedIntercessions = feedIntercessionsQuery.data?.intercessions ?? [];

  if (authLoading || betaLoading || !user) return null;

  const data = todayQuery.data;
  const subscribedFeeds = subscribedFeedsQuery.data?.subscriptions ?? [];
  // hasFeeds removed — offices-only now branches early to its own
  // render, and parish-only doesn't surface a feed list here.
  const isMorning = new Date().getHours() < 12;

  // Feed-first home — identical to the main dashboard, and the single
  // control for whether the office shows. A climate (or any other)
  // portal sign-up is offices-only and lands HERE, so this is the home
  // that actually shows the featured-feed hero for most portal users.
  // When a feed is featured it gets the tall hero card in the office
  // card's slot (office hidden) and is dropped from the secondary
  // FeedPrayerCard stack so it isn't doubled. (The old localStorage
  // "Hide the Daily Office" toggle was removed — it contradicted this
  // server-backed picker.)
  const featuredFeed = (user.feedFirstHome && user.homeFeedId != null)
    ? subscribedFeedsData.find((f) => f.feed.id === user.homeFeedId) ?? null
    : null;
  const secondaryFeeds = featuredFeed
    ? subscribedFeedsData.filter((f) => f.feed.id !== featuredFeed.feed.id)
    : subscribedFeedsData;

  // ─── Offices-only home ─────────────────────────────────────────────
  // A trimmed version of the full /dashboard layout. Same header
  // rhythm (date + feast subtitle), same PrayerOfficeCard, same
  // FeedPrayerCard(s), then the feed's intercessions rendered as a
  // "Prayer List"-style card stack at the bottom in place of the
  // full app's personal prayer-request section.
  if (user.accessTier === "offices-only") {
    // Wrap in <Layout> so the offices-only home gets the SAME header,
    // drawer, and chrome as the main dashboard — just with the
    // Communities / Prayer List / People surfaces hidden by the
    // tier-aware filter inside Layout itself. The render below is
    // only the page content; Phoebe header + drawer come from Layout.
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full">
          {/* Date + feast subtitle — same component the full
              dashboard uses. */}
          <h1
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: WARM_TEXT,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {format(new Date(), "EEEE, d MMMM")}
          </h1>
          <LiturgicalDateHeader feastOnly fallbackText="A Daily Rhythm of Prayer" />

          {/* Primary anchor. Feed-first home (the default for portal
              sign-ups) shows the featured feed's tall hero card; with no
              featured feed the shared PrayerOfficeCard leads. The
              Settings → Home screen picker is the single switch between
              the two. */}
          <div className="mt-5">
            {featuredFeed ? <FeedHeroCard feed={featuredFeed} /> : <PrayerOfficeCard />}
          </div>

          {/* Secondary anchors. When a feed is promoted to the hero, the
              office is NOT hidden — it drops to a compact one-line card
              here, the same quieter format the feed takes for everyone
              else. Then the per-feed "begin praying" cards (featured
              feed excluded so it isn't doubled). "Begin praying / X New
              Prayers / Completed | View list" comes for free. */}
          {(featuredFeed || secondaryFeeds.length > 0) && (
            <div className="mt-3 mb-2 flex flex-col gap-3">
              {featuredFeed && <PrayerOfficeCard compact />}
              {secondaryFeeds.map((row) => (
                <FeedPrayerCard key={row.feed.id} feed={row} />
              ))}
            </div>
          )}

          {/* Subscribe prompt when an offices-only user hasn't picked
              a feed yet — the rest of the page would otherwise be
              empty for them. */}
          {subscribedFeedsData.length === 0 && (
            <Link href="/prayer-feeds">
              <div
                style={{
                  marginTop: 16,
                  background: "rgba(46,107,64,0.10)",
                  border: "1px solid rgba(46,107,64,0.25)",
                  borderRadius: 16,
                  padding: "16px 18px",
                  cursor: "pointer",
                }}
              >
                <p style={{ fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, color: WARM_TEXT, margin: 0 }}>
                  🌍 Explore prayer feeds
                </p>
                <p style={{ color: SAGE, fontSize: 12, margin: "4px 0 0" }}>
                  Follow a public feed — its intercessions join your daily office.
                </p>
              </div>
            </Link>
          )}

          {/* Prayer List — the feed's intercessions as cards. Stands
              in for the full app's personal prayer-request list at
              the bottom of /dashboard. Each card taps through to the
              moment detail page. Layout mirrors the full dashboard's
              PrayerListCarousel: title + divider + "View all" pill,
              then a vertical card stack clamped to ~3.5 rows with a
              bottom fade once the list overflows, so the same
              "scroll for more" affordance reads on both surfaces. */}
          {firstFeedSlug && feedIntercessions.length > 0 && (() => {
            const feedRow = subscribedFeedsData.find((f) => f.feed.slug === firstFeedSlug);
            const feedTitle = feedRow?.feed.title ?? "Prayer feed";
            const feedEmoji = feedRow?.feed.coverEmoji ?? "🌿";
            // Same constants the dashboard's PrayerListCarousel uses
            // — three full cards plus a half-row peek.
            const CLAMP = 280;
            const overflowing = feedIntercessions.length > 3;
            return (
              <div className="mt-8">
                {/* Title row: matches the full dashboard's
                    PrayerListCarousel — heading + horizontal
                    divider + "View all" pill aligned right. */}
                <div className="flex items-center gap-3 mb-2">
                  <h3
                    className="text-lg font-semibold"
                    style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK }}
                  >
                    Prayer List
                  </h3>
                  <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
                  <Link
                    href={`/prayer-feeds/${firstFeedSlug}`}
                    className="text-[10px] font-semibold uppercase transition-opacity hover:opacity-80"
                    style={{
                      color: "rgba(143,175,150,0.55)",
                      letterSpacing: "0.12em",
                      fontFamily: SPACE_GROTESK,
                    }}
                  >
                    View all
                  </Link>
                </div>

                <div style={{ position: "relative" }}>
                  <div
                    className="space-y-2"
                    style={
                      overflowing
                        ? {
                            maxHeight: CLAMP,
                            overflowY: "auto",
                            WebkitOverflowScrolling: "touch",
                            paddingBottom: 8,
                          }
                        : undefined
                    }
                  >
                    {feedIntercessions.map((it) => (
                      // Route into the feed-walk slideshow with
                      // ?focus={id} so the slideshow opens directly
                      // on the tapped intercession instead of the
                      // top of the deck. The previous href was
                      // /moments/:id which 403s for offices-only
                      // viewers (the /moments prefix is blocked
                      // server-side) and left them on an endless
                      // loading screen.
                      <Link
                        key={it.id}
                        href={`/prayer-mode?queue=feed&slug=${encodeURIComponent(firstFeedSlug)}&focus=${it.id}`}
                        className="block"
                      >
                        <div
                          className="relative flex rounded-xl overflow-hidden"
                          style={{
                            background: "rgba(46,107,64,0.15)",
                            border: "1px solid rgba(46,107,64,0.28)",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
                          }}
                        >
                          {/* Green left-rail spacer — matches the
                              avatar-rail width on the full dashboard
                              cards so heights line up visually. */}
                          <div className="w-1 flex-shrink-0" style={{ background: "#8FAF96" }} />
                          <div className="flex-1 px-4 pt-3 pb-3">
                            <div className="flex items-center gap-3">
                              {/* Emoji "avatar" — the feed's cover
                                  emoji stands in for the per-prayer
                                  avatar the full dashboard shows. */}
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                style={{
                                  background: "#1A4A2E",
                                  border: "1px solid rgba(46,107,64,0.3)",
                                  fontSize: 18,
                                }}
                              >
                                {feedEmoji}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p
                                  className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5 truncate"
                                  style={{ color: "rgba(143,175,150,0.55)" }}
                                >
                                  From {feedTitle}
                                </p>
                                <p
                                  className="text-sm leading-snug line-clamp-2"
                                  style={{ color: WARM_TEXT }}
                                >
                                  {it.intercessionTopic || it.name || "Intercession"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                  {/* Bottom fade — only when overflowing. Same
                      gradient the dashboard uses; ends in the
                      parish page bg color (BG) so the peek reads
                      as "more below" instead of a hard cutoff. */}
                  {overflowing && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
                      style={{ background: `linear-gradient(to bottom, transparent 20%, ${BG})` }}
                    />
                  )}
                </div>
              </div>
            );
          })()}

          {/* Footer — quiet links, same as before. */}
          <div className="flex flex-col items-center gap-2 mt-10">
            <Link href="/bcp">
              <span style={{ color: SAGE, fontSize: 13, fontFamily: SPACE_GROTESK, cursor: "pointer" }}>
                Browse the Book of Common Prayer →
              </span>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: WARM_TEXT }}>
      <div
        style={{
          maxWidth: 600,
          margin: "0 auto",
          padding: "calc(var(--safe-top) + 24px) 20px calc(env(safe-area-inset-bottom) + 32px)",
        }}
      >
        {/* Header — Phoebe wordmark left, settings right. Mirrors the
            visual rhythm of /dashboard but stripped of all the
            user-generated chrome. */}
        <div className="flex items-center justify-between mb-8">
          <p
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: WARM_TEXT,
              margin: 0,
            }}
          >
            Phoebe
          </p>
          <Link href="/parish/settings">
            <span
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: 13,
                color: SAGE,
                cursor: "pointer",
              }}
            >
              Settings
            </span>
          </Link>
        </div>

        {/* Parish identity card */}
        {data?.parish ? (
          <div className="mb-6">
            <p
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: FAINT_GREEN,
                marginBottom: 6,
              }}
            >
              Your parish
            </p>
            <div className="flex items-center gap-3">
              <div
                style={{
                  fontSize: 32,
                  width: 48,
                  height: 48,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                  background: "rgba(46,107,64,0.15)",
                  border: "1px solid rgba(46,107,64,0.3)",
                }}
              >
                {data.parish.coverEmoji ?? "⛪"}
              </div>
              <div>
                <h1
                  style={{
                    fontFamily: SPACE_GROTESK,
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    color: WARM_TEXT,
                    margin: 0,
                  }}
                >
                  {data.parish.title}
                </h1>
                {data.parishionersPrayingThisWeek > 0 && (
                  <p style={{ color: SAGE, fontSize: 13, marginTop: 2 }}>
                    {data.parishionersPrayingThisWeek}{" "}
                    {data.parishionersPrayingThisWeek === 1 ? "person" : "people"} praying this week
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Today's parish intercessions — parish-only; an offices-only
            account has no parish slate of its own. (Beta previewers
            are shown the same content so they can see the surface
            end-to-end.) */}
        {showParishContent && (
        <>
        <p
          style={{
            fontFamily: SPACE_GROTESK,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: FAINT_GREEN,
            marginBottom: 8,
          }}
        >
          Today's intercessions
        </p>
        {data?.todayEntries && data.todayEntries.length > 0 ? (
          <div className="space-y-2 mb-6">
            {data.todayEntries.map((e) => (
              <div
                key={e.id}
                style={{
                  background: "#0F2818",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 16,
                  padding: "16px 18px",
                }}
              >
                <p
                  style={{
                    fontFamily: SPACE_GROTESK,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(143,175,150,0.55)",
                    margin: 0,
                  }}
                >
                  {SLOT_LABEL[e.slot] ?? "Intercession"}
                </p>
                <p
                  style={{
                    fontFamily: SPACE_GROTESK,
                    fontSize: 16,
                    fontWeight: 600,
                    color: WARM_TEXT,
                    margin: "4px 0 0",
                  }}
                >
                  {e.title}
                </p>
                {e.body && (
                  <p
                    style={{
                      fontFamily: GEORGIA,
                      fontStyle: "italic",
                      fontSize: 14,
                      color: "rgba(240,237,230,0.85)",
                      lineHeight: 1.55,
                      margin: "8px 0 0",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {e.body}
                  </p>
                )}
                {e.scriptureRef && (
                  <p
                    style={{
                      fontFamily: GEORGIA,
                      fontStyle: "italic",
                      fontSize: 12,
                      color: SAGE,
                      margin: "8px 0 0",
                    }}
                  >
                    — {e.scriptureRef}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              background: "rgba(46,107,64,0.06)",
              border: "1px solid rgba(46,107,64,0.18)",
              borderRadius: 16,
              padding: "16px 18px",
              marginBottom: 24,
              fontFamily: GEORGIA,
              fontStyle: "italic",
              color: SAGE,
              fontSize: 14,
            }}
          >
            {t("parish.no_intentions_today")}
          </div>
        )}
        </>
        )}

        {/* Your subscribed feeds — surfaced ABOVE the office buttons
            for offices-only members who came in via /feed/:slug (or
            later subscribed). Each card shows the feed's newest
            intercession + taps through to the full feed detail. When
            the user has no subscriptions this whole block is hidden
            and the offices stay primary. */}
        {/* (Subscribed-feeds card row removed — offices-only is now
            served by the early-return above; parish-only doesn't show
            a feed list at this level.) */}

        {/* Office entry points */}
        <p
          style={{
            fontFamily: SPACE_GROTESK,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: FAINT_GREEN,
            marginBottom: 8,
          }}
        >
          {t("parish.pray_with_parish")}
        </p>
        <div className="grid grid-cols-2 gap-2 mb-6">
          <OfficeButton
            label={isMorning ? t("offices.morning_devotion") : t("offices.early_evening_devotion")}
            sub={t("settings.short_bcp_form")}
            href={
              isMorning
                ? "/bcp/daily-devotions?mode=morning-devotion"
                : "/bcp/daily-devotions?mode=early-evening-devotion"
            }
            primary
          />
          <OfficeButton
            label={isMorning ? t("offices.morning_prayer") : t("offices.evening_prayer")}
            sub={t("parish.full_daily_office")}
            href={isMorning ? "/bcp/daily-office?mode=morning" : "/bcp/daily-office?mode=evening"}
          />
        </div>

        {/* (Offices-only "explore feeds" card removed — that tier is
            served by the early-return at the top of this component
            now and never reaches the parish render below.) */}

        {/* Private prayer concern — visible only to the parish admin
            (the priest / pastor). The card is intentionally quieter
            than the office buttons: this is for when something is
            on your heart, not the daily rhythm. */}
        {data?.parish && <ParishSeasonCard parishId={data.parish.id} />}

        {data?.parish && <GetInvolvedCard parishId={data.parish.id} />}

        {data?.parish && <PrayerConcernCard parishId={data.parish.id} />}

        {/* Footer — quiet links */}
        <div className="flex flex-col items-center gap-2 mt-8">
          <Link href="/bcp">
            <span style={{ color: SAGE, fontSize: 13, fontFamily: SPACE_GROTESK, cursor: "pointer" }}>
              {t("parish.browse_bcp")}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Parish season card (member side) — "pray with your priest" ─────────────
// When the priest is running a season, the parishioner sees the shared Day-N
// clock + how many are praying, and taps in to the /season/:token player (which
// takes up the rhythm on first open + carries the priest's notes).
function ParishSeasonCard({ parishId }: { parishId: number }) {
  const q = useQuery<{ season: { token: string; title: string; day: number; durationDays: number; memberCount: number; joined: boolean } | null }>({
    queryKey: ["/api/parish/season", parishId],
    queryFn: () => apiRequest("GET", `/api/parish/season?parishId=${parishId}`),
  });
  const s = q.data?.season ?? null;
  if (!s) return null;
  return (
    <Link href={`/season/${s.token}`}>
      <div style={{ marginTop: 20, background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.30)", borderRadius: 16, padding: 16, cursor: "pointer" }}>
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: SAGE, margin: 0, fontWeight: 600 }}>
          🕊️ Pray with your parish
        </p>
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 700, color: WARM_TEXT, margin: "6px 0 0" }}>{s.title}</p>
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 12.5, color: SAGE, margin: "4px 0 0" }}>
          Day {s.day} of {s.durationDays} · {s.memberCount} {s.memberCount === 1 ? "person" : "people"} praying
        </p>
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, color: WARM_TEXT, margin: "10px 0 0" }}>
          {s.joined ? "Continue the season →" : "Take up the rhythm →"}
        </p>
      </div>
    </Link>
  );
}

// ─── "Ways to get involved" board (member side) ─────────────────────────────
// The priest publishes opportunities (worship roles, service ministries,
// community groups); the parishioner taps "I'm interested", which notifies the
// admins. Renders nothing when the parish hasn't published any.
type Opportunity = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  scheduleNote: string | null;
  contact: string | null;
  interestCount: number;
  viewerInterested: boolean;
};
const OPP_CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  worship: { label: "Worship & liturgy", emoji: "🕊️" },
  serve: { label: "Serve", emoji: "🤝" },
  community: { label: "Community", emoji: "👥" },
  other: { label: "Other ways", emoji: "✨" },
};
const OPP_CATEGORY_ORDER = ["worship", "serve", "community", "other"] as const;

function GetInvolvedCard({ parishId }: { parishId: number }) {
  const oppsQuery = useQuery<{ isAdmin: boolean; opportunities: Opportunity[] }>({
    queryKey: ["/api/parish/opportunities", parishId],
    queryFn: () => apiRequest("GET", `/api/parish/opportunities?parishId=${parishId}`),
  });
  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) =>
      apiRequest(
        on ? "POST" : "DELETE",
        `/api/parish/opportunities/${id}/interest`,
        on ? {} : undefined,
      ),
    onSuccess: () => { void oppsQuery.refetch(); },
  });

  const opps = oppsQuery.data?.opportunities ?? [];
  if (opps.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <p style={{ fontFamily: SPACE_GROTESK, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: SAGE, margin: "0 0 12px", fontWeight: 600 }}>
        Ways to get involved
      </p>
      {OPP_CATEGORY_ORDER.map((cat) => {
        const items = opps.filter((o) => o.category === cat);
        if (items.length === 0) return null;
        const meta = OPP_CATEGORY_META[cat] ?? OPP_CATEGORY_META.other;
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <p style={{ fontFamily: SPACE_GROTESK, fontSize: 13, color: WARM_TEXT, margin: "0 0 8px", fontWeight: 600 }}>
              {meta.emoji} {meta.label}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((o) => (
                <div key={o.id} style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <p style={{ fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, color: WARM_TEXT, margin: 0 }}>{o.title}</p>
                    {o.scheduleNote && <span style={{ fontFamily: SPACE_GROTESK, fontSize: 11, color: SAGE, whiteSpace: "nowrap" }}>{o.scheduleNote}</span>}
                  </div>
                  {o.description && <p style={{ fontFamily: SPACE_GROTESK, fontSize: 13, color: "rgba(200,212,192,0.85)", margin: "6px 0 0", lineHeight: 1.5 }}>{o.description}</p>}
                  {o.contact && <p style={{ fontFamily: SPACE_GROTESK, fontSize: 12, color: SAGE, margin: "6px 0 0" }}>{o.contact}</p>}
                  <div style={{ marginTop: 10 }}>
                    <button
                      onClick={() => toggle.mutate({ id: o.id, on: !o.viewerInterested })}
                      disabled={toggle.isPending}
                      style={{
                        fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600,
                        borderRadius: 999, padding: "7px 16px", cursor: "pointer",
                        background: o.viewerInterested ? "rgba(46,107,64,0.85)" : "transparent",
                        color: o.viewerInterested ? "#F0EDE6" : SAGE,
                        border: `1px solid ${o.viewerInterested ? "rgba(126,210,140,0.5)" : "rgba(143,175,150,0.35)"}`,
                      }}
                    >
                      {o.viewerInterested ? "✓ You're interested" : "I'm interested"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Inline composer for a private pastoral concern. The submission goes
// only to the parish admin — the body of the form makes that explicit
// so a parishioner doesn't worry the whole congregation is reading
// what they share. Empty / loading / submitted states all render in
// place to avoid a navigation away from the dashboard.
function PrayerConcernCard({ parishId }: { parishId: number }) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/parish/concerns", { parishId, body: body.trim() }),
    onSuccess: () => {
      setDone(true);
      setBody("");
    },
  });

  if (done) {
    return (
      <div
        style={{
          background: "rgba(46,107,64,0.10)",
          border: "1px solid rgba(46,107,64,0.25)",
          borderRadius: 16,
          padding: "16px",
          marginTop: 16,
          textAlign: "center",
        }}
      >
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 14, color: WARM_TEXT, margin: 0 }}>
          🌿 {t("parish.shared_with_admin")}
        </p>
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 12, color: SAGE, margin: "6px 0 0" }}>
          {t("parish.holding_this")}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 16,
          background: "rgba(46,107,64,0.10)",
          border: "1px solid rgba(46,107,64,0.25)",
          borderRadius: 16,
          padding: "16px",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: SPACE_GROTESK,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: WARM_TEXT, margin: 0 }}>
          🤲 {t("parish.share_heart")}
        </p>
        <p style={{ fontSize: 12, color: SAGE, margin: "4px 0 0" }}>
          {t("parish.private_to_admin")}
        </p>
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 16,
        background: "rgba(143,175,150,0.10)",
        border: "1px solid rgba(46,107,64,0.3)",
        borderRadius: 16,
        padding: "16px",
      }}
    >
      <p
        style={{
          fontFamily: SPACE_GROTESK,
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(143,175,150,0.7)",
          margin: 0,
          marginBottom: 8,
        }}
      >
        {t("parish.private_eyebrow")}
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={t("parish.whats_on_heart")}
        style={{
          width: "100%",
          background: "transparent",
          color: WARM_TEXT,
          fontFamily: SPACE_GROTESK,
          fontSize: 14,
          lineHeight: 1.5,
          border: "none",
          outline: "none",
          resize: "none",
          padding: 0,
        }}
      />
      {submit.isError && (
        <p style={{ fontSize: 12, color: "#F87171", fontFamily: SPACE_GROTESK, margin: "6px 0 0" }}>
          {t("parish.couldnt_send")}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={() => { setOpen(false); setBody(""); }}
          disabled={submit.isPending}
          style={{
            background: "rgba(143,175,150,0.12)",
            color: SAGE,
            border: "none",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 13,
            fontFamily: SPACE_GROTESK,
            cursor: "pointer",
          }}
        >
          {t("common.cancel")}
        </button>
        <button
          onClick={() => submit.mutate()}
          disabled={!body.trim() || submit.isPending}
          style={{
            background: "#2D5E3F",
            color: WARM_TEXT,
            border: "none",
            borderRadius: 999,
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: SPACE_GROTESK,
            cursor: "pointer",
            opacity: !body.trim() || submit.isPending ? 0.4 : 1,
          }}
        >
          {submit.isPending ? t("parish.sharing") : t("parish.share_with_admin")}
        </button>
      </div>
    </div>
  );
}

function OfficeButton({
  label,
  sub,
  href,
  primary,
}: {
  label: string;
  sub: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        style={{
          background: primary ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.10)",
          border: `1px solid ${primary ? "rgba(46,107,64,0.45)" : "rgba(46,107,64,0.25)"}`,
          borderRadius: 16,
          padding: "16px 14px",
          cursor: "pointer",
          textAlign: "center",
          minHeight: 88,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <p
          style={{
            fontFamily: SPACE_GROTESK,
            fontSize: 15,
            fontWeight: 600,
            color: WARM_TEXT,
            margin: 0,
          }}
        >
          {label}
        </p>
        <p style={{ color: SAGE, fontSize: 11, margin: 0 }}>{sub}</p>
      </div>
    </Link>
  );
}
