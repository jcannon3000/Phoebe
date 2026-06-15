// Opt-in coarse (~1 mile) location for Cobreathe.
//
// Reuses the native bridge wired in phoebe-mobile's native-shell
// (`wireNativeLocation`): we dispatch `phoebe:request-location` and await
// `phoebe:location` { lat, lng } / `phoebe:location-error`. On the web (no
// native shell) we fall back to the browser Geolocation API. Coordinates are
// coarsened to ~1 mile BEFORE they ever leave the device, so we never store or
// transmit a precise fix.

import { isNativeShell } from "@/lib/isNativeShell";

export type Coords = { lat: number; lng: number };

// Round to ~0.01° (≈1.1 km) — coarse enough to anchor a nearby church without
// pinning the person's exact spot.
function coarsen(c: Coords): Coords {
  return { lat: Math.round(c.lat * 100) / 100, lng: Math.round(c.lng * 100) / 100 };
}

// Resolve a coarse fix, or null if unavailable / denied / timed out. Never
// throws and never blocks for long. `force` asks the OS even if the native side
// would normally throttle the prompt — pass it for an explicit opt-in tap.
export function getCoarseLocation(force = false): Promise<Coords | null> {
  if (isNativeShell()) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (c: Coords | null) => {
        if (done) return;
        done = true;
        window.removeEventListener("phoebe:location", onLoc as EventListener);
        window.removeEventListener("phoebe:location-error", onErr);
        clearTimeout(timer);
        resolve(c ? coarsen(c) : null);
      };
      const onLoc = (e: Event) => {
        const d = (e as CustomEvent).detail as Coords | undefined;
        finish(d && Number.isFinite(d.lat) && Number.isFinite(d.lng) ? d : null);
      };
      const onErr = () => finish(null);
      window.addEventListener("phoebe:location", onLoc as EventListener);
      window.addEventListener("phoebe:location-error", onErr);
      const timer = setTimeout(() => finish(null), 10000);
      window.dispatchEvent(new CustomEvent("phoebe:request-location", { detail: { force } }));
    });
  }
  // Web fallback (e.g. previewing in a browser).
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(coarsen({ lat: pos.coords.latitude, lng: pos.coords.longitude })),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
      );
    });
  }
  return Promise.resolve(null);
}
