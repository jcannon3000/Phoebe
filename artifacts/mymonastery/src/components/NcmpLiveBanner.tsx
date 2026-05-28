import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { getNcmpState } from "@/lib/officePrefs";

// Bottom-of-screen banner shown ONLY while National Cathedral Morning
// Prayer is actively broadcasting (Mon–Fri 07:00–07:30 ET). Mirrors
// IOSAppDownloadPrompt's slide-up CTA chrome, tinted to the slate-blue
// NCMP identity used by NcmpHomeCard and pulsing a red "live" dot.
//
// Tap routes to /ncmp/watch — the same in-app YouTube wrapper the home
// card uses — so the prayer-session log fires identically on the embed
// page's mount (metrics surface stays "national-cathedral"). Mounted
// INSIDE <WouterRouter> (unlike the sibling prompts) precisely so this
// SPA navigation works.
//
// Gating:
//   1. Live only — getNcmpState() === live. Polled every 30s so the
//      banner self-appears at 07:00 and self-clears at 07:30 ET without
//      a route change.
//   2. Signed-in + onboarded — same audience cutoff as the iOS prompt;
//      no point nudging anonymous or still-onboarding visitors.
//   3. Dismissible per broadcast day — a date-stamped (ET) localStorage
//      key suppresses re-prompts the same morning but lets the banner
//      return for the next weekday's broadcast.

const DISMISS_KEY_PREFIX = "phoebe:ncmp-live-dismissed:";

// YYYY-MM-DD in ET so the per-day dismiss key flips at the cathedral's
// midnight (aligned with the broadcast schedule), not the viewer's TZ.
function etDateStamp(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

export function NcmpLiveBanner() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [live, setLive] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Poll the ET-computed broadcast state so the banner self-shows at
  // 07:00 and self-hides at 07:30 without needing a navigation. React
  // bails out of re-rendering when the boolean is unchanged, so the
  // 30s tick is a no-op outside the two transition minutes.
  useEffect(() => {
    const tick = () => {
      const st = getNcmpState();
      setLive(st.show && st.kind === "live");
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Re-read the per-day dismissal whenever we (re)enter the live window.
  // On a new broadcast day the date-stamped key is absent, so the banner
  // returns even if it was dismissed yesterday.
  useEffect(() => {
    if (!live) return;
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY_PREFIX + etDateStamp()) === "1");
    } catch {
      setDismissed(false);
    }
  }, [live]);

  if (isLoading || !user || !user.onboardingCompleted) return null;
  if (!live || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY_PREFIX + etDateStamp(), "1");
    } catch {
      /* private mode — non-fatal, just won't persist */
    }
  };

  // Positioning/stacking is owned by BottomPromptStack; this renders just
  // the card and re-enables pointer events for its own box.
  return (
    <div
      className="mx-auto w-full rounded-2xl flex items-stretch gap-3 p-3 max-w-md"
      style={{
        background: "#0F2818",
        border: "1px solid rgba(90,120,180,0.5)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        animation: "phoebe-ncmp-banner-slide 360ms ease-out",
        pointerEvents: "auto",
      }}
      role="dialog"
      aria-label="National Cathedral Morning Prayer is live"
    >
      <style>{`
        @keyframes phoebe-ncmp-banner-slide {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes phoebe-ncmp-live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
      {/* TV badge with a pulsing red "broadcast" dot. */}
        <div
          className="relative w-12 h-12 rounded-xl shrink-0 self-center flex items-center justify-center"
          style={{ background: "rgba(90,120,180,0.18)", border: "1px solid rgba(90,120,180,0.4)", fontSize: 22 }}
        >
          <span aria-hidden>📺</span>
          <span
            aria-hidden
            className="absolute"
            style={{
              top: 5,
              right: 5,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#E5484D",
              boxShadow: "0 0 0 2px #0F2818",
              animation: "phoebe-ncmp-live-pulse 1.4s ease-in-out infinite",
            }}
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] font-bold uppercase tracking-[0.14em] rounded px-1.5 py-0.5"
              style={{ background: "#E5484D", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Live
            </span>
            <p
              className="text-[14px] font-semibold leading-tight truncate"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}
            >
              National Cathedral
            </p>
          </div>
          <p
            className="text-[12px] mt-0.5 leading-snug"
            style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Morning Prayer is broadcasting now — pray along live.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
          <button
            type="button"
            onClick={() => {
              // Engaged → stamp the per-day key so retracing back from
              // the watch page doesn't re-surface the banner.
              dismiss();
              setLocation("/ncmp/watch");
            }}
            className="text-[12px] font-semibold rounded-full px-3.5 py-1.5 whitespace-nowrap"
            style={{ background: "rgba(90,120,180,0.55)", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Watch <span aria-hidden>→</span>
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "rgba(143,175,150,0.55)" }}
          >
            Not now
          </button>
        </div>
    </div>
  );
}
