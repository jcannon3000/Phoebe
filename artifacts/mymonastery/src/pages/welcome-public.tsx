import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";

// ── First-open chooser ───────────────────────────────────────────────────────
//
// What a visitor sees when they open the iOS app for the first time
// (or hit withphoebe.app while signed out):
//
//   1. The time-appropriate office  → /pray?start=office
//      Morning before 14:00, Evening after. Drops them straight into
//      the BCP liturgy via PublicPrayerPage; at the close they're
//      invited to sign up.
//   2. Sign in / sign up            → /signin
//      For visitors who already have an account, or want to skip the
//      try-before-buy path and go straight to the full app.
//
// Then, below a hairline divider: "Learn about Phoebe" (the features
// deck) and — on web only — a "Download on the App Store" link.
//
// Signed-in users skip this entirely and land on /dashboard.
const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const BRIGHT_SAGE = "#6FAF85";
const FAINT = "rgba(143,175,150,0.55)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

// Apple App Store listing (same URL the install prompts use).
const APP_STORE_URL = "https://apps.apple.com/us/app/phoebe-prayer-together/id6763552921";

// Same 14:00 cutoff the Office / Devotion pickers use elsewhere so a
// visitor's idea of "morning" matches what the BCP variants resolve to.
function isMorningNow(): boolean {
  return new Date().getHours() < 14;
}

export default function WelcomePublicPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  // Already-signed-in visitor goes straight to the dashboard. Same
  // pattern as the Onboarding page so a returning user with a valid
  // cookie doesn't see the chooser flash before the redirect.
  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  // Don't paint the chooser while we're still resolving the auth
  // state — avoids a brief flash before the redirect above fires.
  if (isLoading || user) return null;

  const morning = isMorningNow();
  const officeLabel = morning ? t("offices.morning_prayer") : t("offices.evening_prayer");
  const officeEmoji = morning ? "🌅" : "🌙";
  const officeBlurb = morning
    ? t("welcome_public.office_blurb_morning")
    : t("welcome_public.office_blurb_evening");

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: BG,
        fontFamily: SPACE_GROTESK,
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <header className="px-6 pt-6 pb-4 flex items-center justify-between">
        <span
          className="text-2xl font-bold"
          style={{ color: WARM_TEXT, letterSpacing: "-0.03em" }}
        >
          Phoebe
        </span>
        <Link href="/signin" className="text-sm font-medium" style={{ color: SAGE }}>
          {t("welcome_public.sign_in")}
        </Link>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-5 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="pt-6 mb-8 text-center"
        >
          <h1
            className="text-[28px] font-bold leading-tight mb-2"
            style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}
          >
            {t("welcome_public.title")}
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
            {t("welcome_public.subtitle")}
          </p>
        </motion.div>

        <div className="flex flex-col gap-3">
          {/* Card 1 — the time-appropriate office */}
          <ChoiceCard
            href="/pray?start=office"
            emoji={officeEmoji}
            title={officeLabel}
            blurb={officeBlurb}
            delay={0.05}
            primary
          />

          {/* Card 2 — sign in (or sign up via the same form) */}
          <ChoiceCard
            href="/signin"
            emoji="🔑"
            title={t("welcome_public.sign_in")}
            blurb={t("welcome_public.sign_in_blurb")}
            delay={0.12}
            muted
          />
        </div>

        {/* Separated group — about Phoebe + get the app. A hairline divider
            sets these apart from the options above. */}
        <div
          className="mt-6 pt-6 flex flex-col gap-3"
          style={{ borderTop: "1px solid rgba(200,212,192,0.12)" }}
        >
          {/* Card 3 — learn about Phoebe (the features deck) */}
          <ChoiceCard
            href="/learn/features"
            emoji="✨"
            title={t("welcome_public.learn_title")}
            blurb={t("welcome_public.learn_blurb")}
            delay={0.19}
            muted
          />

          {/* Card 4 — download on the App Store. Web only: telling someone
              already inside the native app to "download the app" makes no
              sense, mirroring the install-banner gating elsewhere. */}
          {!isNativeShell() && (
            <ChoiceCard
              href={APP_STORE_URL}
              emoji="📲"
              title={t("welcome_public.appstore_title")}
              blurb={t("welcome_public.appstore_blurb")}
              delay={0.26}
              muted
            />
          )}
        </div>

        <p
          className="text-[12px] text-center mt-8"
          style={{ color: FAINT }}
        >
          {t("welcome_public.footer")}
        </p>
      </main>
    </div>
  );
}

function ChoiceCard({
  href,
  emoji,
  title,
  blurb,
  delay,
  primary,
  muted,
}: {
  href: string;
  emoji: string;
  title: string;
  blurb: string;
  delay: number;
  primary?: boolean;
  muted?: boolean;
}) {
  const bg = primary
    ? "rgba(46,107,64,0.18)"
    : muted
      ? "rgba(200,212,192,0.04)"
      : "rgba(46,107,64,0.10)";
  const border = primary
    ? "1px solid rgba(46,107,64,0.45)"
    : muted
      ? "1px solid rgba(200,212,192,0.15)"
      : "1px solid rgba(46,107,64,0.25)";
  // External links (e.g. the App Store) open in a new tab via a real anchor;
  // internal routes use wouter's client-side Link.
  const isExternal = /^https?:\/\//.test(href);
  const cls = "block rounded-2xl px-5 py-5 transition-opacity hover:opacity-95 active:scale-[0.99]";
  const inner = (
    <div className="flex items-start gap-3">
      <span className="text-[28px] flex-shrink-0 leading-none mt-0.5" aria-hidden="true">
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-[16px] font-semibold leading-snug mb-1"
          style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK }}
        >
          {title}
        </p>
        <p className="text-[13px] leading-snug" style={{ color: SAGE }}>
          {blurb}
        </p>
      </div>
      <span
        className="text-lg flex-shrink-0"
        style={{ color: primary ? BRIGHT_SAGE : FAINT }}
        aria-hidden="true"
      >
        →
      </span>
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      {isExternal ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={{ background: bg, border }}>
          {inner}
        </a>
      ) : (
        <Link href={href} className={cls} style={{ background: bg, border }}>
          {inner}
        </Link>
      )}
    </motion.div>
  );
}

// Re-export the time-of-day helper so any other page can share the
// same morning/evening signal.
export { isMorningNow };
