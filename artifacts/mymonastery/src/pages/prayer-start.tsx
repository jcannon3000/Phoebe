import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { isOnline } from "@/lib/offline";

// ── Prayer chooser ──────────────────────────────────────────────────────────
//
// Lands here when the user taps the home-screen prayer-list CTA
// ("Begin prayer" / "Pray again" / "Start prayer"). Defaults to the
// short Daily Devotion for the time of day — the gentlest entry point
// — and surfaces the heavier paths (full Office, intercessions-only)
// as quiet links underneath.
//
// Time-of-day default: under noon → morning, at-or-after noon → early
// evening. Mirrors the same threshold the Daily Office and Devotion
// pickers use to highlight their "now" card.

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

interface DevotionContext {
  // Time of day decides morning vs evening copy + routes. The title and
  // full-office label are resolved via t() in the component (this helper
  // can't use the hook), keyed off this flag.
  isMorning: boolean;
  // The route the primary "Begin" button navigates to.
  href: string;
  // The route the "Pray full office" link navigates to — same time-
  // of-day, just the unabbreviated form.
  fullOfficeHref: string;
}

function buildDevotionContext(): DevotionContext {
  const isMorning = new Date().getHours() < 12;
  return isMorning
    ? {
        isMorning: true,
        href: "/bcp/daily-devotions?mode=morning-devotion",
        fullOfficeHref: "/bcp/daily-office?mode=morning",
      }
    : {
        isMorning: false,
        href: "/bcp/daily-devotions?mode=early-evening-devotion",
        fullOfficeHref: "/bcp/daily-office?mode=evening",
      };
}

export default function PrayerStartPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const officesOnly = user?.accessTier === "offices-only";

  // Offices-only users have no /prayer-mode default queue (it 403s
  // on the four daily queries and loading-screens), so we route the
  // "Skip to …" link to their first subscribed feed's slideshow
  // (?queue=feed&slug=…). Hidden entirely if they're not subscribed
  // to a feed yet — surfacing a link to nothing isn't helpful.
  type SubscribedFeed = { feed: { slug: string; title: string } };
  const subscribedFeedsQuery = useQuery<{ subscriptions: SubscribedFeed[] }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    enabled: !!user && officesOnly,
    staleTime: 60_000,
  });
  const firstFeedSlug = subscribedFeedsQuery.data?.subscriptions?.[0]?.feed.slug ?? null;

  useEffect(() => {
    /**
     * OFFLINE IS NOT SIGNED OUT (owner, 2026-09-06: "Morning Prayer is not
     * loading offline at all — it would load before").
     *
     * /api/auth/me cannot be answered without a connection, so the query
     * resolves to null and this gate read that as "no account" and sent the
     * person home — every saved office, psalm and prayer became unreachable
     * the moment they lost signal, which is the opposite of what the offline
     * layer is for. A failed ask is not an answer: while offline, stay put and
     * let the page paint from what is saved.
     */
    if (isOnline() && !isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  /**
   * OFFLINE STILL RENDERS (owner, 2026-09-06: "there is no reason why those
   * should not at least have the BCP content"). The prayer book is bundled
   * with the app and the day's deck is saved ahead, so a page that cannot ask
   * /auth/me must still paint — blanking it made every office, psalm and
   * collect a white screen the moment the signal dropped.
   */
  if (isOnline() && (isLoading || !user)) return null;

  const ctx = buildDevotionContext();
  const title = ctx.isMorning ? t("prayer_start.morning_devotion") : t("prayer_start.evening_devotion");
  const fullOfficeLabel = ctx.isMorning ? t("prayer_start.full_morning_prayer") : t("prayer_start.full_evening_prayer");
  // What the "Skip …" link reads + where it goes, per tier.
  const skipLink: { label: string; href: string } | null = officesOnly
    ? (firstFeedSlug
        ? { label: t("prayer_start.skip_feed"), href: `/prayer-mode?queue=feed&slug=${encodeURIComponent(firstFeedSlug)}` }
        : null)
    : { label: t("prayer_start.skip_community"), href: "/prayer-mode" };

  return (
    <Layout>
      <div
        className="flex flex-col items-center w-full max-w-xl mx-auto"
        style={{
          minHeight: "calc(100vh - 80px)",
          paddingTop: "clamp(48px, 12vh, 120px)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
          gap: 24,
        }}
      >
        {/* Title block — what we're about to pray, with the BCP
            attribution as a quiet subtitle. */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="text-center"
          style={{ padding: "0 24px" }}
        >
          <h1
            style={{
              color: WARM_TEXT,
              fontFamily: SPACE_GROTESK,
              fontSize: "clamp(32px, 7vw, 44px)",
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              color: SAGE,
              fontFamily: GEORGIA,
              fontStyle: "italic",
              fontSize: "clamp(13px, 2.6vw, 15px)",
              marginTop: 10,
              marginBottom: 0,
            }}
          >
            {t("prayer_start.from_bcp")}
          </p>
        </motion.div>

        {/* Primary action — begin the devotion. Big, warm, the only
            CTA above the fold. */}
        <motion.button
          type="button"
          onClick={() => setLocation(ctx.href)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          whileTap={{ scale: 0.98 }}
          style={{
            background: "rgba(46,107,64,0.22)",
            border: "1px solid rgba(46,107,64,0.5)",
            color: WARM_TEXT,
            fontFamily: SPACE_GROTESK,
            borderRadius: 999,
            padding: "20px 36px",
            cursor: "pointer",
            fontSize: "clamp(17px, 3.5vw, 20px)",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
            marginTop: 8,
          }}
        >
          {t("prayer_start.begin")}
        </motion.button>

        {/* Spacer pushes the secondary actions toward the bottom of
            the screen. */}
        <div style={{ flex: 1, minHeight: 24 }} />

        {/* Secondary actions — the two heavier paths, available but
            visually quieter so they don't compete with the primary
            "Begin" button. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="w-full flex flex-col items-center"
          style={{ gap: 14, padding: "0 20px" }}
        >
          {skipLink && (
            <button
              type="button"
              onClick={() => setLocation(skipLink.href)}
              style={{
                background: "none",
                border: "none",
                color: SAGE,
                fontFamily: SPACE_GROTESK,
                fontSize: 14,
                cursor: "pointer",
                padding: 6,
                textDecoration: "underline",
                textDecorationColor: "rgba(143,175,150,0.35)",
                textUnderlineOffset: 4,
              }}
            >
              {skipLink.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => setLocation(ctx.fullOfficeHref)}
            style={{
              background: "none",
              border: "none",
              color: SAGE,
              fontFamily: SPACE_GROTESK,
              fontSize: 14,
              cursor: "pointer",
              padding: 6,
              textDecoration: "underline",
              textDecorationColor: "rgba(143,175,150,0.35)",
              textUnderlineOffset: 4,
            }}
          >
            {fullOfficeLabel} →
          </button>
        </motion.div>

        <motion.button
          type="button"
          onClick={() => setLocation("/dashboard")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{
            background: "none",
            border: "none",
            color: "rgba(143,175,150,0.6)",
            fontFamily: SPACE_GROTESK,
            fontSize: 13,
            cursor: "pointer",
            padding: 8,
            marginTop: 8,
          }}
        >
          ← {t("common.back")}
        </motion.button>
      </div>
      <style>{`body { background: ${BG}; }`}</style>
    </Layout>
  );
}
