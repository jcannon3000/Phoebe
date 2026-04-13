import { useState, useEffect } from "react";

/**
 * Demo feature flag hook. Activate by visiting any page with ?demo=<flag>
 * (e.g. ?demo=communities). Persists for the browser tab session via sessionStorage.
 */
export function useDemoFlag(flag: string): boolean {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(`demo:${flag}`) === "1";
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === flag) {
      sessionStorage.setItem(`demo:${flag}`, "1");
      setEnabled(true);
    }
  }, [flag]);

  return enabled;
}
