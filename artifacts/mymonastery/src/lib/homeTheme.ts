// EXPERIMENTAL home-screen theme — a device-local super-admin toggle to preview
// a "Water" (blue-shaded) home instead of the default green. Device-local (not
// synced): it's a visual experiment, not routine state, and only shown to super
// admins in Settings. Applied in components/layout.tsx (a mix-blend blue wash +
// a water backdrop photo on the home) so it needs no re-theming of the many
// hardcoded green colors across the dashboard.
import { useEffect, useState } from "react";

export type HomeTheme = "default" | "water";
const KEY = "phoebe:home-theme";
export const HOME_THEME_EVENT = "phoebe:home-theme-changed";

export function getHomeTheme(): HomeTheme {
  try {
    return localStorage.getItem(KEY) === "water" ? "water" : "default";
  } catch {
    return "default";
  }
}

export function setHomeTheme(t: HomeTheme): void {
  try {
    localStorage.setItem(KEY, t);
    window.dispatchEvent(new Event(HOME_THEME_EVENT));
  } catch {
    /* private mode — non-fatal */
  }
}

/** Live-updating home theme — re-reads on the change event + cross-tab storage. */
export function useHomeTheme(): HomeTheme {
  const [theme, setTheme] = useState<HomeTheme>(getHomeTheme);
  useEffect(() => {
    const sync = () => setTheme(getHomeTheme());
    window.addEventListener(HOME_THEME_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(HOME_THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return theme;
}
