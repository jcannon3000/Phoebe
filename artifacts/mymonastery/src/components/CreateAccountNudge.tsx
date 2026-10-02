import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { claimNudgeSlot } from "@/lib/nudgeSlot";

// Once a week, for people who use Phoebe without an account (a signed-out visitor,
// or the anonymous device user every phone gets): an invitation to make one
// (owner, 2026-10-02: "once a week ... a pop up for non account users that says
// create an account to access full customizations"). It is a modal over the home
// ONLY — never over a practice, the sign-in page, or anything in progress.
//
// WEEKLY: the clock starts the first time we see them, so nobody is asked on the
// very first open; after that, no more than once in seven days, and "Maybe later"
// counts as the ask (it is stamped when shown, not when answered). The keys sit
// under "phoebe:guest-" so signing out wipes them with the rest of that family:
// a phone handed to someone else starts a fresh week.
const SEEN_KEY = "phoebe:guest-account-nudge-first";
const SHOWN_KEY = "phoebe:guest-account-nudge-shown";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FONT = "'Space Grotesk', system-ui, sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";

const read = (k: string): number | null => {
  try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
};
const write = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* storage blocked: it asks again next visit, which is the safe side */ } };

export function CreateAccountNudge() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const guest = !isLoading && isDeviceLocalGuest(user);
  const onHome = location === "/dashboard";

  useEffect(() => {
    if (!guest || !onHome) return;
    const now = Date.now();
    const first = read(SEEN_KEY);
    if (first === null) { write(SEEN_KEY, now); return; }
    const last = read(SHOWN_KEY) ?? first;
    if (now - last < WEEK_MS) return;
    // A beat after the home settles, so it never lands on top of the splash.
    const t = window.setTimeout(() => { if (!claimNudgeSlot()) return; write(SHOWN_KEY, Date.now()); setOpen(true); }, 2500);
    return () => window.clearTimeout(t);
  }, [guest, onHome]);

  if (!open || !guest || !onHome) return null;
  const close = () => setOpen(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-nudge-title"
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(4,12,7,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#0C1F12", border: "1px solid rgba(143,175,150,0.25)", borderRadius: 20, padding: "26px 24px 20px", maxWidth: 380, width: "100%", boxSizing: "border-box", textAlign: "center", fontFamily: FONT }}
      >
        <h2 id="account-nudge-title" style={{ margin: 0, color: WARM, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
          Make Phoebe your own
        </h2>
        <p style={{ margin: "12px 0 0", color: SAGE, fontSize: 15, lineHeight: 1.6 }}>
          Create an account to unlock the full customizer, shape your rhythm exactly as you pray it, and keep it with you on every device.
        </p>
        <button
          type="button"
          onClick={() => { close(); setLocation("/signin"); }}
          style={{ marginTop: 22, width: "100%", background: "rgba(46,107,64,0.85)", border: "1px solid rgba(110,180,130,0.55)", color: WARM, borderRadius: 14, padding: "14px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
        >
          Create an account
        </button>
        <button
          type="button"
          onClick={close}
          style={{ marginTop: 6, background: "none", border: "none", color: SAGE, fontSize: 14, fontFamily: FONT, cursor: "pointer", padding: "12px 16px" }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
