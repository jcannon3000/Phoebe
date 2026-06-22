import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// Frosted-glass field, matching the sign-in page + the rest of the app.
const FROST_FIELD = {
  background: "rgba(22,46,32,0.42)",
  backdropFilter: "blur(11.34px)",
  WebkitBackdropFilter: "blur(11.34px)",
  border: "1px solid rgba(200,212,192,0.22)",
  color: "#F0EDE6",
} as const;

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [bgPhoto] = useState<string | null>(() => LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#091A10" }}>
        <div className="text-center max-w-sm px-4">
          <p className="text-base mb-4" style={{ color: "#F0EDE6" }}>{t("reset_password.invalid_link")}</p>
          <button onClick={() => setLocation("/")} className="text-sm font-semibold" style={{ color: "#C8D4C0" }}>
            {t("reset_password.back_to_sign_in")}
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password || password.length < 6) {
      setError(t("reset_password.too_short")); return;
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
        setError(data.error ?? t("reset_password.generic_error_short"));
      }
    } catch {
      setError(t("reset_password.generic_error"));
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
            <div className="text-4xl mb-5 text-center">🔑</div>
            <h1 className="text-2xl font-bold mb-2 text-center" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              {t("reset_password.title")}
            </h1>

            {done ? (
              <div className="text-center mt-6">
                <p className="text-base mb-6" style={{ color: "#8FAF96" }}>
                  {t("reset_password.updated")}
                </p>
                <button
                  onClick={() => setLocation("/")}
                  className="btn-sage px-6 py-3 rounded-xl font-semibold text-sm"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {t("reset_password.sign_in")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-8">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("reset_password.new_password_placeholder")}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm focus:outline-none"
                    style={FROST_FIELD}
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
                  ) : t("reset_password.submit")}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
