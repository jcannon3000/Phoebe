import { useEffect, useState, type ReactNode } from "react";
import { CobreatheGlobe } from "@/components/CobreatheGlobe";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";
import { isFirstOpen } from "@/lib/firstOpen";
import { seedGuestRule } from "@/lib/guestSeed";
import { ensureAnonymousUser } from "@/lib/guestProvision";
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
  //
  // PUBLIC no-login version: with the guest flag on, a signed-OUT visitor
  // skips this chooser entirely — the precoded rule is seeded on-device
  // (Morning/Evening Office + FDD + a 5-min silence goal) and they land
  // straight on the home, already going. No login anywhere.
  const qc = useQueryClient();
  // The PUBLIC app provisions an ANONYMOUS device user, so `user` is truthy for
  // anyone who's opened the app before. Only a REAL (signed-in) account matters
  // for the redirect; an anonymous/guest still gets the seeded public home.
  const isRealUser = !!user && !user.isAnonymous;
  useEffect(() => {
    // First launch of the guest build: no session is possible yet, so don't
    // wait out the /api/auth/me round-trip — seed and forward to the home
    // immediately. Anon provisioning + the real /me refetch run in the
    // background. (A real signed-in user can't exist on a first open.)
    const firstOpenGuest = PHOEBE_GUEST_ENABLED && isFirstOpen();
    if (isLoading && !firstOpenGuest) return;
    if (isRealUser) { setLocation("/dashboard"); return; }
    if (PHOEBE_GUEST_ENABLED) {
      // A brand-new WEB visitor sees the overview deck first, instead of
      // seeding + landing on home immediately — native has its own (retired)
      // first-open path and isn't part of this. Its persistent/closing
      // "Start praying" button runs the exact seed+land-on-home sequence
      // below itself (see overview-deck.tsx's ?intro=1 mode), so this is a
      // detour in front of the normal flow, not a second path to maintain.
      if (firstOpenGuest && !isNativeShell()) {
        setLocation("/overview-deck?intro=1", { replace: true });
        return;
      }
      seedGuestRule();
      // Silently provision the anonymous DEVICE user (no credentials, normal
      // session cookie) so push tokens + reminders + prefs sync work — the UX
      // stays login-free. Fire-and-forget; on success /me refetches.
      void ensureAnonymousUser().then((created) => {
        if (created) {
          /**
           * Invalidate EVERYTHING, not just /api/auth/me.
           *
           * Observed on a real first visit: the dashboard mounts the instant
           * this fires, so ~8 of its queries race the anonymous POST and come
           * back 401 — practice-week, office-history-week, yesterday-order,
           * prayer-days, office-prefs among them. The query client's `retry`
           * deliberately does NOT retry a 4xx (see App.tsx), and refetching
           * only /api/auth/me leaves the rest parked in an error state with no
           * data for the whole first session. The home still paints, from
           * local defaults, so it LOOKS right while the weekly grid, the office
           * history and the card ordering are all simply missing until the next
           * app open.
           *
           * Nothing worth keeping is cached this early — we have just this
           * moment acquired a session — so the blunt invalidation is the
           * correct one.
           */
          qc.invalidateQueries();
        }
      });
      // NO first-open welcome splash, NO first-open customizer (owner,
      // 2026-07-08 — reversed the brief /customize-first experiment): every
      // guest open seeds the rhythm and lands straight on the daily-progress
      // home, already going. The simple customizer is reached from the home's
      // "Shape your rhythm" / the menu instead.
      setLocation("/dashboard", { replace: true });
    }
  }, [isRealUser, isLoading, setLocation, qc]);

  // Don't paint while resolving auth, for REAL signed-in users, or for ANY guest
  // in the public app (they're being forwarded straight to the home). The
  // chooser body below only ever renders when the guest flag is OFF (the plain
  // signed-out web landing).
  if (isLoading || isRealUser || PHOEBE_GUEST_ENABLED) return null;

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
            {t("welcome_public.welcome_title", { defaultValue: "Welcome" })}
          </h1>
          {/* Auto-fit so the (long, ~61-char) tagline stays on ONE line across
              phone widths. No `nowrap`: a longer translation (e.g. Spanish) then
              wraps gracefully instead of clipping/overflowing. */}
          <p className="leading-relaxed" style={{ color: SAGE, fontSize: "clamp(9px, 2.6vw, 12px)" }}>
            {t("welcome_public.tagline_daily", { defaultValue: "A daily practice of prayer, held through the rhythm of your days." })}
          </p>
        </motion.div>

        {/* "Start here" — the first card is the way in (today's office). */}
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-2 px-1" style={{ color: "rgba(143,175,150,0.7)" }}>
          {t("welcome_public.start_here", { defaultValue: "Start here" })}
        </p>
        <div className="flex flex-col gap-3">
          {/* 1 — the time-appropriate office. Praying it as a guest ends in an
              invitation to sign up (PublicPrayerPage). */}
          <ChoiceCard
            href="/pray?start=office"
            emoji={officeEmoji}
            title={officeLabel}
            blurb={officeBlurb}
            delay={0.05}
            primary
          />

          {/* 2 — create a daily practice of prayer → the customizer. A guest
              builds it locally and is only asked to sign up at the END, to save
              it (see pilot-build.tsx). This is the other path into signing up. */}
          <ChoiceCard
            href="/pilot/build"
            emoji="🌿"
            title={t("welcome_public.create_practice_title", { defaultValue: "Create a daily practice of prayer" })}
            blurb={t("welcome_public.create_practice_blurb", { defaultValue: "Build your own rhythm — sign up at the end to keep it." })}
            delay={0.09}
          />

          {/* 3 — Co-Breathe: anyone can try the shared breath without an account. */}
          <ChoiceCard
            href="/cobreathe"
            emoji={<CobreatheGlobe size={28} />}
            title={t("welcome_public.cobreathe_title", { defaultValue: "Creation Prayer" })}
            blurb={t("welcome_public.cobreathe_blurb", { defaultValue: "Breathing together with God's creation" })}
            delay={0.13}
            onClick={() => primeAudio()}
          />
        </div>

        {/* Learn more — a full card into the About slideshow deck. */}
        <div className="mt-6 pt-6" style={{ borderTop: "1px solid rgba(200,212,192,0.12)" }}>
          <ChoiceCard
            href="/about-deck"
            emoji="✨"
            title={t("welcome_public.learn_more_title", { defaultValue: "Learn more" })}
            blurb={t("welcome_public.learn_more_blurb", { defaultValue: "A short tour of how Phoebe works." })}
            delay={0.17}
            muted
          />
        </div>

        {/* About + download — small pills. "About" opens the plain-text About
            page (readable signed-out). */}
        <div className="mt-5 flex items-center justify-center flex-wrap gap-2.5">
          <PillLink href="/about">{t("welcome_public.about_pill", { defaultValue: "About" })}</PillLink>
          {/* Web only: telling someone already inside the native app to
              "download the app" makes no sense. */}
          {!isNativeShell() && (
            <PillLink href={APP_STORE_URL} external>
              {t("welcome_public.appstore_pill", { defaultValue: "Download the app" })}
            </PillLink>
          )}
        </div>

        {/* Skip straight to the home — the rhythm is already seeded, so this
            just drops them onto the daily-progress home, already going. */}
        <div className="mt-8 mb-2 text-center">
          <button
            type="button"
            onClick={() => setLocation("/dashboard", { replace: true })}
            className="text-sm font-medium"
            style={{ color: SAGE, background: "none", border: "none", cursor: "pointer", padding: 8 }}
          >
            {t("welcome_public.skip_to_home", { defaultValue: "Skip to home →" })}
          </button>
        </div>
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

// A small frosted pill link — used for the low-emphasis footer actions
// (About, get the app) so they read as secondary, not full choice cards.
function PillLink({ href, external, children }: { href: string; external?: boolean; children: ReactNode }) {
  const cls = "rounded-full px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 active:scale-[0.99]";
  const style = {
    background: "rgba(9,26,16, 0.297)",
    backdropFilter: "blur(11.34px)",
    WebkitBackdropFilter: "blur(11.34px)",
    border: "1px solid rgba(46,107,64,0.25)",
    color: SAGE,
    fontFamily: SPACE_GROTESK,
  } as const;
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls} style={style}>
      {children}
    </Link>
  );
}

// Re-export the time-of-day helper so any other page can share the
// same morning/evening signal.
export { isMorningNow };
