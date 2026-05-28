import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { playOpeningSwell } from "@/lib/amenFeedback";
import { readOfficeProgress, type LiturgyMode } from "@/pages/bcp-daily-office";

// Remembers which depth the user prayed last so the chooser can float
// it to the top on the next visit. Plain localStorage — a soft UX hint,
// not state worth syncing to the server. The value is one of the card
// keys below ("intercessions" | "feed" | "devotion" | "office" |
// "ncmp" | "examen").
const LAST_CHOICE_KEY = "phoebe:last-prayer-choice";
function readLastPrayerChoice(): string | null {
  try { return localStorage.getItem(LAST_CHOICE_KEY); } catch { return null; }
}
function recordPrayerChoice(key: string): void {
  try { localStorage.setItem(LAST_CHOICE_KEY, key); } catch { /* ignore */ }
}

// ── Prayer chooser ──────────────────────────────────────────────────────────
// Replaces the dashboard's inline modal popup. The home-screen CTA links
// here; this page presents three depth options for today's prayer:
//
//   • Community Intercessions — the slideshow walk through your parish
//                               group's prayer requests + intercessions.
//   • Daily Devotion          — BCP short form, includes the prayer list.
//   • Daily Office            — BCP full Morning/Evening Prayer, includes
//                               the prayer list at the end.
//
// Time-of-day labels and links flip morning vs evening; the
// intercession slideshow is the same either way (it's the same
// underlying queue).
//
// On mount we play the opening swell — the same audio cue the prayer-
// mode slideshow uses on entry. The user explicitly asked for a sound
// effect to mark crossing into prayer; this is the same chord the
// rest of the app uses for that moment.

const FONT = "'Space Grotesk', sans-serif";

