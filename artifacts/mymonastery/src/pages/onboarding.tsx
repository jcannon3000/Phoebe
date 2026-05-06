import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Modes:
//   signin — existing accounts log in
//   signup — open registration. New users land on /welcome to pick
//            their first surface (Phoebe Climate or a community).
type Mode = "signin" | "signup";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Tracks whether the most recent mutation was a fresh signup so we
  // route to /welcome instead of the climate-only / dashboard default.
  const [justSignedUp, setJustSignedUp] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const explicitRedirect = searchParams.get("redirect");

  useEffect(() => {
    if (!isLoading && user) {
      if (explicitRedirect) {
        setLocation(explicitRedirect);
        return;
      }
      if (justSignedUp) {
        setLocation("/welcome");
        return;
      }
      // Climate-only users land on /climate by default.
      setLocation(user.climateOnly ? "/climate" : "/dashboard");
    }
  }, [user, isLoading, setLocation, explicitRedirect, justSignedUp]);

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setPassword("");
    setJustSignedUp(false);
  }

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address."); return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters."); return;
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
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (website.trim().length > 0) {
      // Honeypot trip — silently fail with a generic message.
      setError("Something went wrong. Please try again.");
      return;
    }
    if (!name.trim()) {
      setError("Your name is required."); return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address."); return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters."); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          website,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.scrollTo(0, 0);
        setJustSignedUp(true);
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
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
              Be together with Phoebe.
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
              A relational app that cultivates connections between Sundays through shared prayer, shared practice, and shared life.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {/* Mode toggle */}
            <div className="flex rounded-xl p-1 mb-4" style={{ background: "#0F2818" }}>
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: mode === m ? "#1A3D2B" : "transparent",
                    color: mode === m ? "#F0EDE6" : "#8FAF96",
                    boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  {m === "signin" ? "Sign in" : "Sign up"}
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
                    placeholder="Email address"
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
                      placeholder="Password"
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
                    <div>
                      <p className="text-sm px-1" style={{ color: "#C47A65" }}>{error}</p>
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
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-60 mt-1 btn-sage"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
                    ) : "Sign in"}
                  </button>
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
                    placeholder="Your name"
                    value={name}
                    onChange={e => { setName(e.target.value); setError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none animate-input-pulse"
                    style={{ background: "#091A10", color: "#F0EDE6" }}
                    autoComplete="name"
                    disabled={submitting}
                  />
                  <input
                    type="email"
                    placeholder="Email address"
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
                      placeholder="Password (6+ characters)"
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
                    ) : "Create account"}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>

          <p className="text-center text-xs mt-8 mb-4 tracking-wide" style={{ color: "rgba(143,175,150,0.5)" }}>
            Inspired by Monastic Wisdom
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
              About
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
