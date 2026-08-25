import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearDailyCompletionFlags } from "@/lib/completionReset";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { CommunityRuleCard } from "@/components/CommunityRuleCard";
import { markGroupRuleSeen } from "@/components/GroupRulePrompt";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { TermsBody } from "./terms";
import { PrivacyBody } from "./privacy";


type AuthMode = "signin" | "register";

// Two token flavors:
//   - "community": group-wide shareable link. No invitee info; the visitor
//     supplies their own email. New primary path.
//   - "member": legacy per-email invite. Email is pre-filled and locked.
interface InviteInfo {
  kind: "community" | "member";
  group: { name: string; slug: string; emoji: string | null; description?: string | null };
  invitee?: { email: string; name: string | null; joinedAt: string | null };
}

export default function CommunityJoinPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const { user, isLoading: authLoading } = useAuth();
  // PUBLIC no-login version: a device-local guest (signed out OR the silently
  // provisioned ANONYMOUS device user) must NOT be auto-joined — a community
  // roster full of nameless anonymous accounts is wrong, and joining a pilot
  // group would silently upgrade a throwaway account to the full app. For this
  // page they are "not signed in": they get the invite slideshow + the
  // register/sign-in flow (register upgrades the anonymous account in place,
  // preserving the device's rhythm).
  const joinableUser = user && !isDeviceLocalGuest(user) ? user : null;
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  // A still leaf photo behind the invite, picked once per mount — same
  // backdrop the rest of the app's standalone pages use, so an invite link
  // doesn't land on a flat green field.
  const leafPhoto = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  // Public invite lookup — no auth required. Shows the group name to a
  // brand-new visitor and lets us pre-fill the email for the signup form.
  const { data: invite, isLoading: inviteLoading, error: inviteError } = useQuery<InviteInfo>({
    queryKey: [`/api/groups/${slug}/invite/${token}`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/invite/${token}`),
    enabled: !!slug && !!token,
    retry: false,
  });

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
  // App Store Review Guideline 1.2 — explicit EULA acceptance gate before
  // any UGC can be posted. Account creation is the entry point to all
  // user-generated content in Phoebe, so the checkbox lives here and the
  // submit button is disabled until it's checked.
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  // Modal state for the inline Terms / Privacy viewers. Opening these in
  // a same-page overlay (instead of routing to /terms or /privacy)
  // preserves the user's typed registration data — and works around the
  // Capacitor-iOS quirk where target=_blank with a relative URL silently
  // does nothing, plus the parent <label> intercepting child <a> clicks.
  const [legalModal, setLegalModal] = useState<null | "terms" | "privacy">(null);

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
  // Why the join failed, straight from the server. Without this every failure
  // read "Something went wrong" — a rate-limited retry, a follow-cap 409 and a
  // genuine 500 were indistinguishable, on the one screen where knowing which
  // it is actually matters.
  const [joinError, setJoinError] = useState("");
  // POST /api/auth/register ALREADY joins the group (it takes groupSlug +
  // groupInviteToken and inserts the membership itself, returning
  // joinedGroupSlug). Registering then made `user` truthy, which fired the
  // auto-join effect below for a membership the server had just created —
  // a redundant request racing the navigation to /onboarding, burning a slot
  // against this endpoint's 20/hour rate limit, and able to fail the whole
  // signup onto "Couldn't join" even though the account and membership were
  // both fine. Set the moment register reports it joined, so we don't ask
  // twice.
  const serverJoinedRef = useRef(false);
  const joinMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/join`, { token }),
    onSuccess: async (data: any) => {
      // Server cleared users.officesOnly when an offices-only signup
      // accepts a community invite — they're now "full" tier.
      // Invalidate the auth cache BEFORE we navigate into the
      // community page, so the next render reads the upgraded
      // accessTier instead of bouncing through ParishGate (which
      // would still treat them as offices-only otherwise) and
      // landing them back on /parish.
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setAutoJoinStatus(data.alreadyJoined ? "already" : "success");
    },
    onError: (err: unknown) => {
      setJoinError(err instanceof Error ? err.message : "");
      setAutoJoinStatus("error");
    },
  });

  useEffect(() => {
    if (!authLoading && joinableUser && slug && token && autoJoinStatus === "idle" && !serverJoinedRef.current) {
      setAutoJoinStatus("loading");
      joinMutation.mutate();
    }
  }, [authLoading, joinableUser, slug, token, autoJoinStatus]);

  // The community's RULE OF LIFE, fetched the moment a fresh join lands (the
  // joiner is a member now, so the members-only GET succeeds). When the group
  // keeps a rule, the join moment IS the adoption moment — the welcome screen
  // offers it in one tap instead of silently redirecting home.
  const { data: joinRule, isError: joinRuleError } = useQuery<{ rule: { id?: number | null; label: string | null } | null }>({
    queryKey: [`/api/groups/${slug}/rule`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/rule`),
    enabled: autoJoinStatus === "success",
    retry: false,
  });

  // Already-logged-in visitors skip the onboarding slideshow entirely.
  // Once the auto-join resolves (success OR already-joined), drop them
  // straight on the community page. New signups still see the pre-
  // signup slides; those start from autoJoinStatus="idle" because
  // `user` is null.
  useEffect(() => {
    // A fresh join lands on the home screen — the group's content already
    // surfaces there, so there's no need to drop them on the group page —
    // UNLESS the community keeps a rule of life: then we hold on this page
    // and offer it (the render below), and the person continues themselves.
    // A returning member who re-opens an invite still goes to the group.
    if (autoJoinStatus === "success") {
      if (joinRuleError || (joinRule && !joinRule.rule)) setLocation("/dashboard");
    } else if (autoJoinStatus === "already") {
      setLocation(`/communities/${slug}`);
    }
  }, [autoJoinStatus, joinRule, joinRuleError, slug, setLocation]);

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
    if (!agreedToTerms) {
      setAuthError("Please agree to the Terms of Use and Privacy Policy to continue."); return;
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
        // The server joined the group as part of registering (see
        // serverJoinedRef) — don't let the auto-join effect fire a second,
        // redundant request behind this navigation.
        if (data.joinedGroupSlug) serverJoinedRef.current = true;
        clearDailyCompletionFlags();
        // Server already linked the new user to the group_members row.
        // Route through the full product onboarding (profile pic, BCP
        // intros, gatherings, bell setup, first prayer request), then
        // land on the main HOME screen (/dashboard) — not the
        // community detail page. Per user: "I want the user to land
        // on the home screen when they first arrive, but then the
        // pop up inviting them to do their prayer slide show comes
        // up." The dashboard's existing daily-prayer-invite effect
        // fires the popup automatically once the user's intercessions
        // (auto-joined from this community) load. Existing users who
        // signed in (not registered) skip onboarding via the
        // `onboardingCompleted` guard.
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation(`/onboarding`);
      } else {
        setAuthError(data.error ?? "Couldn't create your account.");
      }
    } catch {
      setAuthError("Couldn't create your account.");
    } finally {
      setAuthSubmitting(false);
    }
  }

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
            {t("community_join.back_to_phoebe")}
          </button>
        </div>
      </div>
    );
  }

  // Authenticated path — auto-join + simple confirmation. Device-local guests
  // (incl. the anonymous device user) fall through to the signup/sign-in flow.
  if (joinableUser) {
    const groupName = invite.group.name;
    // Fresh join into a community that keeps a RULE OF LIFE: the join moment
    // is the adoption moment. Hold here, show the rule card (its own adopt
    // button does the work), and let the person continue when ready.
    const offeringRule = autoJoinStatus === "success" && !!joinRule?.rule;
    // Offered right here, so the home's GroupRulePrompt must not ask again —
    // it keys on the same (group, rule) stamp.
    if (offeringRule && slug) markGroupRuleSeen(slug, joinRule?.rule?.id ?? null);
    return (
      <Layout>
        <div className="max-w-md mx-auto w-full text-center py-16">
          {(autoJoinStatus === "loading" || autoJoinStatus === "idle") && (
            <p className="text-sm" style={{ color: "#8FAF96" }}>{t("community_join.joining", { name: groupName })}</p>
          )}
          {offeringRule && (
            <>
              <div className="text-5xl mb-4">{invite.group.emoji ?? "🏘️"}</div>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("community_join.welcome_to", { name: groupName })}
              </h1>
              <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                {t("community_join.keeps_rule", { defaultValue: "This community keeps a rule of life — one daily rhythm, prayed together. Take it up if you'd like; you can always shape your own." })}
              </p>
              <div className="text-left">
                <CommunityRuleCard slug={slug} />
              </div>
              <button
                onClick={() => setLocation("/dashboard")}
                className="w-full px-6 py-3 rounded-xl text-sm font-semibold mt-2"
                style={{ background: "rgba(46,107,64,0.16)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.3)" }}
              >
                {t("community_join.continue_home", { defaultValue: "Continue to home →" })}
              </button>
            </>
          )}
          {(!offeringRule && (autoJoinStatus === "success" || autoJoinStatus === "already")) && (
            <>
              <div className="text-5xl mb-4">{autoJoinStatus === "already" ? "✓" : "🏘️"}</div>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {autoJoinStatus === "already" ? t("community_join.already_member", { name: groupName }) : t("community_join.welcome_to", { name: groupName })}
              </h1>
              <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                {autoJoinStatus === "already" ? t("community_join.already_part") : t("community_join.youve_joined")}
              </p>
              <button
                onClick={() => setLocation(`/communities/${slug}`)}
                className="px-6 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {t("community_join.go_to_community")}
              </button>
            </>
          )}
          {autoJoinStatus === "error" && (
            <>
              <div className="text-5xl mb-4">😕</div>
              <h1 className="text-xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("community_join.couldnt_join")}
              </h1>
              {/* The server's own reason when it gave one ("Too many join
                  attempts…", "You're already following N communities…") —
                  those are actionable in a way "Something went wrong" never
                  was. Falls back to the generic line otherwise. */}
              <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                {joinError || t("community_join.something_wrong")}
              </p>
              <button
                onClick={() => { setJoinError(""); setAutoJoinStatus("idle"); }}
                className="px-6 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {t("common.try_again", { defaultValue: "Try again" })}
              </button>
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

  // Owner: "yes cut it, just make them sign up if they want to join a
  // group" — the pre-signup onboarding slideshow (a single "welcome to
  // this community" slide, itself already trimmed down from a longer
  // product-tour deck) is gone. Straight to the sign-up/sign-in form below.

  return (
    // `min-h-[100dvh]` respects iOS Safari's dynamic viewport so the
    // URL-bar retraction doesn't reflow the form the moment the
    // keyboard opens. Bottom padding includes the home-indicator safe
    // area plus a generous buffer so Create account never sits flush
    // with the viewport edge (or below it) when the on-screen
    // keyboard is up.
    <div
      className="flex flex-col relative"
      style={{
        background: "#091A10",
        fontFamily: "'Space Grotesk', sans-serif",
        minHeight: "100dvh",
        // Page backdrop pattern: an isolated stacking context so the leaf
        // photo + wash below can sit at z-index -1 behind everything without
        // escaping the page. NEVER position:fixed — that flashes on iOS.
        isolation: "isolate",
      }}
    >
      {leafPhoto && (
        <>
          <img
            src={leafPhoto}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex: -2 }}
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              zIndex: -1,
              background: "linear-gradient(180deg, rgba(8,18,12,0.72) 0%, rgba(8,18,12,0.62) 45%, rgba(8,18,12,0.86) 100%)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
            }}
          />
        </>
      )}
      <header className="px-6 py-6 flex items-center">
        <span className="text-2xl font-bold" style={{ color: "#F0EDE6", letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
      </header>

      <main
        className="flex-1 flex flex-col items-center justify-start px-4 pt-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
      >
        <div className="w-full max-w-sm mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <div className="text-5xl mb-4">{invite.group.emoji ?? "🏘️"}</div>
            {/* This is a GROUP invite, so it's joining a group — not
                following a feed (owner). */}
            <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
              You've been invited to join
            </p>
            <h1 className="text-3xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
              {invite.group.name}
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
              {alreadyHasAccount
                ? "Sign in to your Phoebe account to join the group."
                : isCommunityWide
                  ? "Create a Phoebe account to join — or sign in if you already have one."
                  : "Create your Phoebe account to join the group."}
            </p>
            {/* Say plainly what joining means for what you share, before the
                form rather than after (owner) — prayer requests are the one
                thing a member posts that other members can see. */}
            <p className="text-sm leading-relaxed mt-3" style={{ color: "rgba(143,175,150,0.75)" }}>
              As a member, any prayer request you share with the group is
              visible to everyone else in it, so they can pray for you — and
              you'll see theirs. Anything you keep private stays private.
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
                    className="w-full px-4 py-3.5 rounded-xl focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6", fontSize: 16 }}
                    autoComplete="email"
                    required
                    disabled={authSubmitting}
                  />
                ) : (
                  <input
                    type="email"
                    value={invite.invitee?.email ?? ""}
                    disabled
                    className="w-full px-4 py-3.5 rounded-xl opacity-70"
                    style={{ background: "#091A10", color: "#F0EDE6", fontSize: 16 }}
                  />
                )}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6", fontSize: 16 }}
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
                    className="w-1/2 px-4 py-3.5 rounded-xl focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6", fontSize: 16 }}
                    autoComplete="given-name"
                    required
                    disabled={authSubmitting}
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={e => { setLastName(e.target.value); setAuthError(""); }}
                    className="w-1/2 px-4 py-3.5 rounded-xl focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6", fontSize: 16 }}
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
                    className="w-full px-4 py-3.5 rounded-xl focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6", fontSize: 16 }}
                    autoComplete="email"
                    required
                    disabled={authSubmitting}
                  />
                ) : (
                  <input
                    type="email"
                    value={invite.invitee?.email ?? ""}
                    disabled
                    className="w-full px-4 py-3.5 rounded-xl opacity-70"
                    style={{ background: "#091A10", color: "#F0EDE6", fontSize: 16 }}
                  />
                )}

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Choose a password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setAuthError(""); }}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6", fontSize: 16 }}
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

                {/* App Store Guideline 1.2 EULA gate. Submit is disabled
                    until checked, and the form's onSubmit handler also
                    re-checks before hitting the register endpoint. */}
                <label className="flex gap-2.5 items-start text-xs leading-relaxed mt-1 cursor-pointer" style={{ color: "#8FAF96" }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={e => { setAgreedToTerms(e.target.checked); setAuthError(""); }}
                    className="mt-0.5 shrink-0 cursor-pointer"
                    disabled={authSubmitting}
                  />
                  <span>
                    I agree to Phoebe's{" "}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal("terms"); }}
                      className="underline"
                      style={{ color: "#C8D4C0", background: "transparent" }}
                    >
                      Terms of Use
                    </button>
                    {" "}and{" "}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal("privacy"); }}
                      className="underline"
                      style={{ color: "#C8D4C0", background: "transparent" }}
                    >
                      Privacy Policy
                    </button>
                    . I understand that Phoebe has zero tolerance for objectionable content or abusive behavior, and that violations may result in immediate account termination.
                  </span>
                </label>

                {authError && <p className="text-sm px-1" style={{ color: "#C47A65" }}>{authError}</p>}

                <button
                  type="submit"
                  disabled={authSubmitting || !agreedToTerms}
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

      {legalModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setLegalModal(null); }}
        >
          <div
            className="w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
            style={{
              background: "#091A10",
              maxHeight: "90vh",
              border: "1px solid rgba(200,212,192,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-3 sticky top-0 z-10"
              style={{
                background: "#091A10",
                borderBottom: "1px solid rgba(200,212,192,0.08)",
              }}
            >
              <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.7)" }}>
                {legalModal === "terms" ? "Terms of Use" : "Privacy Policy"}
              </span>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="text-sm px-3 py-1 rounded-lg"
                style={{ color: "#F0EDE6", background: "rgba(46,107,64,0.25)" }}
              >
                Close
              </button>
            </div>
            <div
              className="overflow-y-auto px-5 pt-4 pb-10"
              style={{ color: "#F0EDE6", fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              {legalModal === "terms" ? <TermsBody /> : <PrivacyBody />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
