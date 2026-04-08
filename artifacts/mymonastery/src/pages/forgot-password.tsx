import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address."); return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10" }}>
      <header className="px-6 py-6">
        <span className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>
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
            <div className="text-4xl mb-5 text-center">📮</div>
            <h1 className="text-2xl font-bold mb-2 text-center" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Forgot your password?
            </h1>
            <p className="text-sm text-center mb-8" style={{ color: "#8FAF96" }}>
              Enter your email and we'll send a reset link.
            </p>

            {sent ? (
              <div className="text-center">
                <p className="text-base mb-6" style={{ color: "#8FAF96" }}>
                  If that account exists, a reset link is on its way. Check your inbox.
                </p>
                <button
                  onClick={() => setLocation("/")}
                  className="text-sm font-semibold"
                  style={{ color: "#C8D4C0" }}
                >
                  ← Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                  style={{ background: "#091A10", border: "1px solid rgba(200,212,192,0.25)", color: "#F0EDE6" }}
                  autoComplete="email"
                  disabled={submitting}
                />

                {error && (
                  <p className="text-sm px-1" style={{ color: "#C47A65" }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-sage flex items-center justify-center w-full px-6 py-3.5 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 mt-1"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {submitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[#F0EDE6] border-t-transparent animate-spin" />
                  ) : "Send reset link"}
                </button>

                <button
                  type="button"
                  onClick={() => setLocation("/")}
                  className="text-sm text-center mt-1"
                  style={{ color: "#8FAF96" }}
                >
                  ← Back to sign in
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
