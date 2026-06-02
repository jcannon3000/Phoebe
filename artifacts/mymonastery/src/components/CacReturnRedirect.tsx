/**
 * After the reader opens the CAC reflection from the home card and comes back,
 * take them to the in-app reflection page (/reflect/cac) — who read today +
 * the journal.
 *
 * The home card sets a session flag via recordCacOpened({ flagReturn: true })
 * when it opens the reflection. When the WebView becomes visible again (the
 * in-app SFSafari reader is dismissed) or the app returns to the foreground,
 * we consume the flag once and navigate. It only fires for an actual CAC open
 * — never on a stray tab refocus — and never if they're already on the page.
 *
 * Mounted once, globally, inside the router (App.tsx).
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { CAC_JUST_READ_KEY } from "@/lib/cacReadState";

export function CacReturnRedirect() {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    const check = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      let flagged = false;
      try {
        flagged = sessionStorage.getItem(CAC_JUST_READ_KEY) === "1";
        if (flagged) sessionStorage.removeItem(CAC_JUST_READ_KEY);
      } catch { return; }
      if (flagged && location !== "/reflect/cac") setLocation("/reflect/cac");
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
