// First-open welcome for the PUBLIC no-login home — a "begin here" note that
// sits under the date at the top of the day: it names the rhythm the seed laid
// out and promises the daily walk-through ("each day, Phoebe will walk you
// through this routine"). Dismissible once, device-local, guests only (the
// caller gates on the guest shape).

import { useState } from "react";

const FONT = "'Space Grotesk', sans-serif";
const SEEN_KEY = "phoebe:guest-welcome-dismissed";
const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

export function GuestWelcomeCard() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
  });
  if (dismissed) return null;
  const dismiss = () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode — hides for the session */ }
    setDismissed(true);
  };
  return (
    <div
      className="relative rounded-2xl px-4 py-4 mt-3"
      style={{ ...FROST, background: "rgba(9,26,16,0.4)", border: "1px solid rgba(46,107,64,0.38)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute top-2 right-2.5"
        style={{ background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 14, cursor: "pointer", padding: 6, lineHeight: 1 }}
      >
        ✕
      </button>
      <p className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.75)", fontFamily: FONT }}>
        Welcome
      </p>
      <p className="text-[16px] font-semibold mt-1" style={{ color: "#F0EDE6", fontFamily: FONT }}>
        Begin here 🌿
      </p>
      <p className="text-[13.5px] mt-1.5" style={{ color: "rgba(200,212,192,0.78)", fontFamily: FONT, lineHeight: 1.55 }}>
        Phoebe carries a simple daily rhythm of prayer, laid out below. Each day it will walk
        you through it, one practice at a time — just begin with whatever&rsquo;s next.
      </p>
    </div>
  );
}
