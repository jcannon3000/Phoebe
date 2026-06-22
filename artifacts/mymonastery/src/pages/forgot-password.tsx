import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// Frosted-glass field, matching the sign-in page + the rest of the app.
const FROST_FIELD = {
  background: "rgba(22,46,32,0.42)",
  backdropFilter: "blur(11.34px)",
  WebkitBackdropFilter: "blur(11.34px)",
  border: "1px solid rgba(200,212,192,0.22)",
  color: "#F0EDE6",
} as const;

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [bgPhoto] = useState<string | null>(() => LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) {
      setError(t("forgot_password.invalid_email")); return;
    }
    setSubmitting(true);
    try {
      // apiRequest throws on 4xx/5xx with the server's specific
      // message attached. Raw fetch() didn't — a 429 rate-limit
      // silently fell into the success branch, and any HTTP
      // failure short of a network drop never surfaced to the
      // user.
      await apiRequest("POST", "/api/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        // 429 rate limit: surface the server's friendly cooldown
        // message ("Too many password reset requests…"). 400
        // validation errors: surface them too. Anything else falls
        // back to the generic line.
        setError(err.message || t("forgot_password.generic_error"));
      } else {
        // True network failure — fetch itself threw.
        setError(t("forgot_password.network_error"));
      }
    } finally {
      setSubmitting(false);
    }
  };

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
      {bgPhoto && (
        <>
          <img src={bgPhoto} alt="" aria-hidden style={{ position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.42, zIndex: -1 }} />
          <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,18,12,0.5) 0%, rgba(8,18,12,0.64) 45%, rgba(8,18,12,0.82) 100%)" }} />
        </>
      )}
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
            <div className="text-4xl mb-5 text-center">✉️</div>
            <h1 className="text-2xl font-bold mb-2 text-center" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              {t("forgot_password.title")}
            </h1>
            <p className="text-sm text-center mb-8" style={{ color: "#8FAF96" }}>
              {t("forgot_password.subtitle")}
            </p>

            {sent ? (
              <div className="text-center">
                <p className="text-base mb-6" style={{ color: "#8FAF96" }}>
                  {t("forgot_password.sent")}
                </p>
                <button
                  onClick={() => setLocation("/")}
                  className="text-sm font-semibold"
                  style={{ color: "#C8D4C0" }}
                >
                  {t("forgot_password.back_to_sign_in")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                  type="email"
                  placeholder={t("forgot_password.email_placeholder")}
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                  style={FROST_FIELD}
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
                  ) : t("forgot_password.send_reset")}
                </button>

                <button
                  type="button"
                  onClick={() => setLocation("/")}
                  className="text-sm text-center mt-1"
                  style={{ color: "#8FAF96" }}
                >
                  {t("forgot_password.back_to_sign_in")}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
