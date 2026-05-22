import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { isNativeShell } from "@/lib/isNativeShell";
import { triggerAmenFeedback, playOpeningSwell } from "@/lib/amenFeedback";

// ── Public, no-login prayer-feed landing ─────────────────────────────────────
//
// A visitor lands on /feed/:slug, reads what the feed is, walks
// through its current intercessions as a slideshow, and is invited to
// sign up at the end. Same closing rhythm as /pray, scoped to one
// specific feed so the URL is shareable.
//
// Backed by GET /api/prayer-feeds/:slug + /intercessions, both of
// which allow anonymous callers when the feed is live + public.
// Signup creates a limited "offices-only" account via
// /api/auth/register and auto-subscribes the new user to this feed in
// the same request (subscribeToFeedSlug).

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

interface Feed {
  id: number;
  slug: string;
  title: string;
  tagline: string | null;
  coverEmoji: string | null;
  subscriberCount: number;
  state: string;
  visibility: string;
}
interface Intercession {
  id: number;
  intercessionTopic: string | null;
  intercessionFullText: string | null;
  intercessionSource: string | null;
  learnMoreUrl: string | null;
  name: string;
  createdAt: string;
  // Distinct users (account holders) who have prayed this intercession
  // in the rolling 7-day window. Returned by GET /api/prayer-feeds/
  // :slug/intercessions. Anonymous public-feed Amens don't create
  // server-side records, so this count is implicitly "people with
  // accounts" — exactly the social-proof line we want on the slide.
  weekPrayCount?: number | null;
}

type Phase = "hero" | "praying" | "signup" | "done";

