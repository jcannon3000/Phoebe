// breathGeohash — geohash helper for Cobreathe "same air".
//
// LOCATION REMOVED (App Store): Phoebe no longer requests device location at
// all. `getBreathBucket` / `getBreathCoords` are now null-returning stubs that
// never touch navigator.geolocation and never dispatch the native
// `phoebe:request-location` bridge event, so no iOS location prompt can fire.
// They are kept (rather than deleted) so existing callers — useCobreatheSync,
// BreathNearInvite — compile and simply no-op; every caller already guards on a
// null result. `encodeGeohash` stays exported because it's a pure helper still
// imported elsewhere.

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

// Location removed — no-op stub. Always resolves null; never prompts.
export function getBreathBucket(_opts: { force?: boolean } = {}): Promise<string | null> {
  return Promise.resolve(null);
}

// Location removed — no-op stub. Always resolves null; never prompts.
export function getBreathCoords(_opts: { force?: boolean } = {}): Promise<{ lat: number; lng: number } | null> {
  return Promise.resolve(null);
}
