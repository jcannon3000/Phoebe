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

/**
 * STAYED A MINUTE (owner, 2026-10-01: "anyone who stayed on the app for more
 * then a minute and didnt click on a practice lets just count as a practice").
 *
 * The client times its own VISIBLE seconds - a hidden tab or a backgrounded app
 * does not count - adds them up across the day, and the first time the total
 * reaches sixty it pings POST /api/app-engaged once. App Metrics then counts the
 * person as having used the app (lib/appMetricsSql, the "engaged" item).
 *
 * CUMULATIVE, NOT ONE SITTING: three twenty-second looks across a day are a
 * minute. It is also not tied to being on the home screen - time inside a
 * practice counts too, which is harmless: someone in a practice has a record of
 * their own, and this only has to catch the people who have none.
 *
 * Keys sit under "phoebe:guest-" so the logout wipe takes them with the rest of
 * that family: a phone handed to someone else must not carry the last person's
 * seconds, or their "already counted today".
 */
const ENGAGED_AFTER_S = 60;
const TICK_S = 5;
const DWELL_PREFIX = "phoebe:guest-dwell:";
const ENGAGED_SENT_KEY = "phoebe:guest-engaged-sent";
const todayLocal = (): string => {
  try { return new Date().toLocaleDateString("en-CA"); } catch { return ""; }
};

export function AppOpenTracker() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (userId == null) return;
    let inFlight = false;
    let lastAttempt = 0;
    const tick = () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      const day = todayLocal();
      if (!day) return;
      const stamp = `${userId}:${day}`;
      try {
        if (localStorage.getItem(ENGAGED_SENT_KEY) === stamp) return;
        // Yesterday's seconds are of no use; drop them rather than let them pile up.
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(DWELL_PREFIX) && k !== DWELL_PREFIX + stamp) localStorage.removeItem(k);
        }
        const total = Number(localStorage.getItem(DWELL_PREFIX + stamp) || 0) + TICK_S;
        localStorage.setItem(DWELL_PREFIX + stamp, String(total));
        // At most one attempt a minute, so a rejected ping cannot become a loop.
        if (total >= ENGAGED_AFTER_S && Date.now() - lastAttempt > 60_000) {
          lastAttempt = Date.now();
          inFlight = true;
          apiRequest("POST", "/api/app-engaged", { day })
            .then(() => { try { localStorage.setItem(ENGAGED_SENT_KEY, stamp); } catch { /* retried next minute */ } })
            .catch(() => { /* not recorded; the next attempt is a minute away */ })
            .finally(() => { inFlight = false; });
        }
      } catch {
        /* private mode: no storage to add seconds into, so nothing to count */
      }
    };
    const id = window.setInterval(tick, TICK_S * 1000);
    return () => window.clearInterval(id);
  }, [userId]);

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
