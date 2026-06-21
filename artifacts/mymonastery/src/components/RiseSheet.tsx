import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";

// A full-screen sheet that RISES from the bottom on mount and slides back DOWN
// on close — the same motion as prayer-request creation (pages/prayer-request-new).
// Used for the logging pages opened from home-screen practice cards (Audio
// Divina, Lectio Divina). Replaces the app chrome with a focused sheet: a leaf
// backdrop, a top-right ✕, and the page content. `dest` is where to go on close
// (default home). Children receive `close(dest?)` so inner buttons can dismiss
// with the slide-down before navigating.

const SHEET_BG = "#0a1a10";

export function RiseSheet({
  bgPhoto,
  dest = "/",
  children,
}: {
  bgPhoto?: string | null;
  dest?: string;
  children: (close: (d?: string) => void) => ReactNode;
}) {
  const [, setLocation] = useLocation();
  const [closing, setClosing] = useState<string | null>(null);
  const close = (d?: string) => setClosing(d ?? dest);
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: closing ? "100%" : 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => { if (closing) setLocation(closing); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, isolation: "isolate", minHeight: "100dvh", overflowY: "auto", overflowX: "hidden", background: SHEET_BG }}
    >
      {bgPhoto && (
        <div
          aria-hidden
          style={{ position: "absolute", inset: 0, zIndex: -1, backgroundImage: `url(${bgPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }}
        />
      )}
      {/* Close — slides the sheet back down, then navigates. */}
      <button
        onClick={() => close()}
        aria-label="Close"
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top), 14px)",
          right: 16,
          zIndex: 2,
          width: 34,
          height: 34,
          borderRadius: 999,
          background: "rgba(9,26,16,0.5)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(200,212,192,0.25)",
          color: "#F0EDE6",
          fontSize: 16,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
      <div
        style={{
          maxWidth: 576,
          margin: "0 auto",
          width: "100%",
          padding: "max(env(safe-area-inset-top), 18px) 20px calc(env(safe-area-inset-bottom) + 48px)",
        }}
      >
        {children(close)}
      </div>
    </motion.div>
  );
}
