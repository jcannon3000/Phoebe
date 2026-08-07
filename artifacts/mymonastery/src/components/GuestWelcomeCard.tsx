// First-open welcome for the PUBLIC no-login home — a quiet "begin here" note
// that sits under the date at the top of the day, telling the newcomer the
// simple daily rhythm is laid out below and the app will walk them through it.
// No CTA button — the rhythm cards beneath ARE the walk-through. Dismissible
// once, device-local, guests only (the caller gates on the guest shape).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const FONT = "'Space Grotesk', sans-serif";
const SEEN_KEY = "phoebe:guest-welcome-dismissed";
const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

export function GuestWelcomeCard() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
  });
  // Has this person prayed at least once? Once they've completed their first
  // office (the intro's "Start here" or any office later), the card stops
  // saying "begin here" and names the practice they're now building. Reads the
  // same server "days of prayer" the streak card does (React Query dedupes).
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const { data: prayerDays } = useQuery<{ streak: number; last7: number; keptToday: boolean }>({
    queryKey: ["/api/me/prayer-days", tz],
    queryFn: () => apiRequest("GET", `/api/me/prayer-days?tz=${encodeURIComponent(tz)}`),
    staleTime: 60_000,
  });
  const hasPrayed = !!prayerDays && (prayerDays.keptToday || prayerDays.last7 > 0 || prayerDays.streak > 0);
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
        {hasPrayed ? "Your rhythm" : "Welcome"}
      </p>
      <p className="text-[16px] font-semibold mt-1" style={{ color: "#F0EDE6", fontFamily: FONT }}>
        {hasPrayed ? "Develop a daily habit of prayer 🌿" : "Begin here 🌿"}
      </p>
      <p className="text-[13.5px] mt-1.5" style={{ color: "rgba(200,212,192,0.78)", fontFamily: FONT, lineHeight: 1.55 }}>
        {hasPrayed
          ? "You've begun. Return each day and let the rhythm hold you — one practice at a time."
          : "Phoebe carries a simple daily rhythm of prayer, laid out below. Each day it will walk you through it, one practice at a time."}
      </p>
      {!hasPrayed && (
        <p className="text-[13.5px] mt-1.5" style={{ color: "rgba(200,212,192,0.78)", fontFamily: FONT, lineHeight: 1.55 }}>
          To customize your routine, go to "Shape your routine" in the menu.
        </p>
      )}
    </div>
  );
}
