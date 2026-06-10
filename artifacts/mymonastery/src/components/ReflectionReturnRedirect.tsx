/**
 * After the reader opens a daily reflection from a home card and comes back,
 * take them to that reflection's in-app page:
 *   • CAC  → /reflect/cac (companion page: who-read-today + journal)
 *   • FDD  → /reflect/fdd (the FDD journey page: read-aloud + sit)
 *   • SSJE → /menu/reflections/ssje
 *
 * The home card stashes the destination path via recordCacOpened /
 * recordFddOpened / recordSsjeOpened ({ flagReturn: true }). When the WebView
 * becomes visible again (the in-app browser is dismissed) or the app returns to
 * the foreground, we consume the path once and navigate. It only fires for an
 * actual open — never on a stray tab refocus — and never if we're already on
 * the destination.
 *
 * Mounted once, globally, inside the router (App.tsx).
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { REFLECTION_RETURN_KEY } from "@/lib/cacReadState";

export function ReflectionReturnRedirect() {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    // Consume the stashed return path once and navigate to the in-app
    // reflection page. Shared by every trigger below.
    const consume = () => {
      let target: string | null = null;
      try {
        target = sessionStorage.getItem(REFLECTION_RETURN_KEY);
        if (target) sessionStorage.removeItem(REFLECTION_RETURN_KEY);
      } catch { return; }
      if (target && location !== target) setLocation(target);
    };
    // Web / app-foreground path: only act when the document is actually
    // visible (guards against a stray background refocus).
    const checkVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      consume();
    };
    document.addEventListener("visibilitychange", checkVisible);
    window.addEventListener("phoebe:appactive", checkVisible);
    // iOS in-app browser dismissal fires neither of the above (the app stayed
    // active under the SFSafariViewController overlay). The native shell emits
    // this dedicated event on Browser close — we know the reader just came
    // back, so consume unconditionally (next tick, after the WebView reveals).
    const onBrowserFinished = () => setTimeout(consume, 0);
    window.addEventListener("phoebe:browserfinished", onBrowserFinished);
    return () => {
      document.removeEventListener("visibilitychange", checkVisible);
      window.removeEventListener("phoebe:appactive", checkVisible);
      window.removeEventListener("phoebe:browserfinished", onBrowserFinished);
    };
  }, [location, setLocation]);
  return null;
}
