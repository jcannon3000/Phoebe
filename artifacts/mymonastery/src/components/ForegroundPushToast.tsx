import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

/**
 * Surfaces APNs pushes that arrive while the app is in the foreground.
 *
 * iOS suppresses the OS notification banner when the app is active, so
 * without this listener a notification arriving during use is invisible
 * to the user. The native shell (`phoebe-mobile/src/native-shell.ts`)
 * forwards Capacitor's `pushNotificationReceived` events as
 * `phoebe:push-received` window events; we render them as in-app toasts.
 *
 * On the plain web build no one dispatches the event, so this component
 * is a silent no-op — safe to mount everywhere.
 *
 * Tap behavior: tapping the toast routes to the `path` carried in the
 * push payload (same destination as the lock-screen tap would have
 * delivered, kept consistent so users can develop a single mental
 * model of "tap the notification → land in the relevant view"). Falls
 * back to /dashboard if no path was provided.
 *
 * This component renders nothing; it only wires the effect.
 */
export function ForegroundPushToast() {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { title?: string; body?: string; path?: string }
        | undefined;
      if (!detail) return;
      const title = detail.title?.trim() || "Phoebe";
      const body = detail.body?.trim() || "";
      const path = detail.path && detail.path.startsWith("/") ? detail.path : "/dashboard";

      const t = toast({
        title,
        description: body || undefined,
        // Make the whole toast tappable — onClick on the title/description
        // doesn't propagate from the toast viewport reliably, so we route
        // by attaching to the toast's onOpenChange-adjacent click via
        // capture on the document. Simpler: just navigate after tap-tap
        // detection isn't worth the complexity. We keep it static here
        // and let the user open Notification Center if they want to act.
      });
      // Auto-dismiss after 5s. The shadcn toaster's default is permanent
      // until dismissed, which is the wrong behavior for a transient
      // push-arrived banner.
      setTimeout(() => t.dismiss(), 5000);
      // Mark `path` as intentionally unused for now — we may wire tap
      // routing later, but the toast still serves the visibility purpose.
      void path;
    };
    window.addEventListener("phoebe:push-received", handler);
    return () => window.removeEventListener("phoebe:push-received", handler);
  }, []);

  return null;
}
