import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  const explicitRedirect = searchParams.get("redirect");

  useEffect(() => {
    if (!isLoading && user) {
      // Climate-only users land on /climate by default, not the
      // dashboard — they have no prayer list, no letters, etc.
      const dest = explicitRedirect ?? (user.climateOnly ? "/climate" : "/dashboard");
      setLocation(dest);
    }
  }, [user, isLoading, setLocation, explicitRedirect]);

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
        // Dismiss the iOS keyboard and reset scroll before navigating.
        // Without this, the WebView stays scrolled up to where it had
        // pushed the focused input above the keyboard, leaving the
        // dashboard's top bar clipped off-screen on Capacitor builds
        // (the keyboard plugin's `resize: None` mode keeps the WebView
        // size fixed but doesn't snap the scroll back). Blurring the
        // active input first triggers iOS to retract the keyboard;
        // scrolling the window to (0, 0) realigns the page.
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.scrollTo(0, 0);
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        // The useEffect above re-runs as soon as /api/auth/me reloads
        // and routes the user to the right destination based on their
        // climate_only flag — no need to compute the dest twice here.
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
      {/* Header */}
      <header className="px-6 py-6 flex items-center">
        <span className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start px-4 pb-12 pt-16">
        <div className="w-full max-w-sm mx-auto">

          {/* Hero */}
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

          {/* Sign-in form. The waitlist tab was removed — Phoebe is by
              group invite, so unauthenticated visitors who don't have a
              link are pointed at their group leader rather than parked
              on a list. The /climate signup is its own surface and is
              not gated by group invite. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <form
              onSubmit={handleSignin}
              className="flex flex-col gap-3"
            >
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none transition-colors animate-input-pulse"
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
                  className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none transition-colors animate-input-pulse"
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
            </form>

            {/* By-group-invite note */}
            <div
              className="mt-6 rounded-xl px-4 py-4"
              style={{
                background: "rgba(46,107,64,0.08)",
                border: "1px solid rgba(46,107,64,0.18)",
              }}
            >
              <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
                Phoebe is by group invite. If your group is on Phoebe, ask your
                group leader to send you a link, and you'll be able to sign up
                from there.
              </p>
            </div>
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
