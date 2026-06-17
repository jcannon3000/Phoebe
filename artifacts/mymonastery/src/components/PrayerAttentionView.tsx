import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const RING = "168,197,160"; // soft sage-green

// PrayerAttentionView — open a partner's prayer for the day full-screen, read it,
// and tap Amen to pray it. Amen records the prayed moment (an in-app receipt the
// author sees; never a push), then volleys straight on to the reply — "share
// your prayer back", the second slide. (Per the user's vision: a standard prayer
// slide + an Amen button, replacing the older hold-to-pray attention ring.)
export function PrayerAttentionView({
  dailyPrayerId, body, partnerName, partnerAvatarUrl, alreadyCounted, canSendBack, onClose, onSendBack,
}: {
  dailyPrayerId: number;
  body: string;
  partnerName: string;
  partnerAvatarUrl: string | null;
  alreadyCounted: boolean;
  canSendBack: boolean;
  onClose: () => void;
  onSendBack: () => void;
}) {
  const { t } = useTranslation();
  const [held, setHeld] = useState(alreadyCounted);
  const [amening, setAmening] = useState(false);
  const first = (partnerName || "").trim().split(/\s+/)[0] || partnerName;

  // Amen — record the prayed moment (a ≥3s attention receipt the server counts
  // as prayed), then volley on to the reply composer when you can still share
  // today. Optimistic: flip to held at once; the receipt is best-effort.
  const amen = () => {
    if (held || amening) return;
    setAmening(true);
    setHeld(true);
    void apiRequest("POST", `/api/daily-prayer/${dailyPrayerId}/attention`, { seconds: 3 })
      .catch(() => { /* best-effort receipt */ });
    if (canSendBack) setTimeout(() => onSendBack(), 450);
  };

  // Ring geometry — decorative now (no auto-fill): empty until Amen, full after.
  const R = 54, C = 2 * Math.PI * R;
  const shown = held ? 1 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex flex-col"
      style={{ background: BG, paddingTop: "calc(var(--safe-top) + 16px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
    >
      {/* Header — whose prayer, and a quiet close. */}
      <div className="flex items-center gap-3 px-5">
        {partnerAvatarUrl
          ? <img src={partnerAvatarUrl} alt={first} className="w-8 h-8 rounded-full object-cover" style={{ border: "1.5px solid #1A4A2E" }} />
          : <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>{(first[0] ?? "?").toUpperCase()}</div>}
        <p className="flex-1 text-[13px]" style={{ color: SAGE, fontFamily: "'Space Grotesk', sans-serif" }}>
          {t("prayer_partner.their_prayer", { name: first, defaultValue: `What's on ${first}'s heart` })}
        </p>
        <button onClick={onClose} aria-label="Close" className="text-[22px] leading-none px-2 active:opacity-60" style={{ color: SAGE }}>×</button>
      </div>

      {/* The prayer — serif, still, centered. The breathing ring rests above it. */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <motion.div
          animate={held ? { scale: 1 } : { scale: [1, 1.06, 1] }}
          transition={held ? { duration: 0.6 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="relative mb-9"
          style={{ width: 132, height: 132 }}
        >
          <svg width="132" height="132" viewBox="0 0 132 132">
            <circle cx="66" cy="66" r={R} fill="none" stroke={`rgba(${RING},0.16)`} strokeWidth="2.5" />
            <circle
              cx="66" cy="66" r={R} fill="none" stroke={`rgba(${RING},${held ? 0.95 : 0.75})`} strokeWidth="2.5"
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - shown)}
              transform="rotate(-90 66 66)" style={{ transition: "stroke-dashoffset 0.2s linear, stroke 0.6s" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {held
                ? <motion.span key="check" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[34px]" style={{ color: `rgb(${RING})` }}>🕊️</motion.span>
                : <motion.span key="dot" className="rounded-full" style={{ width: 10, height: 10, background: `rgba(${RING},0.6)` }} />}
            </AnimatePresence>
          </div>
        </motion.div>

        <p style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 23, lineHeight: 1.5, maxWidth: 460 }}>
          {body}
        </p>
      </div>

      {/* Footer — Amen to pray it (then straight on to the reply), or, once
          held, the gentle invitation to share your prayer back. */}
      <div className="px-6" style={{ minHeight: 96 }}>
        {!held ? (
          <div className="flex flex-col items-center">
            <button
              onClick={amen}
              disabled={amening}
              className="rounded-full px-10 py-3.5 text-[16px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
              style={{ background: `rgba(${RING},0.92)`, color: BG, fontFamily: "'Space Grotesk', sans-serif" }}
            >
              🙏 {t("prayer_partner.amen", { defaultValue: "Amen" })}
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4">
            <p className="text-[13px] tracking-wide" style={{ color: `rgba(${RING},0.9)`, fontFamily: "'Space Grotesk', sans-serif" }}>
              {t("prayer_partner.held_in_prayer", { defaultValue: "Held in prayer" })}
            </p>
            {canSendBack ? (
              <button
                onClick={onSendBack}
                className="rounded-full px-7 py-3 text-[15px] font-semibold active:scale-[0.98] transition-transform"
                style={{ background: `rgba(${RING},0.92)`, color: BG, fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("prayer_partner.send_yours_back", { defaultValue: "Share your prayer back" })} →
              </button>
            ) : (
              <button onClick={onClose} className="rounded-full px-7 py-3 text-[15px] font-semibold active:scale-[0.98] transition-transform"
                style={{ background: "rgba(143,175,150,0.16)", color: WARM, fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("common.done", { defaultValue: "Done" })}
              </button>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
