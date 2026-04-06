import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAF7F2" }}>
        <div className="text-center max-w-sm px-4">
          <p className="text-base mb-4" style={{ color: "#2C1810" }}>This reset link is invalid or has expired.</p>
          <button onClick={() => setLocation("/")} className="text-sm font-semibold" style={{ color: "#4A6FA5" }}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters."); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (data.ok) {
        setDone(true);
      } else {
        setError(data.error ?? "Something went wrong.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FAF7F2" }}>
      <header className="px-6 py-6">
        <span className="text-2xl font-bold" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>
          Phoebe
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="text-4xl mb-5 text-center">🔑</div>
            <h1 className="text-2xl font-bold mb-2 text-center" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
              Choose a new password
            </h1>

            {done ? (
              <div className="text-center mt-6">
                <p className="text-base mb-6" style={{ color: "#6B8F71" }}>
                  Password updated. You can now sign in.
                </p>
                <button
                  onClick={() => setLocation("/")}
                  className="btn-sage px-6 py-3 rounded-xl font-semibold text-sm"
                  style={{ background: "#6B8F71", color: "#fff" }}
                >
                  Sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-8">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="New password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none"
                    style={{ background: "#fff", border: "1px solid #C5BFB0", color: "#2C1810" }}
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: "#9a9390" }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {error && (
                  <p className="text-sm px-1" style={{ color: "#C17F24" }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-sage flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 mt-1"
                  style={{ background: "#6B8F71", color: "#fff" }}
                >
                  {submitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[#EDE8DE] border-t-transparent animate-spin" />
                  ) : "Set new password"}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
