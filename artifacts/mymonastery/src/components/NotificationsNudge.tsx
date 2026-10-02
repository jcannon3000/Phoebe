import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { checkPushPermission, enablePushNotifications, type PermState } from "@/lib/pushPermission";
import { claimNudgeSlot } from "@/lib/nudgeSlot";

// Once a week, for anyone whose notifications are off (never asked, or declined):
// a pop-up over the home inviting them to turn them on (owner, 2026-10-02:
// "once a week show a pop up to turn on notifications if they dont have them").
// The standing bottom card (NotificationReminderBanner) is easy to ignore; this is
// the weekly nudge on top of it.
//
// Same rules as the create-an-account pop-up: the home only, never over a practice;
// the week starts the first time we see them; "Maybe later" counts as the ask.
// Never asked -> the button fires the system dialog. Already declined -> the OS
// will not show it again, so the button goes to Settings instead.
const SEEN_KEY = "phoebe:notif-nudge-first";
const SHOWN_KEY = "phoebe:notif-nudge-shown";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FONT = "'Space Grotesk', system-ui, sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";

const read = (k: string): number | null => {
  try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
};
const write = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* blocked: asks again next visit */ } };

export function NotificationsNudge() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [perm, setPerm] = useState<PermState | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const onHome = location === "/dashboard";

  useEffect(() => {
    if (isLoading || !user || !onHome) return;
    let cancelled = false;
    let timer: number | undefined;
    void checkPushPermission().then((p) => {
      if (cancelled || (p !== "prompt" && p !== "denied")) return;
      const now = Date.now();
      const first = read(SEEN_KEY);
      if (first === null) { write(SEEN_KEY, now); return; }
      if (now - (read(SHOWN_KEY) ?? first) < WEEK_MS) return;
      timer = window.setTimeout(() => {
        if (!claimNudgeSlot()) return;
        write(SHOWN_KEY, Date.now());
        setPerm(p);
        setOpen(true);
      }, 3500);
    });
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [isLoading, user, onHome]);

  if (!open || !onHome) return null;
  const close = () => setOpen(false);
  const denied = perm === "denied";
  const turnOn = async () => {
    if (denied) { close(); setLocation("/settings"); return; }
    setWorking(true);
    try { await enablePushNotifications(); } catch { /* the OS answered or timed out; either way we are done */ }
    setWorking(false);
    close();
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-nudge-title"
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(4,12,7,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#0C1F12", border: "1px solid rgba(143,175,150,0.25)", borderRadius: 20, padding: "26px 24px 20px", maxWidth: 380, width: "100%", boxSizing: "border-box", textAlign: "center", fontFamily: FONT }}
      >
        <h2 id="notif-nudge-title" style={{ margin: 0, color: WARM, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
          Let Phoebe remind you to pray
        </h2>
        <p style={{ margin: "12px 0 0", color: SAGE, fontSize: 15, lineHeight: 1.6 }}>
          Turn on notifications for a gentle nudge at the time you choose, and to know when others have prayed with you.
        </p>
        <button
          type="button"
          disabled={working}
          onClick={() => void turnOn()}
          style={{ marginTop: 22, width: "100%", background: "rgba(46,107,64,0.85)", border: "1px solid rgba(110,180,130,0.55)", color: WARM, borderRadius: 14, padding: "14px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer", opacity: working ? 0.7 : 1 }}
        >
          {denied ? "Open Settings" : working ? "Turning on…" : "Turn on notifications"}
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
