import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { isNativeShell } from "@/lib/isNativeShell";

/**
 * Surfaces foreground push notifications as an in-app toast — WEB ONLY.
 *
 * On the web, a push that arrives while the tab is focused shows no OS
 * banner, so the only way to make it visible is to render it in-app. The
 * push pipeline dispatches a `phoebe:push-received` window event and we
 * turn it into a toast.
 *
 * In the native iOS app we deliberately do NOT render this. The OS already
 * shows its own foreground banner (capacitor.config `presentationOptions`
 * includes "alert"), so an in-app toast on top of the system notification
 * is just a duplicate — the user asked for the push, not two banners. The
 * native shell may still dispatch `phoebe:push-received`, but we ignore it
 * here on native and let the OS notification stand on its own.
 *
 * This component renders nothing; it only wires the effect.
 */
export function ForegroundPushToast() {
  useEffect(() => {
    // Web-only. On native the OS foreground banner already shows the push,
    // so surfacing an in-app toast as well would double it up.
    if (isNativeShell()) return;

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
      });
      // Auto-dismiss after 5s — this is a transient "a push just arrived"
      // banner, not a permanent toast.
      setTimeout(() => t.dismiss(), 5000);
      // `path` is parsed/validated but tap-routing isn't wired yet; keep it
      // referenced so the intent is clear and the lint stays quiet.
      void path;
    };
    window.addEventListener("phoebe:push-received", handler);
    return () => window.removeEventListener("phoebe:push-received", handler);
  }, []);

  return null;
}
