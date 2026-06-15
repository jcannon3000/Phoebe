import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

/**
 * The heart of the prayer-dialogue model: attention IS the prayer.
 *
 * When the partner opens a daily prayer, this hook accumulates how long it
 * is *actually* attended — the clock only advances while the surface is
 * visible AND the native app is foregrounded. It freezes the instant the
 * tab hides or iOS backgrounds the app (phoebe:appinactive), so leaving the
 * phone on the prayer for an hour in your pocket does NOT count. Once
 * attention crosses the threshold (default 3s) it "counts" — that's the
 * prayed moment — and a receipt is recorded on the server (which never
 * pushes the author; only an in-app receipt).
 *
 * Returns live `seconds` (to drive the breathing-ring cue) and `counted`.
 *
 * Mirrors usePrayerSession's segment model, but ticks so the UI can animate.
 */
export function useAttention(opts: {
  dailyPrayerId: number | null | undefined;
  enabled: boolean;
  thresholdSeconds?: number;
  onCounted?: () => void;
}) {
  const { dailyPrayerId, enabled, thresholdSeconds = 3, onCounted } = opts;
  const [seconds, setSeconds] = useState(0);
  const [counted, setCounted] = useState(false);

  const accumRef = useRef(0);
  // Timestamp of the last counted tick while attending; null = paused
  // (hidden/backgrounded) so the gap isn't credited.
  const lastTickRef = useRef<number | null>(null);
  const countedRef = useRef(false);
  const onCountedRef = useRef(onCounted);
  onCountedRef.current = onCounted;

  useEffect(() => {
    if (!enabled || !dailyPrayerId) return;

    accumRef.current = 0;
    countedRef.current = false;
    setSeconds(0);
    setCounted(false);

    const isActive = () => document.visibilityState === "visible";
    lastTickRef.current = isActive() ? Date.now() : null;

    const post = (secs: number) => {
      apiRequest("POST", `/api/daily-prayer/${dailyPrayerId}/attention`, {
        seconds: Math.round(secs),
      }).catch(() => { /* best-effort — the receipt is non-blocking */ });
    };

    const tick = () => {
      if (lastTickRef.current === null) return;
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      accumRef.current += delta;
      setSeconds(accumRef.current);
      if (!countedRef.current && accumRef.current >= thresholdSeconds) {
        countedRef.current = true;
        setCounted(true);
        post(accumRef.current);          // record the "prayed" moment
        onCountedRef.current?.();
      }
    };

    // Pause/resume on tab visibility AND native app-state. iOS WebViews
    // don't always fire visibilitychange on background, so we also listen
    // to the native phoebe:appactive/appinactive bridge events.
    const pause = () => { lastTickRef.current = null; };
    const resume = () => { if (lastTickRef.current === null) lastTickRef.current = Date.now(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") pause(); else resume(); };

    const interval = window.setInterval(tick, 200);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("phoebe:appinactive", pause);
    window.addEventListener("phoebe:appactive", resume);
    window.addEventListener("pagehide", pause);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("phoebe:appinactive", pause);
      window.removeEventListener("phoebe:appactive", resume);
      window.removeEventListener("pagehide", pause);
      // Final receipt — flush the accumulated attention even if it never
      // crossed the threshold (so "opened but didn't stay" is still visible
      // to the author as a partial view, not nothing).
      if (accumRef.current > 0) post(accumRef.current);
    };
  }, [dailyPrayerId, enabled, thresholdSeconds]);

  return { seconds, counted, progress: Math.min(1, seconds / thresholdSeconds) };
}
