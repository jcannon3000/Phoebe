import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";

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

  function advance() {
    if (safeIdx + 1 >= total) onFinish();
    else setIdx(safeIdx + 1);
  }
  function back() {
    if (safeIdx === 0) onClose();
    else setIdx(safeIdx - 1);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG, fontFamily: SPACE_GROTESK }}>
      <header className="px-6 py-6 flex items-center justify-between">
        <button
          onClick={onClose}
          className="text-sm"
          style={{ color: SAGE, background: "transparent", border: "none", cursor: "pointer" }}
        >
          ← Back
        </button>
        <p className="text-xs" style={{ color: FAINT }}>
          {safeIdx + 1} of {total}
        </p>
        <span className="text-sm" style={{ color: WARM_TEXT, fontWeight: 700 }}>
          {feed.coverEmoji ?? "🕊️"}
        </span>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-5 pb-16 flex flex-col items-center text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32 }}
            className="flex flex-col items-center w-full"
            style={{ gap: 20 }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.22em] mt-4"
              style={{ color: FAINT }}
            >
              From {feed.title}
            </p>
            <h2
              className="text-[26px] font-bold leading-snug"
              style={{ color: WARM_TEXT, letterSpacing: "-0.02em", maxWidth: 380 }}
            >
              {title}
            </h2>

            {body && (
              <div
                className="w-full rounded-2xl px-6 py-5 text-left"
                style={{
                  background: "rgba(46,107,64,0.12)",
                  border: "1px solid rgba(46,107,64,0.18)",
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
                <div
                  className="w-full rounded-2xl px-5 py-4 flex flex-col items-center text-center"
                  style={{
                    background: "rgba(46,107,64,0.18)",
                    border: "1px solid rgba(46,107,64,0.4)",
                    gap: 12,
                  }}
                >
                  <p className="text-sm leading-relaxed" style={{ color: "#C8D4C0" }}>
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
                  className="text-[13px] font-semibold px-4 py-2.5 rounded-full"
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

        <div className="mt-auto pt-10 flex items-center justify-center gap-4 w-full">
          <button
            onClick={back}
            className="text-[13px] font-medium"
            style={{
              color: FAINT,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px 12px",
            }}
          >
            ←
          </button>
          <button
            onClick={advance}
            className="px-9 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: BUTTON_BG, color: WARM_TEXT }}
          >
            {safeIdx + 1 >= total ? "Done →" : "Amen →"}
          </button>
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
  const [name, setName] = useState("");
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
    if (!name.trim()) { setError("Your name is required."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return; }
    if (password.length < 6) { setError("Choose a password of at least 6 characters."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
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
            A free Phoebe account follows this feed for you — and brings you the daily office morning and evening.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="text" placeholder="Your name" value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
            style={inputStyle} autoComplete="name" disabled={submitting}
          />
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
