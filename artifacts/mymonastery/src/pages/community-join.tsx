import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// ─── Phone-shaped mockup shell ──────────────────────────────────────────────
// Ported from features-deck.tsx so the community invite slideshow shows the
// *same* visual mocks of each practice that the individual signup deck uses.
// A brand-new visitor lands on `/communities/:slug/join/:token`, sees what
// Phoebe actually looks like, and then meets the specific community.
function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[28px] p-4 mx-auto w-full max-w-[290px]"
      style={{
        background: "#091A10",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
      }}
    >
      {children}
    </div>
  );
}

// Phone mock of the "Prayer List — what the community is holding together"
// surface from church-deck. Ported here so the community-join slideshow
// shows newcomers the practice of carrying each other's intentions as a
// single group rhythm, instead of three separate product previews. Kept
// visual parity with church-deck's PrayerListMock: soft "held" chip,
// day counter, left accent bar.
function PrayerListMock() {
  const items = [
    { name: "Margaret's mother", body: "Treatment this week.", held: "4 praying", days: "3d" },
    { name: "David's discernment", body: "Clarity on the new role.", held: "7 praying", days: "6d" },
    { name: "Peace in a hard season", body: "Anonymous.", held: "5 praying", days: "1d" },
  ];
  return (
    <MockPhone>
      <h2 className="text-base font-bold mb-0.5" style={{ color: "#F0EDE6" }}>
        🕯️ Prayer List
      </h2>
      <p className="text-[10px] mb-3" style={{ color: "#8FAF96" }}>
        What the community is holding together
      </p>
      <div className="h-px mb-3" style={{ background: "rgba(46,107,64,0.25)" }} />
      <div>
        {items.map((item, i) => (
          <div
            key={i}
            className="flex gap-0"
            style={{ borderBottom: i < items.length - 1 ? "1px solid rgba(200,212,192,0.1)" : "none" }}
          >
            <div className="w-0.5 self-stretch shrink-0" style={{ background: "#8FAF96" }} />
            <div className="flex-1 p-2.5">
              <div className="flex justify-between items-baseline">
                <p className="text-[12px] font-medium" style={{ color: "#F0EDE6" }}>
                  {item.name}
                </p>
                <p className="text-[9px]" style={{ color: "rgba(143,175,150,0.4)" }}>
                  {item.days}
                </p>
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                {item.body}
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: "rgba(143,175,150,0.7)" }}>
                🌿 {item.held}
              </p>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

type AuthMode = "signin" | "register";

// Two token flavors:
//   - "community": group-wide shareable link. No invitee info; the visitor
//     supplies their own email. New primary path.
//   - "member": legacy per-email invite. Email is pre-filled and locked.
interface InviteInfo {
  kind: "community" | "member";
  group: { name: string; slug: string; emoji: string | null; description?: string | null };
  invitee?: { email: string; name: string | null; joinedAt: string | null };
  // Only present on community-wide invites — powers the onboarding slideshow
  // shown to unauthenticated visitors before the signup form.
  preview?: {
    memberCount: number;
    sampleMembers: Array<{ name: string | null; avatarUrl: string | null }>;
    practices: Array<{ id: number; name: string; templateType: string | null; intention: string }>;
  };
}

// Template-type → emoji/label for the "what you'll do" slide. Keep in step
// with the dashboard's templateType vocabulary.
const PRACTICE_ICON: Record<string, { emoji: string; label: string }> = {
  "intercession": { emoji: "🙏🏽", label: "Intercession" },
  "lectio-divina": { emoji: "📖", label: "Lectio Divina" },
  "fast": { emoji: "🌾", label: "Fasting" },
  "morning-prayer": { emoji: "🌅", label: "Morning Prayer" },
  "evening-prayer": { emoji: "🌙", label: "Evening Prayer" },
  "examen": { emoji: "🕯️", label: "Examen" },
  "rosary": { emoji: "📿", label: "Rosary" },
  "gratitude": { emoji: "🌿", label: "Gratitude" },
};
function iconForPractice(templateType: string | null): { emoji: string; label: string } {
  if (templateType && PRACTICE_ICON[templateType]) return PRACTICE_ICON[templateType];
  return { emoji: "🌿", label: "Practice" };
}

export default function CommunityJoinPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Public invite lookup — no auth required. Shows the group name to a
  // brand-new visitor and lets us pre-fill the email for the signup form.
  const { data: invite, isLoading: inviteLoading, error: inviteError } = useQuery<InviteInfo>({
    queryKey: [`/api/groups/${slug}/invite/${token}`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/invite/${token}`),
    enabled: !!slug && !!token,
    retry: false,
  });

  // Onboarding slideshow — community-wide invites get a short welcome
  // carousel before the signup form. Visitors can skip it at any time
  // (including on first land) to go straight to the form. Per-member
  // legacy invites bypass the slideshow entirely; they already know
  // what they're being invited to.
  const [slideIndex, setSlideIndex] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(true);

  // Auth state for unauthenticated visitors
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  // Honeypot for the register form. Real browser users never see or fill
  // this; naive bots that autofill every <input> trip it and get rejected
  // server-side with a generic validation error (no "bot detected" tell).
  const [website, setWebsite] = useState("");
  // Email is user-entered only on community-wide links; per-member links
  // pre-fill it from the invite.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Pre-fill name + email from the invite when it loads (per-member tokens only)
  useEffect(() => {
    if (invite?.kind === "member" && invite.invitee) {
      if (invite.invitee.name && !firstName && !lastName) {
        const parts = invite.invitee.name.trim().split(/\s+/);
        if (parts.length === 1) setFirstName(parts[0]);
        else { setFirstName(parts[0]); setLastName(parts.slice(1).join(" ")); }
      }
      if (!email) setEmail(invite.invitee.email);
    }
  }, [invite, firstName, lastName, email]);

  // Auto-join for already-authenticated users.
  const [autoJoinStatus, setAutoJoinStatus] = useState<"idle" | "loading" | "success" | "already" | "error">("idle");
  const joinMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/join`, { token }),
    onSuccess: (data: any) => {
      setAutoJoinStatus(data.alreadyJoined ? "already" : "success");
    },
    onError: () => setAutoJoinStatus("error"),
  });

  useEffect(() => {
    if (!authLoading && user && slug && token && autoJoinStatus === "idle") {
      setAutoJoinStatus("loading");
      joinMutation.mutate();
    }
  }, [authLoading, user, slug, token, autoJoinStatus]);

  // Effective email: pre-filled from invite on per-member tokens, user-entered
  // on community-wide tokens. Both forms use this single resolver.
  const effectiveEmail = (): string => {
    if (invite?.kind === "member" && invite.invitee) return invite.invitee.email;
    return email.trim().toLowerCase();
  };

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const em = effectiveEmail();
    if (!em || !em.includes("@")) { setAuthError("Enter a valid email."); return; }
    if (!password || password.length < 6) {
      setAuthError("Password must be at least 6 characters."); return;
    }
    if (!invite) return;
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, password }),
      });
      const data = await res.json();
      if (data.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        // The auto-join effect above will fire once user becomes truthy.
      } else {
        setAuthError(data.error ?? "Sign in failed.");
      }
    } catch {
      setAuthError("Sign in failed.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    if (!firstName.trim()) { setAuthError("Enter your first name."); return; }
    if (!lastName.trim()) { setAuthError("Enter your last name."); return; }
    const em = effectiveEmail();
    if (!em || !em.includes("@")) { setAuthError("Enter a valid email."); return; }
    if (!password || password.length < 6) {
      setAuthError("Password must be at least 6 characters."); return;
    }
    if (!invite) return;
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: em,
          name: `${firstName.trim()} ${lastName.trim()}`,
          password,
          groupSlug: slug,
          groupInviteToken: token,
          website, // honeypot; legitimate users always send ""
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // Server already linked the new user to the group_members row, so
        // we can skip the join call and go straight to the community.
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation(`/communities/${slug}`);
      } else {
        setAuthError(data.error ?? "Couldn't create your account.");
      }
    } catch {
      setAuthError("Couldn't create your account.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  // Build the slideshow payload. We compose slides conditionally so an empty
  // practice/member list doesn't render a hollow card — a brand-new community
  // with no members yet shouldn't brag about "join 0 others". Computed here
  // (before early returns) to respect the Rules of Hooks.
  //
  // Ordering logic:
  //   1–2. Phoebe intro  — what the product *is*, borrowed from features-deck,
  //        so a brand-new visitor who's never heard of Phoebe gets oriented
  //        before the community-specific welcome. Matches the individual
  //        signup deck's tone.
  //   3+.  Community-specific — invited to pray with X, who's there, what
  //        they do, signup CTA.
  const slides = useMemo(() => {
    if (!invite) return [];
    const s: Array<{ key: string; node: React.ReactNode }> = [];
    const preview = invite.preview;

    // New pre-signup flow: a lean three/four-slide arc — welcome to
    // this specific community, who's already there, what the shared
    // practice looks like (PrayerList mock), and the signup CTA. The
    // older "what is Phoebe + three product mocks + full practice
    // list" stack moved post-signup so new users meet the group
    // before learning the product. That longer tour is now tailored
    // and shown once on their first dashboard visit.

    // Slide — Welcome to the specific community. Always shown.
    s.push({
      key: "welcome",
      node: (
        <div className="text-center">
          <div className="text-6xl mb-5">{invite.group.emoji ?? "🏘️"}</div>
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
            You've been invited to pray with
          </p>
          <h1 className="text-3xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
            {invite.group.name}
          </h1>
          {invite.group.description && (
            <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
              {invite.group.description}
            </p>
          )}
        </div>
      ),
    });

    // Slide 2 — Members. Only if there are members to showcase.
    if (preview && preview.memberCount > 0) {
      const sample = preview.sampleMembers.slice(0, 5);
      const firstNames = sample
        .map(m => (m.name ?? "").split(/\s+/)[0])
        .filter(Boolean);
      const shown = firstNames.slice(0, 3).join(", ");
      const remainder = preview.memberCount - Math.min(3, firstNames.length);
      const headline =
        firstNames.length === 0
          ? `${preview.memberCount} ${preview.memberCount === 1 ? "person is" : "people are"} praying together`
          : remainder > 0
            ? `Join ${shown} & ${remainder} ${remainder === 1 ? "other" : "others"}`
            : `Join ${shown}`;
      s.push({
        key: "members",
        node: (
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] mb-4" style={{ color: "rgba(143,175,150,0.55)" }}>
              You're in good company
            </p>
            {sample.length > 0 && (
              <div className="flex items-center justify-center mb-5">
                {sample.map((m, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden"
                    style={{
                      background: "#1A4A2E",
                      color: "#A8C5A0",
                      border: "2px solid #091A10",
                      marginLeft: i === 0 ? 0 : -10,
                      zIndex: sample.length - i,
                    }}
                  >
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt={m.name ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      (m.name ?? "?").charAt(0).toUpperCase()
                    )}
                  </div>
                ))}
              </div>
            )}
            <h2 className="text-2xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
              {headline}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
              {preview.memberCount === 1
                ? "One soul is already walking this path — your arrival doubles the company."
                : "A small community gathered around shared practice. No feed. No noise. Just rhythm."}
            </p>
          </div>
        ),
      });
    }

    // Slide — Praying together. Single mock of the app's Prayer List
    // surface; the one "what you'll actually do" scene we show before
    // signup. The rest of the tour (lectio, intercession, members+
    // practices deep dives) moves to the post-signup community
    // welcome so newcomers meet this specific group before the
    // product tour starts.
    s.push({
      key: "praying-together",
      node: (
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
            What praying together looks like
          </p>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
            One list. Many of you.
          </h2>
          <PrayerListMock />
          <p className="text-[11px] leading-relaxed mt-4" style={{ color: "rgba(143,175,150,0.75)" }}>
            Everyone's intentions — members of {invite.group.name}, people you're praying for — gathered into one list you walk through once a day.
          </p>
        </div>
      ),
    });

    // Slide N — Ready. Always last. Reveals the signup form on tap.
    s.push({
      key: "ready",
      node: (
        <div className="text-center">
          <div className="text-5xl mb-5">✨</div>
          <h2 className="text-2xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
            Ready to join?
          </h2>
          <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
            Create a free Phoebe account — or sign in if you already have one — to step inside {invite.group.name}.
          </p>
        </div>
      ),
    });

    return s;
  }, [invite]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading || inviteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#091A10" }}>
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (inviteError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#091A10" }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Invalid invite
          </h1>
          <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
            This invite link may have expired or is no longer valid.
          </p>
          <button
            onClick={() => setLocation("/")}
            className="px-6 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Back to Phoebe
          </button>
        </div>
      </div>
    );
  }

  // Authenticated path — auto-join + simple confirmation
  if (user) {
    const groupName = invite.group.name;
    return (
      <Layout>
        <div className="max-w-md mx-auto w-full text-center py-16">
          {(autoJoinStatus === "loading" || autoJoinStatus === "idle") && (
            <p className="text-sm" style={{ color: "#8FAF96" }}>Joining {groupName}...</p>
          )}
          {(autoJoinStatus === "success" || autoJoinStatus === "already") && (
            <>
              <div className="text-5xl mb-4">{autoJoinStatus === "already" ? "✓" : "🏘️"}</div>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {autoJoinStatus === "already" ? `Already a member of ${groupName}` : `Welcome to ${groupName}`}
              </h1>
              <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                {autoJoinStatus === "already" ? "You're already part of this community." : "You've joined the community."}
              </p>
              <button
                onClick={() => setLocation(`/communities/${slug}`)}
                className="px-6 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Go to community →
              </button>
            </>
          )}
          {autoJoinStatus === "error" && (
            <>
              <div className="text-5xl mb-4">😕</div>
              <h1 className="text-xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Couldn't join
              </h1>
              <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                Something went wrong. Please try the link again.
              </p>
            </>
          )}
        </div>
      </Layout>
    );
  }

  // ── Unauthenticated path: signup or sign-in tied to the invite ─────────
  // For per-member tokens: if the invitee already joined (joinedAt != null)
  // and isn't signed in, they should sign in rather than create a new account.
  // Community-wide tokens don't have this hint since there's no per-invitee
  // row — we show the full register/signin toggle.
  const alreadyHasAccount =
    invite.kind === "member" && (invite.invitee?.joinedAt ?? null) !== null;
  const isCommunityWide = invite.kind === "community";

  // Only community-wide invites use the slideshow. Per-member legacy invites
  // skip straight to the form so the pre-filled email + name show immediately.
  const slideshowActive = isCommunityWide && showOnboarding && slides.length > 0;
  const currentSlide = slides[Math.min(slideIndex, slides.length - 1)];
  const isLastSlide = slideIndex >= slides.length - 1;

  // Full-screen slideshow render — takes over the page until the visitor
  // taps "Get started" on the last slide (or "Skip").
  if (slideshowActive) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#091A10", fontFamily: "'Space Grotesk', sans-serif" }}>
        <header className="px-6 py-6 flex items-center justify-between">
          <span className="text-2xl font-bold" style={{ color: "#F0EDE6", letterSpacing: "-0.03em" }}>
            Phoebe
          </span>
          <button
            onClick={() => setShowOnboarding(false)}
            className="text-xs"
            style={{ color: "rgba(143,175,150,0.65)" }}
          >
            Skip
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
          <div className="w-full max-w-sm mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                {currentSlide.node}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Footer — progress dots + primary action */}
        <footer className="px-6 pb-8 flex flex-col items-center gap-5">
          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === slideIndex ? 20 : 6,
                  background: i === slideIndex ? "#8FAF96" : "rgba(143,175,150,0.25)",
                }}
              />
            ))}
          </div>

          <div className="w-full max-w-sm flex flex-col gap-2">
            <button
              onClick={() => {
                if (isLastSlide) {
                  setShowOnboarding(false);
                } else {
                  setSlideIndex(slideIndex + 1);
                }
              }}
              className="flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl font-semibold text-sm btn-sage"
            >
              {isLastSlide ? "Get started" : "Next"}
              <ArrowRight size={15} />
            </button>
            {slideIndex > 0 && !isLastSlide && (
              <button
                onClick={() => setSlideIndex(slideIndex - 1)}
                className="w-full py-2 text-xs"
                style={{ color: "rgba(143,175,150,0.65)" }}
              >
                Back
              </button>
            )}
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10", fontFamily: "'Space Grotesk', sans-serif" }}>
      <header className="px-6 py-6 flex items-center">
        <span className="text-2xl font-bold" style={{ color: "#F0EDE6", letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start px-4 pb-12 pt-12">
        <div className="w-full max-w-sm mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <div className="text-5xl mb-4">{invite.group.emoji ?? "🏘️"}</div>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
              You've been invited to pray with
            </p>
            <h1 className="text-3xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
              {invite.group.name}
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
              {alreadyHasAccount
                ? "Sign in to your Phoebe account to join."
                : isCommunityWide
                  ? "Create a Phoebe account to join — or sign in if you already have one."
                  : "Create your Phoebe account to join the community."}
            </p>
          </motion.div>

          {/* Mode toggle (only when both make sense) */}
          {!alreadyHasAccount && (
            <div className="flex rounded-xl p-1 mb-4" style={{ background: "#0F2818" }}>
              {(["register", "signin"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setAuthMode(m); setAuthError(""); setPassword(""); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: authMode === m ? "#1A3D2B" : "transparent",
                    color: authMode === m ? "#F0EDE6" : "#8FAF96",
                  }}
                >
                  {m === "register" ? "Create account" : "Sign in"}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {(alreadyHasAccount || authMode === "signin") && (
              <motion.form
                key="signin"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleSignin}
                className="flex flex-col gap-3"
              >
                {isCommunityWide ? (
                  <input
                    type="email"
                    placeholder="Your email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="email"
                    required
                    disabled={authSubmitting}
                  />
                ) : (
                  <input
                    type="email"
                    value={invite.invitee?.email ?? ""}
                    disabled
                    className="w-full px-4 py-3.5 rounded-xl text-sm opacity-70"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                  />
                )}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="current-password"
                    disabled={authSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: "#8FAF96" }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {authError && <p className="text-sm px-1" style={{ color: "#C47A65" }}>{authError}</p>}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 mt-1 btn-sage"
                >
                  {authSubmitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
                  ) : "Sign in & join"}
                </button>

                <div className="text-right mt-1">
                  <button
                    type="button"
                    onClick={() => setLocation("/forgot-password")}
                    className="text-xs"
                    style={{ color: "#8FAF96" }}
                  >
                    Forgot password?
                  </button>
                </div>
              </motion.form>
            )}

            {!alreadyHasAccount && authMode === "register" && (
              <motion.form
                key="register"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleRegister}
                className="flex flex-col gap-3"
              >
                {/*
                  Honeypot — visually hidden, off-tab, disabled for
                  autocomplete, labeled like a real field so blind bots fill
                  it. Real users never see or reach this input. We use inline
                  style + aria-hidden + tabIndex=-1 rather than display:none
                  because some bots specifically skip display:none fields.
                */}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "-9999px",
                    top: "auto",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                  }}
                >
                  <label>
                    Website
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                    />
                  </label>
                </div>

                <div className="flex gap-2.5">
                  <input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={e => { setFirstName(e.target.value); setAuthError(""); }}
                    className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="given-name"
                    required
                    disabled={authSubmitting}
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={e => { setLastName(e.target.value); setAuthError(""); }}
                    className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="family-name"
                    required
                    disabled={authSubmitting}
                  />
                </div>

                {isCommunityWide ? (
                  <input
                    type="email"
                    placeholder="Your email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="email"
                    required
                    disabled={authSubmitting}
                  />
                ) : (
                  <input
                    type="email"
                    value={invite.invitee?.email ?? ""}
                    disabled
                    className="w-full px-4 py-3.5 rounded-xl text-sm opacity-70"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                  />
                )}

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Choose a password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="new-password"
                    disabled={authSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: "#8FAF96" }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {authError && <p className="text-sm px-1" style={{ color: "#C47A65" }}>{authError}</p>}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 mt-1 btn-sage"
                >
                  {authSubmitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
                  ) : `Create account & join ${invite.group.name}`}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
