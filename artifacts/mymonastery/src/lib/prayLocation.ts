/**
 * Opt-in coarse location for the "places you've been prayed for" map.
 *
 * When the user has turned on location sharing (Settings) AND the OS grants
 * permission, tapping Amen attaches an approximate (~1 mile) location to the
 * amen. The map the person being prayed for sees then lights up where their
 * prayers came from.
 *
 * Privacy:
 *   - Strictly opt-in. Off until the user enables it; we cache that choice
 *     in localStorage ("phoebe:share-pray-location") so the Amen path can
 *     decide synchronously without ever touching geolocation when it's off.
 *   - Coarsened to 2 decimals (~1 mile) on-device before it ever leaves.
 *   - Fail-open to NULL: a denied/slow/unavailable fix never blocks the
 *     Amen — it just records without a location.
 *
 * Two acquisition paths, mirroring how the rest of the app reaches native:
 *   - Native shell → dispatch `phoebe:request-location`; the shell answers
 *     with `phoebe:location` / `phoebe:location-error` (Capacitor Geolocation).
 *   - Web → navigator.geolocation directly.
 */

import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";

const PREF_KEY = "phoebe:share-pray-location";
const TIMEOUT_MS = 8000;

const coarsen = (n: number) => Math.round(n * 100) / 100; // ~1 mile

/** Cache the server-side opt-in locally so the Amen path is synchronous. */
export function setSharePrayLocationCache(on: boolean): void {
  try {
    if (on) localStorage.setItem(PREF_KEY, "1");
    else localStorage.removeItem(PREF_KEY);
  } catch { /* private mode — best effort */ }
}

export function getSharePrayLocationCache(): boolean {
  try { return localStorage.getItem(PREF_KEY) === "1"; } catch { return false; }
}

/**
 * Resolve a coarse {lat,lng} the caller opted in to share, or null. Never
 * throws and never rejects — callers can `await` it inline before an Amen.
 * Pass force=true to skip the opt-in gate (used by Settings to trigger the
 * OS permission prompt in-context the moment the user flips it on).
 */
export function getCoarsePrayLocation(force = false): Promise<{ lat: number; lng: number } | null> {
  if (!force && !getSharePrayLocationCache()) return Promise.resolve(null);

  if (isNativeShell()) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v: { lat: number; lng: number } | null) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("phoebe:location", onLoc as EventListener);
        window.removeEventListener("phoebe:location-error", onErr);
        resolve(v);
      };
      const onLoc = (e: Event) => {
        const d = (e as CustomEvent).detail as { lat?: number; lng?: number } | undefined;
        if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) finish({ lat: coarsen(d.lat as number), lng: coarsen(d.lng as number) });
        else finish(null);
      };
      const onErr = () => finish(null);
      window.addEventListener("phoebe:location", onLoc as EventListener);
      window.addEventListener("phoebe:location-error", onErr);
      window.dispatchEvent(new CustomEvent("phoebe:request-location"));
      setTimeout(() => finish(null), TIMEOUT_MS);
    });
  }

  if (typeof navigator !== "undefined" && navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: coarsen(pos.coords.latitude), lng: coarsen(pos.coords.longitude) }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 10 * 60_000 },
      );
    });
  }
  return Promise.resolve(null);
}

const ASKED_KEY = "phoebe:pray-location-asked";

export function prayLocationAsked(): boolean {
  try { return localStorage.getItem(ASKED_KEY) === "1"; } catch { return false; }
}

export function markPrayLocationAsked(): void {
  try { localStorage.setItem(ASKED_KEY, "1"); } catch { /* best effort */ }
}

/**
 * After an Amen, offer the location-sharing invite ONCE — only if the user
 * hasn't already opted in and hasn't already been asked. A globally-mounted
 * <PrayLocationInvite> listens for the event and shows the soft pre-prompt.
 */
export function maybeOfferPrayLocation(): void {
  if (getSharePrayLocationCache() || prayLocationAsked()) return;
  try { window.dispatchEvent(new CustomEvent("phoebe:offer-pray-location")); } catch { /* noop */ }
}

/**
 * POST an Amen on a prayer request, attaching a coarse location when the user
 * opted in, then offer the one-time location invite (a no-op once they've
 * opted in or already been asked). Drop-in replacement for the bare amen call.
 */
export async function amenWithLocation(requestId: number | string): Promise<unknown> {
  const loc = await getCoarsePrayLocation();
  const res = await apiRequest("POST", `/api/prayer-requests/${requestId}/amen`, loc ?? {});
  maybeOfferPrayLocation();
  return res;
}
