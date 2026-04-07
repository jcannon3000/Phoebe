import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Mode = "signin" | "register";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  useEffect(() => {
    if (!isLoading && user) setLocation(redirectTo);
  }, [user, isLoading, setLocation, redirectTo]);

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setPassword("");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address."); return;
    }
    if (mode === "register" && !firstName.trim()) {
      setError("Enter your first name."); return;
    }
    if (mode === "register" && !lastName.trim()) {
      setError("Enter your last name."); return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters."); return;
    }

    setSubmitting(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "register"
        ? { email: email.trim(), name: `${firstName.trim()} ${lastName.trim()}`, password }
        : { email: email.trim(), password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation(redirectTo);
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0EBE0" }}>
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F0EBE0", backgroundImage: "radial-gradient(ellipse at 50% 0%, #F5EDD8 0%, #F0EBE0 60%)" }}>
      {/* Header */}
      <header className="px-6 py-8 flex items-center">
        <span className="text-2xl font-bold" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm mx-auto">

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-12"
          >
            <div className="text-5xl mb-6 animate-float inline-block">🌿</div>
            <h1 className="text-3xl font-bold mb-5 leading-tight" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>
              Be together with Phoebe.
            </h1>
            <p className="text-base leading-relaxed mb-5" style={{ color: "#8C7B6B" }}>
              The strength of our relationships is what makes life most vibrant. Phoebe sets apart space to stay close to the people who matter most, drawing on the wisdom of monastic life made new for a world of isolation and distraction.
            </p>
          </motion.div>

          {/* Auth form */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl p-7"
            style={{ background: "#E8E2D5", boxShadow: "0 4px 24px rgba(44,24,16,0.08), 0 1px 6px rgba(44,24,16,0.04)" }}
          >
            {/* Mode toggle */}
            <div className="flex rounded-xl p-1 mb-5" style={{ background: "#D4CFC4" }}>
              {(["signin", "register"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: mode === m ? "#F0EBE0" : "transparent",
                    color: mode === m ? "#2C1810" : "#8C7B6B",
                    boxShadow: mode === m ? "0 1px 4px rgba(44,24,16,0.06)" : "none",
                  }}
                >
                  {m === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.form
                key={mode}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSubmit}
                className="flex flex-col gap-3.5"
              >
                {mode === "register" && (
                  <div className="flex gap-2.5">
                    <input
                      type="text"
                      placeholder="First name"
                      value={firstName}
                      onChange={e => { setFirstName(e.target.value); setError(""); }}
                      className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none transition-colors"
                      style={{ background: "#FAFAF6", border: "none", color: "#2C1810" }}
                      autoComplete="given-name"
                      disabled={submitting}
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={lastName}
                      onChange={e => { setLastName(e.target.value); setError(""); }}
                      className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none transition-colors"
                      style={{ background: "#FAFAF6", border: "none", color: "#2C1810" }}
                      autoComplete="family-name"
                      disabled={submitting}
                    />
                  </div>
                )}

                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none transition-colors"
                  style={{ background: "#FAFAF6", border: "none", color: "#2C1810" }}
                  autoComplete="email"
                  disabled={submitting}
                />

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none transition-colors"
                    style={{ background: "#FAFAF6", border: "none", color: "#2C1810" }}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: "#A89E92" }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {error && (
                  <p className="text-sm px-1" style={{ color: "#C17F24" }}>{error}</p>
                )}

                {mode === "signin" && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setLocation("/forgot-password")}
                      className="text-xs"
                      style={{ color: "#A89E92" }}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-sage flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-60 mt-1"
                  style={{ background: "#5C7A5F", color: "#fff" }}
                >
                  {submitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </motion.form>
            </AnimatePresence>

          </motion.div>

          <p className="text-center text-[11px] mt-10 italic" style={{ color: "#A89E92" }}>
            Romans 16:1 — Phoebe, deacon of the church at Cenchreae.
          </p>
        </div>
      </main>
    </div>
  );
}
