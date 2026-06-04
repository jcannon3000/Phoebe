/**
 * After the reader opens a daily reflection from a home card and comes back,
 * take them to that reflection's in-app page:
 *   • CAC  → /reflect/cac (companion page: who-read-today + journal)
 *   • FDD  → /menu/reflections/fdd (the in-app reflection reader)
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
    const check = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      let target: string | null = null;
      try {
        target = sessionStorage.getItem(REFLECTION_RETURN_KEY);
        if (target) sessionStorage.removeItem(REFLECTION_RETURN_KEY);
      } catch { return; }
      if (target && location !== target) setLocation(target);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("phoebe:appactive", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("phoebe:appactive", check);
    };
  }, [location, setLocation]);
  return null;
}
