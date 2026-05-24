import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

// Pings POST /api/app-open when a signed-in user opens or foregrounds the
// app, so the admin metrics can show "people who opened" and "times
// opened." The server collapses opens to one per 15-minute window — this
// client-side 60s throttle only stops a rapid background/foreground
// flicker from spamming requests; the server bucket is the real dedup.
const THROTTLE_MS = 60 * 1000;
const LAST_KEY = "phoebe:last-app-open-ping";

export function AppOpenTracker() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const ping = () => {
      try {
        const last = Number(localStorage.getItem(LAST_KEY) || 0);
        if (Date.now() - last < THROTTLE_MS) return;
        localStorage.setItem(LAST_KEY, String(Date.now()));
      } catch {
        /* private mode — fall through and ping anyway */
      }
      apiRequest("POST", "/api/app-open", {}).catch(() => {});
    };

    ping(); // on mount / first authenticated load
    const onActive = () => ping();
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    // `phoebe:appactive` fires from the native shell on iOS resume;
    // visibilitychange covers web tab refocus + Capacitor WebView resume.
    window.addEventListener("phoebe:appactive", onActive);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("phoebe:appactive", onActive);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user]);

  return null;
}
