import { useEffect, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { clearDailyCompletionFlags } from "@/lib/completionReset";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// Modes:
//   signin   — existing accounts log in
//   signup   — open self-serve account creation (POST /api/auth/register, which
//              is open to anyone — see auth.ts "Open signup"). This is what the
//              welcome card's "Create an account" promises; without it the page
//              was a dead end for new users. (The waitlist was removed — signup
//              is open now, so there's nothing to wait for.)
type Mode = "signin" | "signup";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
// Frosted-glass field + toggle, matching the app's leaf-on-glass cards.
const FROST_FIELD: CSSProperties = {
  background: "rgba(22,46,32,0.42)",
  backdropFilter: "blur(11.34px)",
  WebkitBackdropFilter: "blur(11.34px)",
  border: "1px solid rgba(200,212,192,0.22)",
  color: WARM,
};

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // One stable leaf backdrop, matching the welcome chooser + the rest of the app.
  const [bgPhoto] = useState<string | null>(() => LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null);

  // The welcome card can deep-link straight to a tab (?mode=signup); default to
  // sign-in otherwise.
  const initialMode: Mode = (() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    return m === "signup" ? "signup" : "signin";
  })();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  // A fresh sign-up / sign-in always lands on the home — the same place an
  // office signup ends up — never the retired "Find a community" page. We still
  // honor a real ?redirect (e.g. a community-INVITE link), but never /welcome.
  const rawRedirect = searchParams.get("redirect");
  const explicitRedirect = rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("/welcome")
    ? rawRedirect
    : null;

  useEffect(() => {
    if (!isLoading && user) {
      setLocation(explicitRedirect ?? "/dashboard");
    }
  }, [user, isLoading, setLocation, explicitRedirect]);

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setPassword("");
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
        clearDailyCompletionFlags();
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#091A10" }}>
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const spinner = (
    <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
  );

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "#091A10",
        isolation: "isolate",
        fontFamily: "'Space Grotesk', sans-serif",
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Leaf backdrop + darkening gradient — the same glass-on-foliage ground
          the welcome chooser and the rest of the app sit on. */}
      {bgPhoto && (
        <>
          <img src={bgPhoto} alt="" aria-hidden style={{ position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.42, zIndex: -1 }} />
          <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,18,12,0.5) 0%, rgba(8,18,12,0.64) 45%, rgba(8,18,12,0.82) 100%)" }} />
        </>
      )}
      <header className="px-6 py-6 flex items-center">
        <span className="text-2xl font-bold" style={{ color: WARM, letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start px-4 pb-12 pt-12">
        <div className="w-full max-w-sm mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <div className="text-5xl mb-5">🙏🏽</div>
            <h1 className="text-3xl font-bold mb-3" style={{ color: WARM, letterSpacing: "-0.02em" }}>
              {t("auth_landing.hero_title")}
            </h1>
            <p className="text-base leading-relaxed" style={{ color: SAGE }}>
              {t("auth_landing.hero_body")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {/* Mode toggle — frosted glass pill. */}
            <div
              className="flex rounded-xl p-1 mb-4"
              style={{ background: "rgba(12,28,18,0.5)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(200,212,192,0.16)" }}
            >
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: mode === m ? "rgba(46,107,64,0.6)" : "transparent",
                    color: mode === m ? WARM : SAGE,
                    boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  {m === "signin"
                    ? t("auth_landing.tab_signin")
                    : t("auth_landing.tab_signup", { defaultValue: "Sign up" })}
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
                    style={FROST_FIELD}
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
                      style={FROST_FIELD}
                      autoComplete="current-password"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                      style={{ color: SAGE }}
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
                    {submitting ? spinner : t("auth_landing.tab_signin")}
                  </button>
                  {/* Always-visible reset link below the sign-in button —
                      a user who's forgotten their password shouldn't have to
                      fail a login attempt before the link appears. */}
                  <div className="text-center mt-1">
                    <button
                      type="button"
                      onClick={() => setLocation("/forgot-password")}
                      className="text-xs"
                      style={{ color: SAGE }}
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
                    style={FROST_FIELD}
                    autoComplete="name"
                    disabled={submitting}
                  />
                  <input
                    type="email"
                    placeholder={t("auth_landing.ph_email")}
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={FROST_FIELD}
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
                      style={FROST_FIELD}
                      autoComplete="new-password"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                      style={{ color: SAGE }}
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
                    {submitting ? spinner : t("auth_landing.tab_signup", { defaultValue: "Sign up" })}
                  </button>
                  <p className="text-xs text-center mt-1" style={{ color: "rgba(143,175,150,0.7)" }}>
                    {t("auth_landing.signup_note", { defaultValue: "Free to start. We'll help you set up your daily rhythm next." })}
                  </p>
                </motion.form>
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
                backdropFilter: "blur(11.34px)",
                WebkitBackdropFilter: "blur(11.34px)",
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
