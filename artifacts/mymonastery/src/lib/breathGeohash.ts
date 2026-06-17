// breathGeohash — coarse "same air" location for Cobreathe. The ONLY job here is
// to turn a one-shot device fix into a 5-char geohash (~5km cell) and hand back
// JUST that bucket. Raw latitude/longitude never leave this function: we encode
// before returning, so app code, the network, and the server only ever see a
// coarse cell — never coordinates. Used only when the user has opted in
// (shareBreathLocation) and the feature is beta-gated at the call site.
import { isNativeShell } from "@/lib/isNativeShell";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"; // geohash alphabet (no a,i,l,o)

// Standard geohash encode. precision 5 ≈ a 4.9km × 4.9km cell — coarse enough
// that the bucket names an *area*, never a place.
export function encodeGeohash(lat: number, lng: number, precision = 5): string {
  let idx = 0, bit = 0, evenBit = true, geohash = "";
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { geohash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return geohash;
}

// Resolve a coarse bucket for the breath, or null if unavailable / denied.
// `force` (true from the explicit opt-in / Settings) always prompts; false (the
// quiet in-breath path) defers to the native bridge's once-a-day prompt cap.
export function getBreathBucket(opts: { force?: boolean } = {}): Promise<string | null> {
  const { force = false } = opts;

  // Native shell: go through the location bridge (handles the iOS permission
  // sheet + the daily prompt cap). Await a single location / error event.
  if (isNativeShell()) {
    return new Promise<string | null>((resolve) => {
      let done = false;
      const finish = (val: string | null) => {
        if (done) return; done = true;
        window.removeEventListener("phoebe:location", onLoc as EventListener);
        window.removeEventListener("phoebe:location-error", onErr);
        clearTimeout(timer);
        resolve(val);
      };
      const onLoc = (e: Event) => {
        const d = (e as CustomEvent).detail as { lat?: number; lng?: number } | undefined;
        if (d && typeof d.lat === "number" && typeof d.lng === "number") finish(encodeGeohash(d.lat, d.lng, 5));
        else finish(null);
      };
      const onErr = () => finish(null);
      window.addEventListener("phoebe:location", onLoc as EventListener);
      window.addEventListener("phoebe:location-error", onErr);
      const timer = setTimeout(() => finish(null), 10_000);
      window.dispatchEvent(new CustomEvent("phoebe:request-location", { detail: { force } }));
    });
  }

  // Web fallback: the browser geolocation prompt.
  return new Promise<string | null>((resolve) => {
    try {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(encodeGeohash(pos.coords.latitude, pos.coords.longitude, 5)),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
      );
    } catch { resolve(null); }
  });
}
