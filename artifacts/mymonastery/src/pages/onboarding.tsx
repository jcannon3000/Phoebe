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
            <div className="text-5xl mb-5">📮</div>
            <h1 className="text-3xl font-bold mb-3" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
              Be together with Phoebe.
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "#8FAF96" }}>
              Letters have connected people for centuries.<br />
              Phoebe sets apart a place to keep that tradition —<br />
              one letter every other week, a shared history<br />
              with the people who matter most.
            </p>
          </motion.div>

          {/* Auth form */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {/* Mode toggle */}
            <div className="flex rounded-xl p-1 mb-4" style={{ background: "#0F2818" }}>
              {(["signin", "register"] as Mode[]).map((m) => (
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
                transition={{ duration: 0.18 }}
                onSubmit={handleSubmit}
                className="flex flex-col gap-3"
              >
                {mode === "register" && (
                  <div className="flex gap-2.5">
                    <input
                      type="text"
                      placeholder="First name"
                      value={firstName}
                      onChange={e => { setFirstName(e.target.value); setError(""); }}
                      className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none transition-colors animate-input-pulse"
                      style={{ background: "#091A10", color: "#F0EDE6" }}
                      autoComplete="given-name"
                      required
                      disabled={submitting}
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={lastName}
                      onChange={e => { setLastName(e.target.value); setError(""); }}
                      className="w-1/2 px-4 py-3.5 rounded-xl text-sm focus:outline-none transition-colors animate-input-pulse"
                      style={{ background: "#091A10", color: "#F0EDE6" }}
                      autoComplete="family-name"
                      required
                      disabled={submitting}
                    />
                  </div>
                )}

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
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
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
                    {mode === "signin" && (
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
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-60 mt-1 btn-sage"
                >
                  {submitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[#F7F0E6] border-t-transparent animate-spin" />
                  ) : mode === "signin" ? "Sign in" : "Create account"}
                </button>

              </motion.form>
            </AnimatePresence>

          </motion.div>

          <p className="text-center text-xs mt-8 tracking-wide" style={{ color: "rgba(143,175,150,0.5)" }}>
            Inspired by Monastic Wisdom
          </p>
        </div>
      </main>
    </div>
  );
}
