/**
 * Location feature removed.
 *
 * The app no longer asks users for their location, never attaches one to a
 * prayer, and the "prayed-for map" is gone. These exports are kept as inert
 * no-ops so existing call sites (Amen handlers, settings) keep compiling — an
 * Amen now posts with no location and never shows a location prompt.
 */

import { apiRequest } from "@/lib/queryClient";

/** No-op — location sharing has been removed. */
export function setSharePrayLocationCache(_on: boolean): void {
  /* removed */
}

/** Always false — location sharing has been removed. */
export function getSharePrayLocationCache(): boolean {
  return false;
}

/** Location feature removed — never requests the user's location. */
export function getCoarsePrayLocation(_force = false): Promise<{ lat: number; lng: number } | null> {
  return Promise.resolve(null);
}

/** Treat as already-asked so nothing ever prompts for location. */
export function prayLocationAsked(): boolean {
  return true;
}

export function markPrayLocationAsked(): void {
  /* removed */
}

/** Location feature removed — never offers the location-sharing prompt. */
export function maybeOfferPrayLocation(): void {
  /* removed */
}

/**
 * POST an Amen on a prayer request — no location attached. Kept as a drop-in
 * replacement for the bare amen call used across the app.
 */
export async function amenWithLocation(requestId: number | string): Promise<unknown> {
  return apiRequest("POST", `/api/prayer-requests/${requestId}/amen`, {});
}
