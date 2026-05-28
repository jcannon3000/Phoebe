import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

// ── Letter invite landing (token-authenticated, public) ──────────────────────
//
// A recipient who isn't on Phoebe lands here from the "you have a letter"
// email. The page is intentionally letter-first: the actual letter
// renders prominently, no signup required to read. Beneath it, a small
// "About Phoebe Letters" section explains the rhythm. A single CTA —
// "Write back" — opens a tiny inline signup that creates an
// offices-only account, auto-claims the invite, and drops them on the
// reply surface.
//
// If the visitor is already signed in (and the token is valid), the
// page auto-accepts and skips the signup; their existing account
// links to the correspondence and they land on the write surface.

interface LetterInfo {
  id: number;
  content: string;
  authorName: string;
  isFromYou: boolean;
  sentAt: string;
}

interface InviteInfo {
  correspondenceName: string;
  creatorName: string;
  type: string;
  memberCount: number;
  letterCount: number;
  alreadyJoined: boolean;
  memberEmail: string;
  letters?: LetterInfo[];
}

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SOFT_TEXT = "#C8D4C0";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const LETTER_FONT = "Georgia, 'Times New Roman', serif";

export default function LetterInvitePage() {
  const [matchLong, paramsLong] = useRoute("/letters/invite/:token");
  const [, paramsShort] = useRoute("/i/:token");
  const params = matchLong ? paramsLong : paramsShort;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inviteToken = params?.token ?? "";

  const [data, setData] = useState<InviteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Inline signup-to-write-back state. The recipient reads first; this
  // appears when they tap "Write back" and they're not signed in.
  const [showSignup, setShowSignup] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Load the invite payload (now includes the letters themselves)
  useEffect(() => {
    if (!inviteToken) return;
    async function load() {
      try {
        const res = await fetch(`/api/phoebe/invite/${inviteToken}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed");
        const d: InviteInfo = await res.json();
        setData(d);
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [inviteToken]);

  // ── Already-signed-in path: auto-accept and bounce into the
  // correspondence. No need to make a logged-in user re-enter their
  // name/email. (The accept endpoint is idempotent — calling it for
  // an already-joined member still returns the correspondenceId we
  // need for the redirect, so the alreadyJoined case rides this same
  // path without a separate setLocation.)
  useEffect(() => {
    if (!user || !data || submitting) return;
    setSubmitting(true);
    (async () => {
      try {
        const res = await fetch(`/api/phoebe/invite/${inviteToken}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: user.name, email: user.email }),
        });
        if (!res.ok) throw new Error("accept failed");
        const result = await res.json();
        setLocation(`/letters/${result.correspondenceId}`);
      } catch {
        setSubmitting(false);
      }
    })();
  }, [user, data, inviteToken, setLocation, submitting]);

  async function signupAndAccept(e: React.FormEvent) {
    e.preventDefault();
    setSignupError("");
    if (!data) return;
    if (!name.trim()) { setSignupError("Your name is required."); return; }
    if (password.length < 6) {
      setSignupError("Choose a password of at least 6 characters.");
      return;
    }
    setSubmitting(true);
    try {
      // Create an offices-only account using the email the letter was
      // addressed to (already known + verified by the token).
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: data.memberEmail,
          password,
          officesOnly: true,
        }),
      });
      const regData = (await regRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!regRes.ok || !regData.ok) {
        if (regRes.status === 400 && typeof regData.error === "string" && /already exists/i.test(regData.error)) {
          setSignupError("You already have a Phoebe account with this email. Sign in to write back.");
        } else {
          setSignupError(regData.error || "Couldn't create your account. Please try again.");
        }
        setSubmitting(false);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      // Claim the invite — links the new userId to the
      // correspondence_members row and stamps joined_at.
      const acceptRes = await fetch(`/api/phoebe/invite/${inviteToken}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), email: data.memberEmail }),
      });
      if (!acceptRes.ok) throw new Error("accept failed");
      const result = await acceptRes.json();
      // Land on the write surface so they can reply immediately.
      setLocation(`/letters/${result.correspondenceId}/write`);
    } catch {
      setSignupError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  // ── Render ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#5C7A5F] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: BG }}>
        <div>
          <p className="text-4xl mb-4">📭</p>
          <p className="text-base" style={{ color: SAGE }}>This invitation is no longer valid.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Signed-in or already-joined → the auto-accept effect handles the
  // redirect; show a spinner while it works.
  if (user || data.alreadyJoined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#5C7A5F] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Most recent letter from the sender (most relevant thing to show
  // first). Other letters render below in chronological order.
  const letters = data.letters ?? [];
  const senderFirst = (data.creatorName ?? "").trim().split(/\s+/)[0] || "your friend";

  return (
    <div className="min-h-screen px-4 py-10 md:py-14" style={{ background: BG, fontFamily: SPACE_GROTESK }}>
      <div className="max-w-2xl mx-auto">
        {/* Phoebe badge */}
        <div className="text-center mb-8">
          <span
            className="text-[13px] font-semibold tracking-[0.16em] uppercase"
            style={{ color: SAGE }}
          >
            📮 Phoebe Letters
          </span>
        </div>

        {/* Lead-in */}
        <div className="text-center mb-10">
          <h1
            className="text-[26px] md:text-[32px] font-bold leading-tight mb-3"
            style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}
          >
            {senderFirst} wrote you a letter.
          </h1>
          <p className="text-[15px]" style={{ color: SAGE }}>
            It&rsquo;s waiting for you below.
          </p>
        </div>

        {/* Letter(s) */}
        {letters.length === 0 ? (
          <p className="text-center text-sm" style={{ color: FAINT }}>
            No letters yet — your friend will write soon.
          </p>
        ) : (
          <div className="space-y-6">
            {letters.map((l) => (
              <article
                key={l.id}
                className="rounded-2xl px-6 py-7 md:px-8 md:py-9"
                style={{
                  background: l.isFromYou ? "rgba(143,175,150,0.06)" : "#0F2818",
                  border: `1px solid ${l.isFromYou ? "rgba(143,175,150,0.18)" : "rgba(46,107,64,0.3)"}`,
                }}
              >
                <header className="mb-4">
                  <p
                    className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-1"
                    style={{ color: FAINT }}
                  >
                    {l.isFromYou ? "From you" : `From ${l.authorName}`}
                  </p>
                  <p className="text-[12px]" style={{ color: SAGE }}>
                    {new Date(l.sentAt).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </header>
                <div
                  className="text-[16px] leading-[1.75] whitespace-pre-wrap"
                  style={{
                    color: SOFT_TEXT,
                    fontFamily: LETTER_FONT,
                  }}
                >
                  {l.content}
                </div>
              </article>
            ))}
          </div>
        )}

        {/* About Phoebe Letters */}
        <section
          className="mt-12 rounded-2xl px-6 py-5"
          style={{
            background: "rgba(46,107,64,0.08)",
            border: "1px solid rgba(46,107,64,0.2)",
          }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.16em] mb-2"
            style={{ color: SAGE }}
          >
            About Phoebe Letters
          </p>
          <p className="text-[14px] leading-relaxed mb-2" style={{ color: SOFT_TEXT }}>
            A slow way of keeping up with the people who matter — about one letter every couple of weeks. No feeds. No notifications begging for attention. Just a real exchange, when there&rsquo;s something worth saying.
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: FAINT }}>
            You didn&rsquo;t need an account to read this letter. If you&rsquo;d like to write back, we&rsquo;ll set one up just for that.
          </p>
        </section>

        {/* Write back CTA */}
        {!showSignup ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              onClick={() => setShowSignup(true)}
              className="px-9 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ background: BUTTON_BG, color: WARM_TEXT }}
            >
              Write back →
            </button>
            <a
              href={`/?redirect=${encodeURIComponent(`/letters/invite/${inviteToken}`)}`}
              className="text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ color: FAINT }}
            >
              Already have an account? Sign in
            </a>
          </div>
        ) : (
          <form
            onSubmit={signupAndAccept}
            className="mt-8 mx-auto max-w-sm flex flex-col gap-3"
          >
            <p className="text-[13px] text-center mb-1" style={{ color: SAGE }}>
              Writing back as <strong style={{ color: WARM_TEXT }}>{data.memberEmail}</strong>
            </p>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => { setName(e.target.value); setSignupError(""); }}
              autoComplete="name"
              disabled={submitting}
              className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
              style={{
                background: "#0F2818",
                color: WARM_TEXT,
                border: "1px solid rgba(46,107,64,0.25)",
              }}
            />
            <input
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setSignupError(""); }}
              autoComplete="new-password"
              disabled={submitting}
              className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
              style={{
                background: "#0F2818",
                color: WARM_TEXT,
                border: "1px solid rgba(46,107,64,0.25)",
              }}
            />
            {signupError && (
              <p className="text-sm px-1" style={{ color: "#C47A65" }}>{signupError}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 mt-1 flex items-center justify-center"
              style={{ background: BUTTON_BG, color: WARM_TEXT }}
            >
              {submitting ? (
                <span className="w-4 h-4 rounded-full border-2 border-[#F0EDE6] border-t-transparent animate-spin" />
              ) : (
                "Create account & write back"
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowSignup(false)}
              disabled={submitting}
              className="text-[13px] font-medium mt-2 self-center transition-opacity hover:opacity-80"
              style={{ color: FAINT, background: "transparent", border: "none", cursor: "pointer" }}
            >
              ← Not yet
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
