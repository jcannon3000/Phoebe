import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

type AuthMode = "signin" | "register";

interface InviteInfo {
  group: { name: string; slug: string; emoji: string | null };
  invitee: { email: string; name: string | null; joinedAt: string | null };
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

  // Auth state for unauthenticated visitors
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Pre-fill name from the invite when it loads
  useEffect(() => {
    if (invite?.invitee.name && !firstName && !lastName) {
      const parts = invite.invitee.name.trim().split(/\s+/);
      if (parts.length === 1) setFirstName(parts[0]);
      else { setFirstName(parts[0]); setLastName(parts.slice(1).join(" ")); }
    }
  }, [invite, firstName, lastName]);

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

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    if (!password || password.length < 6) {
      setAuthError("Password must be at least 6 characters."); return;
    }
    if (!invite) return;
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invite.invitee.email, password }),
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
          email: invite.invitee.email,
          name: `${firstName.trim()} ${lastName.trim()}`,
          password,
          groupSlug: slug,
          groupInviteToken: token,
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
  // If the invitee already joined (joinedAt != null) and isn't signed in,
  // they should sign in rather than create a new account.
  const alreadyHasAccount = invite.invitee.joinedAt !== null;

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
              You've been invited to
            </p>
            <h1 className="text-3xl font-bold mb-3" style={{ color: "#F0EDE6", letterSpacing: "-0.02em" }}>
              {invite.group.name}
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
              {alreadyHasAccount
                ? "Sign in to your Phoebe account to join."
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
                <input
                  type="email"
                  value={invite.invitee.email}
                  disabled
                  className="w-full px-4 py-3.5 rounded-xl text-sm opacity-70"
                  style={{ background: "#091A10", color: "#F0EDE6" }}
                />
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

                <input
                  type="email"
                  value={invite.invitee.email}
                  disabled
                  className="w-full px-4 py-3.5 rounded-xl text-sm opacity-70"
                  style={{ background: "#091A10", color: "#F0EDE6" }}
                />

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
