import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

interface LetterPreview {
  correspondenceName: string;
  groupType: string;
  memberNames: string[];
  letterCount: number;
  latestAuthorName: string | null;
  latestSentAt: string | null;
}

export default function LetterSplash() {
  const [, params] = useRoute("/letter/:id");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const correspondenceId = params?.id;
  const token = new URLSearchParams(window.location.search).get("token");
  const tokenParam = token ? `?token=${token}` : "";

  const [preview, setPreview] = useState<LetterPreview | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Fetch preview (public — content-free)
  useEffect(() => {
    if (!correspondenceId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/phoebe/correspondences/${correspondenceId}/preview`);
        if (res.status === 404) { if (!cancelled) setNotFound(true); return; }
        if (!res.ok) throw new Error("preview failed");
        const data = await res.json();
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => { cancelled = true; };
  }, [correspondenceId]);

  const threadUrl = `/letters/${correspondenceId}${tokenParam}`;

  const isAuthenticated = !!user || !!token;
  const isNewUser = !!user && !user.correspondenceImprintCompleted;

  // Variant B — existing user, auto-advance after 2s.
  useEffect(() => {
    if (!isAuthenticated || isNewUser || !preview) return;
    const t = setTimeout(() => setLocation(threadUrl), 2000);
    return () => clearTimeout(t);
  }, [isAuthenticated, isNewUser, preview, threadUrl, setLocation]);

  // Paper-style background for all states
  const bg = "#091A10";

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: bg }}>
        <p className="text-5xl mb-4">📮</p>
        <p className="text-base mb-1" style={{ color: "#F0EDE6" }}>{t("letter_splash.not_active")}</p>
        <p className="text-sm" style={{ color: "#8FAF96" }}>{t("letter_splash.maybe_archived")}</p>
      </div>
    );
  }

  if (authLoading || !preview) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
        <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "#8FAF96", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // Unauthenticated — sign in to read.
  if (!isAuthenticated) {
    const redirectPath = `/letter/${correspondenceId}`;
    const signInUrl = `/?redirect=${encodeURIComponent(redirectPath)}`;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: bg, fontFamily: "'Space Grotesk', sans-serif" }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-sm w-full text-center"
        >
          <div className="text-5xl mb-6">📮</div>
          <h1 className="text-[22px] font-bold mb-3" style={{ color: "#F0EDE6" }}>
            {preview.latestAuthorName
              ? t("letter_splash.wrote_you", { name: preview.latestAuthorName })
              : t("letter_splash.waiting")}
          </h1>
          <p className="text-base mb-8 leading-relaxed" style={{ color: "#8FAF96" }}>
            {t("letter_splash.sign_in_to_read")}
          </p>
          <a
            href={signInUrl}
            className="inline-flex items-center justify-center w-full py-4 rounded-2xl font-semibold text-base"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            {t("letter_splash.sign_in_to_phoebe")}
          </a>
          <p className="text-xs mt-10" style={{ color: "#8FAF96" }}>{t("letter_splash.tagline")}</p>
        </motion.div>
      </div>
    );
  }

  // Variant A — new user (full intro).
  if (isNewUser) {
    const waitingName = preview.latestAuthorName || preview.memberNames[0] || t("letter_splash.your_correspondent");
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
        style={{ background: bg, fontFamily: "'Space Grotesk', sans-serif" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full"
        >
          <div className="text-6xl mb-8">📮</div>
          <h1 className="text-[28px] font-bold mb-5 leading-tight" style={{ color: "#F0EDE6" }}>
            {t("letter_splash.wrote_you", { name: waitingName })}
          </h1>
          <p className="text-base mb-4 leading-relaxed" style={{ color: "#C8D4C0" }}>
            {t("letter_splash.intro_p1")}
          </p>
          <p className="text-base mb-8 leading-relaxed" style={{ color: "#C8D4C0" }}>
            {t("letter_splash.intro_p2")}
          </p>
          <p className="text-sm italic mb-10" style={{ color: "#8FAF96" }}>
            {t("letter_splash.monks_quote")}
          </p>
          <button
            onClick={() => setLocation(threadUrl)}
            className="w-full py-4 rounded-2xl font-semibold text-base"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            {t("letter_splash.read_letter")}
          </button>
          <p className="text-xs mt-12" style={{ color: "#8FAF96" }}>{t("letter_splash.tagline")}</p>
        </motion.div>
      </div>
    );
  }

  // Variant B — existing user, quiet transition (auto-advances above).
  const waitingName = preview.latestAuthorName || preview.memberNames[0] || t("letter_splash.your_correspondent");
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: bg, fontFamily: "'Space Grotesk', sans-serif" }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <div className="text-5xl mb-6">📮</div>
        <p className="text-xl font-semibold mb-2" style={{ color: "#F0EDE6" }}>
          {t("letter_splash.wrote_you", { name: waitingName })}
        </p>
        <p className="text-sm" style={{ color: "#8FAF96" }}>{t("letter_splash.opening")}</p>
      </motion.div>
    </div>
  );
}
