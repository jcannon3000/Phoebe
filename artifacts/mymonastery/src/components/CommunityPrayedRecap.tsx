// The community recap — "you prayed for N people this week" + a rail of up to
// five faces. Shown on the final habit slide and the slideshow's closing slide,
// and reused verbatim as the native app-open splash.
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function CommunityPrayedRecap({ coPrayers }: { coPrayers: Array<{ id: number; name: string | null; avatarUrl: string | null }> }) {
  const { t } = useTranslation();
  const visibleAvatars = coPrayers.slice(0, 5);
  const overflow = Math.max(0, coPrayers.length - visibleAvatars.length);
  const peopleCount = coPrayers.length;
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center"
      >
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {t("prayer_mode.you_prayed_for")}
        </p>
        {peopleCount > 0 ? (
          <>
            <p
              className="font-bold leading-none"
              style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#C8D4C0", fontSize: 88, letterSpacing: "-0.04em", marginTop: 6 }}
            >
              {peopleCount}
            </p>
            <p className="text-sm mt-1" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
              {peopleCount === 1 ? "person this week" : "people this week"}
            </p>
          </>
        ) : (
          <p
            className="text-[22px] mt-3 italic"
            style={{ color: "#E8E4D8", fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            You held the world in prayer.
          </p>
        )}
      </motion.div>

      {visibleAvatars.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex flex-col items-center"
        >
          <div className="flex items-center justify-center -space-x-2">
            {visibleAvatars.map((p) => (
              p.avatarUrl ? (
                <img
                  key={p.id}
                  src={p.avatarUrl}
                  alt={p.name ?? ""}
                  className="w-11 h-11 rounded-full object-cover"
                  style={{ border: "2px solid #0C1F12" }}
                />
              ) : (
                <div
                  key={p.id}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ background: "#1A4A2E", color: "#A8C5A0", border: "2px solid #0C1F12" }}
                >
                  {(p.name ?? "?").trim().split(/\s+/).slice(0, 2).map(s => s[0] ?? "").join("").toUpperCase().slice(0, 2) || "?"}
                </div>
              )
            ))}
            {overflow > 0 && (
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-[11px] font-semibold"
                style={{ background: "rgba(46,107,64,0.35)", color: "#C8D4C0", border: "2px solid #0C1F12" }}
              >
                +{overflow}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </>
  );
}
