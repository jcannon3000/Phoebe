import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

// Modes:
//   signin   — existing accounts log in
//   signup   — open self-serve account creation (POST /api/auth/register, which
//              is now open to anyone — see auth.ts "Open signup"). This is what
//              the welcome card's "Create an account" promises; without it the
//              page was a dead end for new users.
//   waitlist — kept as a low-commitment "just keep me posted" option.
type Mode = "signin" | "signup" | "waitlist";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // The welcome card can deep-link straight to a tab (?mode=signup); default to
  // sign-in otherwise.
  const initialMode: Mode = (() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    return m === "signup" || m === "waitlist" ? m : "signin";
  })();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Success state for waitlist submission — replaces the form with a
  // friendly confirmation message so the user knows they're on the list.
  const [waitlistDone, setWaitlistDone] = useState<null | "added" | "already" | "has-account">(null);

  const searchParams = new URLSearchParams(window.location.search);
  const explicitRedirect = searchParams.get("redirect");

  useEffect(() => {
    if (!isLoading && user) {
      if (explicitRedirect) {
        setLocation(explicitRedirect);
        return;
      }
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation, explicitRedirect]);

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setPassword("");
    setWaitlistDone(null);
  }

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) {
      setError(t("auth_landing.err_email")); return;
    }
    if (!password || password.length < 6) {
      setError(t("auth_landing.err_password")); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (data.ok) {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.scrollTo(0, 0);
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      } else {
        setError(data.error ?? t("auth_landing.err_generic"));
      }
    } catch {
      setError(t("auth_landing.err_generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (website.trim().length > 0) { // honeypot
      setError(t("auth_landing.err_generic")); return;
    }
    if (!name.trim()) {
      setError(t("auth_landing.err_name")); return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError(t("auth_landing.err_email")); return;
    }
    if (!password || password.length < 6) {
      setError(t("auth_landing.err_password")); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, website }),
      });
      const data = await res.json();
      if (data.ok) {
        // register logs the user in (server req.login); refresh /auth/me and the
        // redirect effect carries them into the app (the signup → customize flow).
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo(0, 0);
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      } else {
        setError(data.error ?? t("auth_landing.err_generic"));
      }
    } catch {
      setError(t("auth_landing.err_generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (website.trim().length > 0) {
      setError(t("auth_landing.err_generic"));
      return;
    }
    if (!name.trim()) {
      setError(t("auth_landing.err_name")); return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError(t("auth_landing.err_email")); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          source: "homepage",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.alreadyHasAccount) setWaitlistDone("has-account");
        else if (data.alreadyOnList) setWaitlistDone("already");
        else setWaitlistDone("added");
      } else {
        setError(data.error ?? t("auth_landing.err_waitlist"));
      }
    } catch {
      setError(t("auth_landing.err_waitlist"));
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#091A10" }}>
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10", fontFamily: "'Space Grotesk', sans-serif" }}>
      <header className="px-6 py-6 flex items-center">
        <span className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start px-4 pb-12 pt-16">
        <div className="w-full max-w-sm mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <div className="text-5xl mb-5">🙏🏽</div>
            <h1 className="text-3xl font-bold mb-3" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
              {t("auth_landing.hero_title")}
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
              {t("auth_landing.hero_body")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {/* Mode toggle */}
            <div className="flex rounded-xl p-1 mb-4" style={{ background: "#0F2818" }}>
              {(["signin", "signup", "waitlist"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className="flex-1 py-2 rounded-lg text-[13px] font-medium transition-all"
                  style={{
                    background: mode === m ? "#1A3D2B" : "transparent",
                    color: mode === m ? "#F0EDE6" : "#8FAF96",
                    boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  {m === "signin"
                    ? t("auth_landing.tab_signin")
                    : m === "signup"
                      ? t("auth_landing.tab_signup", { defaultValue: "Sign up" })
                      : t("auth_landing.tab_waitlist")}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {mode === "signin" && (
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
                    placeholder={t("auth_landing.ph_email")}
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="email"
                    disabled={submitting}
                  />
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder={t("auth_landing.ph_password")}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(""); }}
                      className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none animate-input-pulse"
                      style={{ background: "#091A10", color: "#F0EDE6" }}
                      autoComplete="current-password"
                      disabled={submitting}
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
                  {error && (
                    <p className="text-sm px-1" style={{ color: "#C47A65" }}>{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-60 mt-1 btn-sage"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
                    ) : t("auth_landing.tab_signin")}
                  </button>
                  {/* Always-visible reset link below the sign-in button —
                      a user who's forgotten their password shouldn't have to
                      fail a login attempt before the link appears. */}
                  <div className="text-center mt-1">
                    <button
                      type="button"
                      onClick={() => setLocation("/forgot-password")}
                      className="text-xs"
                      style={{ color: "#8FAF96" }}
                    >
                      {t("auth_landing.forgot")}
                    </button>
                  </div>
                </motion.form>
              )}

              {mode === "signup" && (
                <motion.form
                  key="signup"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  onSubmit={handleSignup}
                  className="flex flex-col gap-3"
                >
                  <input
                    type="text"
                    placeholder={t("auth_landing.ph_name")}
                    value={name}
                    onChange={e => { setName(e.target.value); setError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="name"
                    disabled={submitting}
                  />
                  <input
                    type="email"
                    placeholder={t("auth_landing.ph_email")}
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="email"
                    disabled={submitting}
                  />
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder={t("auth_landing.ph_password")}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(""); }}
                      className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none animate-input-pulse"
                      style={{ background: "#091A10", color: "#F0EDE6" }}
                      autoComplete="new-password"
                      disabled={submitting}
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
                  {/* Honeypot */}
                  <input
                    type="text"
                    name="website"
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                  />
                  {error && <p className="text-sm px-1" style={{ color: "#C47A65" }}>{error}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-60 mt-1 btn-sage"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
                    ) : t("auth_landing.tab_signup", { defaultValue: "Sign up" })}
                  </button>
                  <p className="text-xs text-center mt-1" style={{ color: "rgba(143,175,150,0.7)" }}>
                    {t("auth_landing.signup_note", { defaultValue: "Free to start. We'll help you set up your daily rhythm next." })}
                  </p>
                </motion.form>
              )}

              {mode === "waitlist" && (
                <motion.div
                  key="waitlist"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {waitlistDone ? (
                    <div
                      className="rounded-xl px-4 py-5 text-center"
                      style={{
                        background: "rgba(46,107,64,0.12)",
                        border: "1px solid rgba(46,107,64,0.3)",
                      }}
                    >
                      <div className="text-3xl mb-2">🌿</div>
                      <p className="text-sm leading-relaxed" style={{ color: "#F0EDE6" }}>
                        {waitlistDone === "has-account"
                          ? t("auth_landing.done_has_account")
                          : waitlistDone === "already"
                            ? t("auth_landing.done_already")
                            : t("auth_landing.done_added")}
                      </p>
                      {waitlistDone === "has-account" && (
                        <button
                          type="button"
                          onClick={() => switchMode("signin")}
                          className="text-xs mt-3"
                          style={{ color: "#8FAF96", textDecoration: "underline" }}
                        >
                          {t("auth_landing.go_signin")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleWaitlist} className="flex flex-col gap-3">
                      <input
                        type="text"
                        placeholder={t("auth_landing.ph_name")}
                        value={name}
                        onChange={e => { setName(e.target.value); setError(""); }}
                        className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                        style={{ background: "#091A10", color: "#F0EDE6" }}
                        autoComplete="name"
                        disabled={submitting}
                      />
                      <input
                        type="email"
                        placeholder={t("auth_landing.ph_email")}
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError(""); }}
                        className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                        style={{ background: "#091A10", color: "#F0EDE6" }}
                        autoComplete="email"
                        disabled={submitting}
                      />
                      {/* Honeypot */}
                      <input
                        type="text"
                        name="website"
                        value={website}
                        onChange={e => setWebsite(e.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                      />
                      {error && <p className="text-sm px-1" style={{ color: "#C47A65" }}>{error}</p>}
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-60 mt-1 btn-sage"
                      >
                        {submitting ? (
                          <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
                        ) : t("auth_landing.tab_waitlist")}
                      </button>
                      <p className="text-xs text-center mt-1" style={{ color: "rgba(143,175,150,0.7)" }}>
                        {t("auth_landing.waitlist_note")}
                      </p>
                    </form>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <p className="text-center text-xs mt-8 mb-4 tracking-wide" style={{ color: "rgba(143,175,150,0.5)" }}>
            {t("auth_landing.inspired")}
          </p>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setLocation("/church-deck")}
              className="px-5 py-2 rounded-full text-xs font-medium tracking-wide transition-opacity hover:opacity-100"
              style={{
                background: "rgba(200,212,192,0.06)",
                border: "1px solid rgba(200,212,192,0.18)",
                color: "rgba(200,212,192,0.7)",
              }}
            >
              {t("auth_landing.about")}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
