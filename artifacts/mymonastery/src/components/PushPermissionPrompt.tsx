import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useGuestMode } from "@/hooks/useGuestMode";
import { isNativeShell } from "@/lib/isNativeShell";
import { apiRequest } from "@/lib/queryClient";

/**
 * One-time push-permission nudge for the native iOS shell.
 *
 * The Capacitor `native-shell.ts` listens for the `phoebe:request-push-permission`
 * event: it then calls `PushNotifications.requestPermissions()`, registers
 * with APNs, and POSTs the device token to `/api/push/device-token`. On the
 * plain web build no one listens, so dispatching the event is a silent
 * no-op — safe to fire everywhere.
 *
 * Gating:
 *   1. Signed-in users — anywhere, as always. PLUS the PUBLIC no-login
 *      GUEST (flag on, signed out): with no onboarding to carry the ask,
 *      their first landing on the home (/dashboard, right after the seed)
 *      is where the app asks. The OS-level grant is the whole point for a
 *      guest — /api/push/device-token requires a user id, so their APNs
 *      token is NOT stored (server reminders can't reach them yet); the
 *      permission still powers local notifications now (e.g. the
 *      contemplation end-of-sit bell) and means a later beta sign-in
 *      registers the token without a second system dialog.
 *   2. Only once per install — we stamp localStorage after dispatching.
 *      If the user declines at the iOS system dialog we don't re-prompt;
 *      they can re-enable from Settings → Notifications → Phoebe. The key
 *      is device-scoped, so a guest who was asked isn't re-asked after
 *      signing in.
 *   3. After a 2-second delay — lets the dashboard render first so the
 *      permission sheet doesn't stack on top of an empty screen at
 *      launch.
 *
 * This component renders nothing; it only exists to run the effect.
 */
export function PushPermissionPrompt() {
  const { user } = useAuth();
  const { isGuest } = useGuestMode();

  // A GUEST'S ask now waits until they've prayed their FIRST office (after the
  // first-run intro + office), not their first landing on the home — front-
  // loading a system dialog before any value was shown reads as spammy. We
  // gate on the server "days of prayer" (the same signal the streak card and
  // welcome card read; React Query dedupes). Only queried for a native guest
  // who hasn't been asked yet, so it's a no-op for web / signed-in / done.
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const alreadyAsked = (() => { try { return localStorage.getItem("phoebe:push-prompt-asked") === "1"; } catch { return true; } })();
  const guestNative = !user && isGuest && isNativeShell() && !alreadyAsked;
  const { data: prayerDays } = useQuery<{ streak: number; last7: number; keptToday: boolean }>({
    queryKey: ["/api/me/prayer-days", tz],
    queryFn: () => apiRequest("GET", `/api/me/prayer-days?tz=${encodeURIComponent(tz)}`),
    enabled: guestNative,
    staleTime: 60_000,
  });
  const guestHasPrayed = !!prayerDays && (prayerDays.keptToday || prayerDays.last7 > 0 || prayerDays.streak > 0);

  useEffect(() => {
    if (!user && !isGuest) return;

    // Only native shell — web browsers don't need this.
    if (!isNativeShell()) return;

    // One-shot per device — key is device-scoped, not user-scoped, so
    // signing out and back in as the same user doesn't re-prompt.
    const KEY = "phoebe:push-prompt-asked";
    if (localStorage.getItem(KEY) === "1") return;

    // Guest: hold the ask until the first office is prayed (see above).
    // Signed-in users keep the ask-anywhere behavior.
    if (!user && !guestHasPrayed) return;

    const timer = window.setTimeout(() => {
      // A GUEST'S ask fires on the home screen — fire only when the 2s tick
      // catches them on /dashboard (where they land after the office).
      // Elsewhere (a deep link), nothing is stamped — the next launch re-arms.
      // Signed-in users keep the ask-anywhere behavior; checked at FIRE time
      // (window.location, not a hook dep) so their effect lifecycle is untouched.
      if (!user && window.location.pathname !== "/dashboard") return;
      try {
        window.dispatchEvent(new Event("phoebe:request-push-permission"));
        localStorage.setItem(KEY, "1");
      } catch {
        // non-fatal; we'll retry on the next launch
      }
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [user, isGuest, guestHasPrayed]);

  return null;
}