export default function PrayerChooserPage() {
  const [, setLocation] = useLocation();
  // The Examen is pilot-only — same gate as the menu entry + the
  // habit-slide pill.
  const { isBeta } = useBetaStatus();
  // Offices-only accounts have no communities, no personal prayer
  // requests, no garden. The first chooser option ("Community
  // Intercessions" → /prayer-mode) makes no sense for them — the
  // page would fetch /api/moments + /api/prayer-requests +
  // /api/prayers-for, all of which 403, and the slideshow's
  // dataReady gate would hang on a loading screen forever. Instead
  // we surface their subscribed prayer feed as the first option and
  // route directly to the feed walk (?queue=feed&slug=…), the same
  // path the dashboard FeedPrayerCard's "Pray again" CTA uses.
  const { user } = useAuth();
  const officesOnly = user?.accessTier === "offices-only";

  // Fetch subscribed feeds for offices-only users so we can route the
  // first option to /prayer-mode?queue=feed&slug={firstFeed.slug}.
  type SubscribedFeed = { feed: { id: number; slug: string; title: string; coverEmoji: string | null } };
  const subscribedFeedsQuery = useQuery<{ subscriptions: SubscribedFeed[] }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    enabled: !!user && officesOnly,
    staleTime: 60_000,
  });
  const firstFeed = subscribedFeedsQuery.data?.subscriptions?.[0]?.feed ?? null;

  // Time-of-day split — same threshold the dashboard card uses (noon).
  const hour = new Date().getHours();
  const isMorning = hour < 12;
  const eyebrow = isMorning ? "🌅 This morning" : "🌙 This evening";
  const headline = isMorning ? "Start this morning's prayer" : "Start this evening's prayer";

  const devotionLabel = isMorning ? "Morning Devotion" : "Evening Devotion";
  const officeLabel = isMorning ? "Morning Office" : "Evening Office";
  const devotionMode: LiturgyMode = isMorning ? "morning-devotion" : "early-evening-devotion";
  const officeMode: LiturgyMode = isMorning ? "morning" : "evening";

  // Office prefs power the streak chip in the corner — pulled from the
  // same endpoint the dashboard card uses, cached for 60s so a
  // back-and-forth from this page doesn't refetch.
  const { data: officePrefs } = useQuery<{ officeStreak: number }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
  });
  const officeStreak = officePrefs?.officeStreak ?? 0;

  // National Cathedral Morning Prayer — surfaced as a 4th option on
  // the morning chooser, weekdays only (the broadcast is Mon-Fri at
  // 7 AM ET). /api/ncmp/today-meta fetches the YouTube playlist RSS
  // + scrapes today's video length so the card can show the actual
  // duration ("≈ 13 min") rather than a static estimate.
  //
  // Gated on isMorning so the request only fires when the option is
  // about to render. Weekends: still fires (cheap, server caches),
  // but the card itself is hidden — saves us guarding the query in
  // two places.
  type NcmpMeta = {
    url: string;
    videoId: string | null;
    title: string | null;
    publishedAt: string | null;
    durationSeconds: number | null;
  };
  const { data: ncmpMeta } = useQuery<NcmpMeta>({
    queryKey: ["/api/ncmp/today-meta"],
    queryFn: () => apiRequest("GET", "/api/ncmp/today-meta"),
    enabled: isMorning,
    staleTime: 60 * 60_000, // server already caches by day; this just dedupes within session
  });
  // Hide on weekends — no fresh broadcast Sat/Sun.
  const isWeekday = (() => {
    const d = new Date().getDay();
    return d >= 1 && d <= 5;
  })();
  const showNcmpOption = isMorning && isWeekday;
  // Static time-of-day badge — the user wanted broadcast time, not
  // length, here. Keeps the meta query running so the URL + duration
  // are still fetched (the durationSeconds is what the prayer-session
  // log uses on tap), but the chip itself just names the broadcast
  // schedule. "7 AM ET" matches the concise style of the other
  // chooser badges ("5–10 Min", "15–20 Min").
  const ncmpDurationLabel = "7 AM ET";

  // "A Morning at the Office" — Forward Movement's daily Episcopal
  // Morning Prayer podcast. Shown every morning (it publishes 7 days a
  // week, unlike the weekday-only cathedral broadcast). We fetch today's
  // episode meta to label the card with its real length; the in-app
  // player at /podcast/morning-office does the actual playback + session
  // log. Gated on isMorning so the request only fires when the card
  // will render.
  type PodcastMeta = {
    feedTitle: string | null;
    title: string | null;
    audioUrl: string | null;
    durationSeconds: number | null;
  };
  const { data: podcastMeta } = useQuery<PodcastMeta>({
    queryKey: ["/api/podcast/morning-office/today"],
    queryFn: () => apiRequest("GET", "/api/podcast/morning-office/today"),
    enabled: isMorning,
    staleTime: 30 * 60_000,
  });
  const showPodcastOption = isMorning;
  const podcastDurationLabel = (() => {
    const s = podcastMeta?.durationSeconds ?? null;
    if (!s || s <= 0) return "🎧 Audio";
    const mins = Math.round(s / 60);
    return `≈ ${mins} min`;
  })();

  // Per-mode progress: drives the verb in the corner pill (Start /
  // Continue / Pray again) and the ?reset=1 suffix on the link.
  const devotionState = readOfficeProgress(devotionMode);
  const officeStateLocal = readOfficeProgress(officeMode);
  const verbFor = (state: { kind: string }) =>
    state.kind === "done" ? "Pray again" : state.kind === "in-progress" ? "Continue" : "Start";

  // Play the opening swell on mount. Fire-and-forget — the audio
  // helper handles autoplay-policy unlock and visibility-resume.
  // We let it fail silently on browsers that block audio until a
  // user gesture (the user did just tap a button to get here, so
  // it should normally unlock).
  useEffect(() => {
    try {
      playOpeningSwell();
    } catch {
      /* non-fatal */
    }
  }, []);

  // Unified card model so every option — including the National
  // Cathedral broadcast — flows through one ordering + render path.
  // `key` is the stable id used to remember "last prayed"; `variant`
  // picks the palette (purple for the cathedral broadcast, gold for the
  // Morning at the Office podcast, green for the BCP / community
  // options).
  type ChooserCard = {
    key: string;
    variant: "green" | "purple" | "gold";
    title: string;
    sub: string;
    badge: string;
    verb: string;
    href: string;
  };

  // First card swaps shape by tier:
  //   • Full / parish-only / beta: "Community Intercessions" — the
  //     daily walk through the viewer's requests + intercessions.
  //   • Offices-only: "Prayer feed" — their subscribed feed's
  //     intercessions, routed straight to /prayer-mode?queue=feed
  //     so it doesn't hit any of the blocked-prefix endpoints.
  //     Hidden entirely when the user has no subscription yet.
  const firstCard: ChooserCard | null = officesOnly
    ? (firstFeed
        ? {
            key: "feed",
            variant: "green",
            title: "Prayer feed",
            sub: `Today's intercessions from ${firstFeed.coverEmoji ?? "🌿"} ${firstFeed.title}`,
            badge: "< 5 Min",
            verb: "Start",
            href: `/prayer-mode?queue=feed&slug=${encodeURIComponent(firstFeed.slug)}`,
          }
        : null)
    : {
        key: "intercessions",
        variant: "green",
        title: "Community Intercessions",
        sub: "Your prayer list, no liturgy",
        badge: "< 5 Min",
        verb: "Start",
        href: "/prayer-mode",
      };

  const cards: ChooserCard[] = [
    // National Cathedral Morning Prayer — weekday mornings only. Opens
    // the in-app /ncmp/watch embed (logs the prayer session on mount).
    ...(showNcmpOption ? [{
      key: "ncmp",
      variant: "purple" as const,
      title: "National Cathedral Morning Prayer",
      sub: "Live weekdays at 7 AM Eastern · Washington National Cathedral",
      badge: ncmpDurationLabel,
      verb: "Watch",
      href: "/ncmp/watch",
    }] : []),
    // "A Morning at the Office" podcast — every morning (publishes 7
    // days a week). Opens the in-app audio player at
    // /podcast/morning-office, which logs the prayer session.
    ...(showPodcastOption ? [{
      key: "podcast",
      variant: "gold" as const,
      title: "A Morning at the Office",
      sub: "Daily Episcopal Morning Prayer, read aloud · Forward Movement",
      badge: podcastDurationLabel,
      verb: "Listen",
      href: "/podcast/morning-office",
    }] : []),
    ...(firstCard ? [firstCard] : []),
    {
      key: "devotion",
      variant: "green",
      title: devotionLabel,
      sub: "From the Book of Common Prayer",
      badge: "5–10 Min",
      verb: verbFor(devotionState),
      // picked=1 — the user is choosing the devotion from this chooser,
      // so the viewer's first slide drops its alternate-route pills.
      href: `/bcp/daily-devotions?mode=${encodeURIComponent(devotionMode)}&picked=1${devotionState.kind === "done" ? "&reset=1" : ""}`,
    },
    {
      key: "office",
      variant: "green",
      title: officeLabel,
      sub: "From the Book of Common Prayer",
      badge: "15–20 Min",
      verb: verbFor(officeStateLocal),
      href: `/bcp/daily-office?mode=${encodeURIComponent(officeMode)}${officeStateLocal.kind === "done" ? "&reset=1" : ""}`,
    },
    // Ignatian Examen — the contemplative close to the day. Only after
    // 5pm (it's an end-of-day prayer) for pilot users.
    ...(hour >= 17 && isBeta ? [{
      key: "examen",
      variant: "green" as const,
      title: "Ignatian Examen",
      sub: "A reflective close to the day",
      badge: "5–10 Min",
      verb: "Start",
      href: "/examen",
    }] : []),
  ];

  // Float the last-prayed card to the top, then a visual gap, then the
  // rest in their natural order. If the user has never chosen (or the
  // remembered key isn't currently available — e.g. they last watched
  // the cathedral but it's now afternoon), nothing is pinned and the
  // list renders in its natural order with no divider.
  const lastChoice = readLastPrayerChoice();
  const pinnedCard = lastChoice ? (cards.find(c => c.key === lastChoice) ?? null) : null;
  const restCards = pinnedCard ? cards.filter(c => c.key !== pinnedCard.key) : cards;

  // Per-variant palette. Green = BCP/community, purple = National
  // Cathedral broadcast, gold = "A Morning at the Office" podcast.
  const palettes = {
    green: {
      cardBg: "rgba(46,107,64,0.14)", cardBorder: "rgba(46,107,64,0.35)",
      badgeBg: "rgba(46,107,64,0.2)", badgeColor: "rgba(143,175,150,0.9)", badgeBorder: "rgba(46,107,64,0.3)",
      sub: "rgba(143,175,150,0.85)",
      verbBg: "rgba(46,107,64,0.35)", verbColor: "#C8D4C0", verbBorder: "rgba(46,107,64,0.55)",
    },
    purple: {
      cardBg: "rgba(120,80,180,0.14)", cardBorder: "rgba(120,80,180,0.40)",
      badgeBg: "rgba(120,80,180,0.22)", badgeColor: "rgba(210,190,240,0.95)", badgeBorder: "rgba(120,80,180,0.42)",
      sub: "rgba(199,176,235,0.85)",
      verbBg: "rgba(120,80,180,0.32)", verbColor: "#E0D0F5", verbBorder: "rgba(120,80,180,0.55)",
    },
    gold: {
      cardBg: "rgba(212,160,70,0.13)", cardBorder: "rgba(212,160,70,0.38)",
      badgeBg: "rgba(212,160,70,0.20)", badgeColor: "rgba(240,213,150,0.95)", badgeBorder: "rgba(212,160,70,0.40)",
      sub: "rgba(226,200,150,0.85)",
      verbBg: "rgba(212,160,70,0.30)", verbColor: "#F0DCA8", verbBorder: "rgba(212,160,70,0.52)",
    },
  } as const;

  // One renderer for every palette. Whole card is the tap target; we
  // record the choice (so it floats up next time) then navigate.
  const renderCard = (card: ChooserCard, i: number) => {
    const p = palettes[card.variant];
    const activate = () => { recordPrayerChoice(card.key); setLocation(card.href); };
    return (
      <motion.div
        key={card.key}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.06 * (i + 1), ease: "easeOut" }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={activate}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } }}
          className="w-full rounded-2xl p-4 cursor-pointer transition-opacity hover:opacity-90"
          style={{ background: p.cardBg, border: `1px solid ${p.cardBorder}` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p
                  className="text-base font-semibold"
                  style={{ color: "#F0EDE6", fontFamily: FONT, margin: 0, lineHeight: 1.2 }}
                >
                  {card.title}
                </p>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{
                    background: p.badgeBg,
                    color: p.badgeColor,
                    border: `1px solid ${p.badgeBorder}`,
                    fontFamily: FONT,
                    whiteSpace: "nowrap",
                  }}
                >
                  {card.badge}
                </span>
              </div>
              <p
                className="text-[12px] mt-1"
                style={{ color: p.sub, margin: 0 }}
              >
                {card.sub}
              </p>
            </div>
            <span
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full shrink-0"
              style={{
                background: p.verbBg,
                color: p.verbColor,
                border: `1px solid ${p.verbBorder}`,
                fontFamily: FONT,
              }}
            >
              {card.verb} →
            </span>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0C1F12", color: "#F0EDE6", fontFamily: FONT }}
    >
      {/* Top bar — back to dashboard. Keeps the back affordance in the
          same place as every other Phoebe sub-screen. */}
      <header
        className="px-5 pb-2"
        style={{
          paddingTop: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))",
        }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="text-sm"
          style={{
            color: "rgba(143,175,150,0.8)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          ← Back
        </button>
      </header>

      {/* Mobile/native: content sits near the top (justify-start +
          a modest pt) so there isn't a yawning gap above the eyebrow.
          Wide web keeps the centered composition. */}
      <main className="flex-1 flex flex-col items-center justify-start md:justify-center px-5 pt-6 md:pt-0 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(143,175,150,0.55)", margin: 0 }}
            >
              {eyebrow}
            </p>
            {officeStreak > 0 && (
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full tabular-nums shrink-0"
                style={{
                  background: "rgba(168,197,160,0.12)",
                  color: "rgba(168,197,160,0.95)",
                  border: "1px solid rgba(168,197,160,0.3)",
                  fontFamily: FONT,
                }}
              >
                🔥 {officeStreak}
              </span>
            )}
          </div>

          <h1
            className="text-2xl font-semibold leading-tight mb-2"
            style={{ color: "#F0EDE6", fontFamily: FONT }}
          >
            {headline}
          </h1>
          <p
            className="text-sm mb-7"
            style={{ color: "#8FAF96", fontFamily: FONT }}
          >
            Choose how to pray with your community today.
          </p>

          <div className="space-y-3">
            {/* Last-prayed depth pinned on top, then a soft "Or"
                divider, then the rest. When nothing's pinned (first
                visit, or the remembered card isn't available right
                now) the divider is skipped and the list renders in
                its natural order. The National Cathedral broadcast
                floats up here too if it's what the user watched last. */}
            {pinnedCard && renderCard(pinnedCard, 0)}
            {pinnedCard && restCards.length > 0 && (
              <div className="flex items-center gap-3 py-1" aria-hidden>
                <div style={{ height: 1, flex: 1, background: "rgba(143,175,150,0.18)" }} />
                <span
                  className="text-[10px] uppercase tracking-widest"
                  style={{ color: "rgba(143,175,150,0.45)", fontFamily: FONT }}
                >
                  Or
                </span>
                <div style={{ height: 1, flex: 1, background: "rgba(143,175,150,0.18)" }} />
              </div>
            )}
            {restCards.map((card, i) => renderCard(card, pinnedCard ? i + 1 : i))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
