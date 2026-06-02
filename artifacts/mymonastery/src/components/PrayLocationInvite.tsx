/**
 * One-time, in-context invitation to share location for the prayed-for map.
 *
 * Fires the FIRST time someone taps Amen after this rolls out — lib/prayLocation
 * dispatches `phoebe:offer-pray-location` from amenWithLocation, gated to "not
 * already sharing AND not already asked". This is a soft pre-prompt that
 * explains the why BEFORE the OS location dialog: tapping "Share" turns sharing
 * on, persists the pref, and then triggers the real iOS permission request.
 * "Not now" (or the backdrop) dismisses and we never ask again.
 *
 * Mounted once, globally (App.tsx), so it can appear over any surface where an
 * Amen happens — the slideshow, a request detail page, the office.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { setSharePrayLocationCache, getCoarsePrayLocation, markPrayLocationAsked } from "@/lib/prayLocation";

const FONT = "'Space Grotesk', system-ui, sans-serif";

export function PrayLocationInvite() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOffer = () => setOpen(true);
    window.addEventListener("phoebe:offer-pray-location", onOffer);
    return () => window.removeEventListener("phoebe:offer-pray-location", onOffer);
  }, []);

  const dismiss = () => { markPrayLocationAsked(); setOpen(false); };
  const accept = () => {
    setSharePrayLocationCache(true);
    // Soft pre-prompt → real OS permission dialog (native bridge or web).
    void getCoarsePrayLocation(true);
    apiRequest("PUT", "/api/me/office-prefs", { sharePrayLocation: true }).catch(() => { /* best effort */ });
    markPrayLocationAsked();
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pli-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(8,16,10,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <motion.div
            key="pli-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 460, margin: "0 10px",
              background: "#0F2618", border: "1px solid rgba(111,175,133,0.25)",
              borderRadius: "20px 20px 0 0",
              padding: "22px 22px calc(env(safe-area-inset-bottom, 0px) + 18px)",
              fontFamily: FONT, color: "#F0EDE6", boxSizing: "border-box",
            }}
          >
            <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden>🗺️</div>
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 8px", fontFamily: FONT }}>
              {t("pray_location_invite.title", { defaultValue: "Show where your prayers travel?" })}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: "#8FAF96", margin: "0 0 18px" }}>
              {t("pray_location_invite.body", { defaultValue: "When you pray for someone, they can see a map of the places their prayers came from — shown only as a rough area, about a mile across, never your exact spot." })}
            </p>
            <button
              type="button"
              onClick={accept}
              style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "1px solid rgba(168,197,160,0.4)", background: "#2D5E3F", color: "#F0EDE6", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              {t("pray_location_invite.accept", { defaultValue: "Share my location" })}
            </button>
            <button
              type="button"
              onClick={dismiss}
              style={{ width: "100%", padding: "12px 0 2px", background: "none", border: "none", color: "rgba(143,175,150,0.8)", fontFamily: FONT, fontSize: 14, cursor: "pointer" }}
            >
              {t("pray_location_invite.dismiss", { defaultValue: "Not now" })}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
