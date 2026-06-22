import { useEffect, useState, type ReactNode } from "react";
import { CobreatheGlobe } from "@/components/CobreatheGlobe";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { primeAudio } from "@/lib/amenFeedback";

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
  // One stable leaf backdrop for the welcome chooser, matching the app.
  const [bgPhoto] = useState<string | null>(() => LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null);

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
        isolation: "isolate",
        fontFamily: SPACE_GROTESK,
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {bgPhoto && (
        <>
          <img src={bgPhoto} alt="" aria-hidden style={{ position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.42, zIndex: -1 }} />
          <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,18,12,0.5) 0%, rgba(8,18,12,0.64) 45%, rgba(8,18,12,0.82) 100%)" }} />
        </>
      )}
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
          <div className="text-5xl mb-3" aria-hidden>📮</div>
          <h1
            className="text-[28px] font-bold leading-tight mb-2"
            style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}
          >
            {t("welcome_public.title")}
          </h1>
          {/* Auto-fit so the (long, ~61-char) tagline stays on ONE line across
              phone widths. No `nowrap`: a longer translation (e.g. Spanish) then
              wraps gracefully instead of clipping/overflowing. */}
          <p className="leading-relaxed" style={{ color: SAGE, fontSize: "clamp(9px, 2.6vw, 12px)" }}>
            {t("welcome_public.tagline", { defaultValue: "A relational app that cultivates connections between Sundays." })}
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

          {/* Card 1b — Cobreathe: anyone can try the shared breath without an
              account, the way the climate feed used to be reachable here. Lands
              on the intro screen first (the "before you begin" why + Start
              Breathing) rather than dropping straight into the breath. */}
          <ChoiceCard
            href="/cobreathe"
            emoji={<CobreatheGlobe size={28} />}
            title={t("welcome_public.cobreathe_title", { defaultValue: "Co-Breathe" })}
            blurb={t("welcome_public.cobreathe_blurb", { defaultValue: "12 breaths as a prayer for climate justice." })}
            delay={0.09}
            onClick={() => primeAudio()}
          />

          {/* Card 2 — sign up / sign in (the same form does both) */}
          <ChoiceCard
            href="/signin?mode=signup"
            emoji="🔑"
            title={t("welcome_public.sign_up_in", { defaultValue: "Sign up / Sign in" })}
            blurb={t("welcome_public.sign_up_in_blurb", { defaultValue: "Create an account, or sign in." })}
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
          {/* Card 3 — learn about Phoebe → the church deck slideshow */}
          <ChoiceCard
            href="/church-deck"
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
  onClick,
}: {
  href: string;
  emoji: ReactNode;
  title: string;
  blurb: string;
  delay: number;
  primary?: boolean;
  muted?: boolean;
  /** Fires on tap, before navigation (e.g. to prime audio for the breath). */
  onClick?: () => void;
}) {
  // All cards read as the same frosted glass — no highlighted/primary card.
  void primary; void muted;
  const bg = "rgba(9,26,16, 0.297)";
  const border = "1px solid rgba(46,107,64,0.25)";
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
        style={{ color: FAINT }}
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
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls} style={{ background: bg, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border }}>
          {inner}
        </a>
      ) : (
        <Link href={href} onClick={onClick} className={cls} style={{ background: bg, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border }}>
          {inner}
        </Link>
      )}
    </motion.div>
  );
}

// Re-export the time-of-day helper so any other page can share the
// same morning/evening signal.
export { isMorningNow };
