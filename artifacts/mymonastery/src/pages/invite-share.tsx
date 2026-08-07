import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { shareInvite } from "@/lib/shareInvite";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// ── /invite/share ─────────────────────────────────────────────────────────
//
// Where the menu's "Invite" row goes. The share sheet used to open the instant
// the row was tapped, which gave the user no idea WHAT they were sending or
// why. This page sits in front of it: it names the thing they'd actually be
// giving someone — a way to build a daily habit of prayer — and then offers
// the share.
//
// Not to be confused with /invite, which is where the shared LINK lands (the
// recipient's side). This is the sender's side.

const BG = "#091A10";
const WARM = "#F0EDE6";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export default function InviteSharePage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [justCopied, setJustCopied] = useState(false);
  const bgPhoto = useState(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null))[0];

  // Clear the "Link copied ✓" timer on unmount — tapping Back within the 2.2s
  // window otherwise leaves it to fire against an unmounted component.
  const copiedTimer = useRef<number | null>(null);
  useEffect(() => () => { if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current); }, []);

  async function handleShare() {
    const { copied } = await shareInvite();
    if (copied) {
      setJustCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setJustCopied(false), 2200);
    }
  }

  return (
    <div
      className="relative min-h-[100dvh] flex flex-col"
      style={{ background: BG, color: WARM, fontFamily: FONT, isolation: "isolate" }}
    >
      {/* Backdrop — the shared page recipe: one still leaf photo held low under
          a dark wash, on zIndex -1 inside an isolated stacking context. NEVER
          position:fixed (iOS flash). See reference_page_backdrop_pattern.
          Lighter wash than before (the photo was nearly invisible under it) —
          the frosted panel below carries legibility now, not a near-opaque
          gradient. */}
      {bgPhoto && (
        <>
          <img
            src={bgPhoto}
            alt=""
            aria-hidden
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.34, zIndex: -1 }}
          />
          <div
            aria-hidden
            style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.5) 0%, rgba(8,22,15,0.62) 55%, rgba(8,22,15,0.78) 100%)" }}
          />
        </>
      )}

      {/* Top bar */}
      <div className="flex items-center px-4" style={{ paddingTop: "calc(var(--safe-top) + 10px)", paddingBottom: 6 }}>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1 rounded-full px-2 py-1.5 transition-opacity hover:opacity-80"
          style={{ color: "rgba(240,237,230,0.85)", background: "transparent", border: "none", cursor: "pointer" }}
          aria-label={t("common.back", { defaultValue: "Back" })}
        >
          <ChevronLeft size={20} />
          <span className="text-[14px]">{t("common.back", { defaultValue: "Back" })}</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-7 pb-10 max-w-md mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-[12px] uppercase tracking-[0.2em] font-semibold mb-3" style={{ color: "rgba(240,237,230,0.7)" }}>
            {t("invite_share.eyebrow", { defaultValue: "Invite someone" })}
          </p>
          <h1 className="text-[36px] font-semibold leading-tight mb-5" style={{ color: WARM, fontFamily: FONT }}>
            {t("invite_share.title", { defaultValue: "Welcome someone into the prayer life of the church" })}
          </h1>
          <p className="text-[16px] leading-relaxed mb-8" style={{ color: WARM, fontFamily: FONT }}>
            {t("invite_share.lede", {
              defaultValue:
                "Most people who want to pray daily don't lack the desire — they lack a form to put it in. Sharing Phoebe hands someone that form: a simple, unhurried rhythm they can keep, and a way to grow into the prayer life of the church.",
            })}
          </p>

          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={handleShare}
              className="w-full rounded-full px-8 py-4 text-[17px] font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", cursor: "pointer" }}
            >
              {t("invite_share.share_cta", { defaultValue: "Share Phoebe" })}
            </button>
            <p className="text-[14px] mt-3 text-center" style={{ color: justCopied ? WARM : "rgba(240,237,230,0.6)" }}>
              {justCopied
                ? t("invite_share.copied", { defaultValue: "Link copied ✓" })
                : t("invite_share.share_note", { defaultValue: "Sends a link to Phoebe. On an iPhone it opens straight to the App Store." })}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