export default function PublicFeedPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<Phase>("hero");

  // Logged-in users hitting the public URL get bounced to the full
  // app's feed-detail view. The /feed/:slug route is for visitors.
  useEffect(() => {
    if (!authLoading && user && slug) setLocation(`/prayer-feeds/${slug}`);
  }, [authLoading, user, slug, setLocation]);

  const feedQ = useQuery<{ feed: Feed; isCreator: boolean; isSubscribed: boolean }>({
    queryKey: [`/api/prayer-feeds/${slug}`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}`),
    enabled: !!slug,
    retry: false,
  });
  const intercessionsQ = useQuery<{ intercessions: Intercession[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/intercessions`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/intercessions`),
    enabled: !!slug,
    retry: false,
  });

  const feed = feedQ.data?.feed ?? null;
  const intercessions = (intercessionsQ.data?.intercessions ?? [])
    .filter((it) => !it.intercessionFullText || it.intercessionFullText.trim().length > 0 || (it.intercessionTopic ?? "").trim().length > 0);

  // While auth is resolving (or we're about to bounce a logged-in user),
  // render nothing — avoids a flash of the hero before the redirect.
  if (authLoading || (user && slug)) return null;

  if (feedQ.isLoading || intercessionsQ.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-7 h-7 rounded-full border-2 border-[#8FAF96] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!feed) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: BG, fontFamily: SPACE_GROTESK, color: SAGE }}
      >
        <p className="text-base mb-4">This feed isn't available.</p>
        <Link href="/" className="text-sm font-medium" style={{ color: WARM_TEXT, textDecoration: "underline" }}>
          Go to Phoebe →
        </Link>
      </div>
    );
  }

  if (phase === "praying" && intercessions.length > 0) {
    return (
      <PrayingScreen
        feed={feed}
        intercessions={intercessions}
        onFinish={() => setPhase("signup")}
        onClose={() => setPhase("hero")}
      />
    );
  }

  if (phase === "signup") {
    return (
      <SignupStep
        feedSlug={feed.slug}
        feedTitle={feed.title}
        onBack={() => setPhase("praying")}
        onDone={() => setPhase("done")}
      />
    );
  }

  if (phase === "done") {
    return <DoneStep feedTitle={feed.title} />;
  }

  return (
    <HeroScreen
      feed={feed}
      intercessionCount={intercessions.length}
      onStart={() => setPhase(intercessions.length > 0 ? "praying" : "signup")}
    />
  );
}

// ── Hero / landing screen ────────────────────────────────────────────────────

function HeroScreen({
  feed,
  intercessionCount,
  onStart,
}: {
  feed: Feed;
  intercessionCount: number;
  onStart: () => void;
}) {
  const countLine = intercessionCount === 0
    ? "Nothing in the feed yet — sign up to be there when the first prayer lands."
    : intercessionCount === 1
      ? "1 intercession to pray with us."
      : `${intercessionCount} intercessions to pray with us.`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG, fontFamily: SPACE_GROTESK }}>
      <header className="px-6 py-6 flex items-center justify-between">
        <span className="text-2xl font-bold" style={{ color: WARM_TEXT, letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
        <Link href="/signin" className="text-sm font-medium" style={{ color: SAGE }}>
          Sign in
        </Link>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-5 pb-16 flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-10 mb-8 text-center"
        >
          <div className="text-5xl mb-5">{feed.coverEmoji ?? "🕊️"}</div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.22em] mb-2"
            style={{ color: FAINT }}
          >
            A prayer feed on Phoebe
          </p>
          <h1
            className="text-3xl font-bold mb-3"
            style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}
          >
            {feed.title}
          </h1>
          {feed.tagline && (
            <p className="text-base leading-relaxed mb-3" style={{ color: SAGE }}>
              {feed.tagline}
            </p>
          )}
          <p className="text-sm" style={{ color: FAINT }}>
            {countLine}
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18 }}
          onClick={onStart}
          className="self-center px-10 py-3.5 rounded-full text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: BUTTON_BG, color: WARM_TEXT }}
        >
          {intercessionCount > 0 ? "Pray with us →" : "Get notified →"}
        </motion.button>

        <p className="text-center text-xs mt-10" style={{ color: FAINT }}>
          No account needed to pray. Sign up at the end to keep following.
        </p>
      </main>
    </div>
  );
}

// ── Praying — walk the feed's intercessions one at a time ────────────────────

function PrayingScreen({
  feed,
  intercessions,
  onFinish,
  onClose,
}: {
  feed: Feed;
  intercessions: Intercession[];
  onFinish: () => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const total = intercessions.length;
  const safeIdx = Math.min(idx, total - 1);
  const item = intercessions[safeIdx]!;
  const title = (item.intercessionTopic ?? item.name ?? "").trim() || "Intercession";
  const body = (item.intercessionFullText ?? "").trim();
  const isAction = item.intercessionSource === "action";
  const hasLink = !!item.learnMoreUrl;

  // Sound + haptic — match the in-app prayer-mode walker. A gentle
  // opening swell plays on each new slide (including the first, via
  // the effect below) and a soft chime + haptic fires the moment the
  // user taps Amen. The first user gesture (the tap itself) unlocks
  // the AudioContext so iOS Safari's autoplay policy is satisfied
  // even on the public, signed-out flow.
  useEffect(() => {
    playOpeningSwell(safeIdx % 3);
  }, [safeIdx]);

  function advance() {
    triggerAmenFeedback();
    if (safeIdx + 1 >= total) onFinish();
    else setIdx(safeIdx + 1);
  }
  function back() {
    if (safeIdx === 0) onClose();
    else setIdx(safeIdx - 1);
  }

  // The non-logged-in feed slideshow now mirrors prayer-mode.tsx's
  // intercession slide design so logged-in and signed-out users see
  // the same slide shape:
  //   • close (×) in the top-right (no nav chrome above the slide)
  //   • "Community Intercession" eyebrow + "🌿 {feed.title}" pill
  //   • italic Georgia title (not bold sans-serif)
  //   • optional body card in italic Space Grotesk
  //   • "Take action" / "Learn more" link (matching prayer-mode's card)
  //   • centered Amen pill + "Not today" skip + "N of M" progress
  return (
    <div className="min-h-screen flex flex-col relative" style={{ background: BG, fontFamily: SPACE_GROTESK }}>
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center text-xl transition-opacity hover:opacity-80"
        style={{
          color: "rgba(200,212,192,0.45)",
          background: "rgba(200,212,192,0.06)",
          border: "1px solid rgba(200,212,192,0.12)",
          cursor: "pointer",
          zIndex: 1,
        }}
      >
        ×
      </button>

      <main
        className="flex-1 w-full max-w-md mx-auto px-5 flex flex-col items-center text-center"
        style={{
          paddingTop: "clamp(72px, 14vh, 140px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
          gap: 18,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32 }}
            className="flex flex-col items-center w-full"
            style={{ gap: 18 }}
          >
            {/* Eyebrow + feed pill — same shape prayer-mode renders for
                feed-scoped intercessions. The pill carries the feed's
                cover emoji + its display title. */}
            <div className="flex flex-col items-center gap-1.5">
              <p
                className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                style={{ color: "rgba(143,175,150,0.45)" }}
              >
                Community Intercession
              </p>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide"
                style={{
                  background: "rgba(46,107,64,0.22)",
                  color: "#A8C5A0",
                  border: "1px solid rgba(46,107,64,0.4)",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {feed.coverEmoji ?? "🌿"} {feed.title}
              </span>
            </div>

            {/* Title — italic Georgia, matches the in-app intercession
                slide. The big bold sans-serif we used before read
                like a marketing card, not a prayer. */}
            <p
              className="text-[22px] leading-[1.5] font-medium italic"
              style={{
                color: "#E8E4D8",
                fontFamily: "Georgia, 'Times New Roman', serif",
                maxWidth: 380,
              }}
            >
              {title}
            </p>

            {/* Prayer count — distinct account-holders who have prayed
                this in the last 7 days. Matches the line on the in-app
                intercession slide. Hidden when 0 to avoid a deflating
                "0 people …" read. */}
            {typeof item.weekPrayCount === "number" && item.weekPrayCount > 0 && (
              <p
                className="text-[12px] italic"
                style={{
                  color: "rgba(143,175,150,0.55)",
                  marginTop: "-6px",
                }}
              >
                {item.weekPrayCount === 1
                  ? "1 person has prayed this this week."
                  : `${item.weekPrayCount} people have prayed this this week.`}
              </p>
            )}

            {body && (
              <div
                className="w-full rounded-2xl px-6 py-5 text-left mt-1"
                style={{
                  background: "rgba(46,107,64,0.12)",
                  border: "1px solid rgba(46,107,64,0.15)",
                }}
              >
                <p
                  className="italic"
                  style={{
                    color: "#C8D4C0",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 15,
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {body}
                </p>
              </div>
            )}

            {hasLink && (
              isAction ? (
                // Action intercession — same content as before (caption
                // + Take action pill) but rendered directly on the
                // slide background, no card. Lets the prayer body and
                // the call to act read as one continuous thought
                // instead of two competing surfaces.
                <div
                  className="w-full mt-2 flex flex-col items-center text-center"
                  style={{ gap: 12 }}
                >
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    You can take action by emailing the applicable representatives.
                  </p>
                  <button
                    onClick={() => openExternal(item.learnMoreUrl!)}
                    className="text-[13px] font-semibold px-4 py-2.5 rounded-full"
                    style={{
                      background: "rgba(46,107,64,0.35)",
                      color: WARM_TEXT,
                      border: "1px solid rgba(46,107,64,0.55)",
                      cursor: "pointer",
                    }}
                  >
                    Take action →
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => openExternal(item.learnMoreUrl!)}
                  className="text-[13px] font-semibold px-4 py-2.5 rounded-full mt-1"
                  style={{
                    background: "rgba(46,107,64,0.35)",
                    color: WARM_TEXT,
                    border: "1px solid rgba(46,107,64,0.55)",
                    cursor: "pointer",
                  }}
                >
                  Learn more →
                </button>
              )
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer — Amen pill (advances), "Not today" skip below it
            (matches the in-app slideshow's skip link), and a small
            "N of total" progress hint at the very bottom. Back is now
            a single tap-arrow next to Amen rather than a top-bar
            "← Back" button so the chrome doesn't compete with the
            prayer copy. */}
        <div
          className="mt-auto w-full flex flex-col items-center"
          style={{ gap: 14, paddingTop: 32 }}
        >
          <div className="flex items-center justify-center gap-4">
            {safeIdx > 0 && (
              <button
                onClick={back}
                aria-label="Previous"
                className="text-[16px] transition-opacity hover:opacity-80"
                style={{
                  color: "rgba(143,175,150,0.55)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 6px",
                }}
              >
                ←
              </button>
            )}
            <button
              onClick={advance}
              className="px-9 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ background: BUTTON_BG, color: WARM_TEXT, minWidth: 200 }}
            >
              {/* "Amen →" on every slide, including the last. The Amen
                  tap on the final slide still advances the walk into
                  signup; the label just keeps the prayer vocabulary
                  consistent rather than switching to "Done" for the
                  closing beat. */}
              Amen →
            </button>
          </div>
          <button
            onClick={advance}
            className="text-[13px] underline-offset-2 transition-opacity hover:opacity-80"
            style={{
              color: "rgba(143,175,150,0.6)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Not today
          </button>
          <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.4)" }}>
            {safeIdx + 1} of {total}
          </p>
        </div>
      </main>
    </div>
  );
}

// ── Signup — same shape as public-prayer / public-letters, with the
// new account auto-subscribed to this feed in the same request. ────────────

function SignupStep({
  feedSlug,
  feedTitle,
  onBack,
  onDone,
}: {
  feedSlug: string;
  feedTitle: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setExistingAccount(false);
    if (website.trim().length > 0) { setError("Something went wrong. Please try again."); return; }
    if (!firstName.trim()) { setError("Enter your first name."); return; }
    if (!lastName.trim()) { setError("Enter your last name."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return; }
    if (password.length < 6) { setError("Choose a password of at least 6 characters."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Server stores a single `name` column; the form collects
          // first + last so the field reads more naturally on first
          // sign-up. Joined here so /auth/register validation and the
          // rest of the app (which assumes "First Last") keeps working
          // unchanged.
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email: email.trim(),
          password,
          officesOnly: true,
          subscribeToFeedSlug: feedSlug,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        onDone();
      } else if (res.status === 400 && typeof data.error === "string" && /already exists/i.test(data.error)) {
        setExistingAccount(true);
      } else {
        setError(typeof data.error === "string" ? data.error : "Couldn't create your account. Please try again.");
      }
    } catch {
      setError("Couldn't create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    background: "#0F2818",
    color: WARM_TEXT,
    border: "1px solid rgba(46,107,64,0.25)",
  } as const;

  if (existingAccount) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6"
        style={{ background: BG, fontFamily: SPACE_GROTESK }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm flex flex-col items-center text-center"
          style={{ gap: 16 }}
        >
          <div className="text-4xl">🌿</div>
          <h2 className="text-[24px] font-bold leading-snug" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
            You already have an account.
          </h2>
          <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
            Sign in and subscribe to {feedTitle} from your dashboard to keep following it.
          </p>
          <button
            onClick={() => setLocation("/signin")}
            className="px-9 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98] mt-1"
            style={{ background: BUTTON_BG, color: WARM_TEXT }}
          >
            Go to sign in
          </button>
          <button
            onClick={() => setExistingAccount(false)}
            className="text-[13px] font-medium transition-opacity hover:opacity-80"
            style={{ color: FAINT, background: "transparent", border: "none", cursor: "pointer" }}
          >
            Use a different email
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-10"
      style={{ background: BG, fontFamily: SPACE_GROTESK }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm flex flex-col"
      >
        <div className="text-center mb-7">
          <div className="text-4xl mb-3">🌿</div>
          <h2 className="text-[26px] font-bold leading-snug mb-2" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
            Keep praying with {feedTitle}.
          </h2>
          <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
            Create a Phoebe account to continue to pray with others for creation and environmental justice.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex gap-2.5">
            <input
              type="text" placeholder="First name" value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setError(""); }}
              className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none"
              style={inputStyle} autoComplete="given-name" disabled={submitting}
            />
            <input
              type="text" placeholder="Last name" value={lastName}
              onChange={(e) => { setLastName(e.target.value); setError(""); }}
              className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none"
              style={inputStyle} autoComplete="family-name" disabled={submitting}
            />
          </div>
          <input
            type="email" placeholder="Email address" value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
            style={inputStyle} autoComplete="email" disabled={submitting}
          />
          <input
            type="password" placeholder="Create a password" value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
            style={inputStyle} autoComplete="new-password" disabled={submitting}
          />
          {/* Honeypot */}
          <input
            type="text" name="website" value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />
          {error && <p className="text-sm px-1" style={{ color: "#C47A65" }}>{error}</p>}
          <button
            type="submit" disabled={submitting}
            className="w-full px-6 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 mt-1 flex items-center justify-center"
            style={{ background: BUTTON_BG, color: WARM_TEXT }}
          >
            {submitting ? (
              <span className="w-4 h-4 rounded-full border-2 border-[#F0EDE6] border-t-transparent animate-spin" />
            ) : (
              "Create my account"
            )}
          </button>
        </form>

        <button
          onClick={onBack}
          className="text-[13px] font-medium mt-5 self-center transition-opacity hover:opacity-80"
          style={{ color: FAINT, background: "transparent", border: "none", cursor: "pointer" }}
        >
          ← Back
        </button>

        {/* iOS download banner — page-scoped (not the global
            IOSAppDownloadPrompt, which only fires post-auth). Shown
            on web (iOS visitors get a real install path, desktop
            visitors get a "Phoebe is also on iPhone" reminder).
            Hidden inside our own native shell — those users already
            have the app and an App Store link from inside the app is
            both jarring and self-defeating. Detected via the same
            PhoebeNative.isNative() probe IOSAppDownloadPrompt /
            WebPushPermissionPrompt / DesktopAppPrompt use. */}
        {!isNativeShell() && (
        <a
          href="https://apps.apple.com/us/app/phoebe-prayer-together/id6763552921"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 mt-8 rounded-2xl px-4 py-3 transition-opacity hover:opacity-90"
          style={{
            background: "rgba(46,107,64,0.10)",
            border: "1px solid rgba(46,107,64,0.25)",
            textDecoration: "none",
          }}
        >
          <img
            src="/phoebe-app-icon.png"
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: 9, objectFit: "cover", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              className="text-[14px] font-semibold leading-tight"
              style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK }}
            >
              Phoebe for iPhone
            </p>
            <p
              className="text-[12px] mt-0.5"
              style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
            >
              Daily Office, in your pocket.
            </p>
          </div>
          <span
            className="text-[12px] font-semibold px-3 py-1.5 rounded-full shrink-0"
            style={{
              background: "rgba(46,107,64,0.35)",
              color: WARM_TEXT,
              border: "1px solid rgba(46,107,64,0.55)",
              fontFamily: SPACE_GROTESK,
            }}
          >
            Get
          </span>
        </a>
        )}
      </motion.div>
    </div>
  );
}

// ── Done — welcome + into the offices-only home ──────────────────────────────

function DoneStep({ feedTitle }: { feedTitle: string }) {
  const [, setLocation] = useLocation();
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-10"
      style={{ background: BG, fontFamily: SPACE_GROTESK }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm flex flex-col items-center text-center"
        style={{ gap: 18 }}
      >
        <div className="text-5xl">🌿</div>
        <h2 className="text-[24px] font-bold leading-snug" style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}>
          You're following {feedTitle}.
        </h2>
        <p className="text-[15px] leading-relaxed" style={{ color: SAGE }}>
          Each new intercession will land in your daily office — morning and evening — and you'll get a weekly digest when fresh ones arrive.
        </p>
        <button
          onClick={() => setLocation("/parish")}
          className="px-9 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98] mt-1"
          style={{ background: BUTTON_BG, color: WARM_TEXT }}
        >
          Begin
        </button>
      </motion.div>
    </div>
  );
}
