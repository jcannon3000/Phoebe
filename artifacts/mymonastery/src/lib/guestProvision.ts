// PUBLIC no-login version — silent anonymous-device-user provisioning.
//
// On first guest boot we POST /api/auth/anonymous once: the server creates a
// credential-less user row (is_anonymous) and issues the normal session cookie,
// so push-token registration, the daily-reminder bell, and prefs/routine sync
// all work through the existing user-keyed machinery — while the UX stays
// completely login-free ("the device inherently has a user id"). A later real
// sign-in just replaces the session.
//
// Stamped on SUCCESS only; failed attempts retry, but no more than once per
// hour so an offline install doesn't hammer the endpoint (which is itself
// rate-limited per-IP).

import { apiRequest } from "@/lib/queryClient";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";

const DONE_KEY = "phoebe:anon-provisioned";
const LAST_TRY_KEY = "phoebe:anon-provision-last-try";

/** Returns true when a session was just created (caller should invalidate
 *  /api/auth/me so every consumer sees it); false when nothing changed. */
export async function ensureAnonymousUser(): Promise<boolean> {
  if (!PHOEBE_GUEST_ENABLED) return false;
  try {
    if (localStorage.getItem(DONE_KEY)) return false;
    const last = parseInt(localStorage.getItem(LAST_TRY_KEY) ?? "0", 10);
    if (Number.isFinite(last) && Date.now() - last < 60 * 60 * 1000) return false;
    localStorage.setItem(LAST_TRY_KEY, String(Date.now()));
  } catch { /* private mode — try anyway, without throttling */ }
  try {
    await apiRequest("POST", "/api/auth/anonymous", {});
    try { localStorage.setItem(DONE_KEY, "1"); } catch { /* ignore */ }
    return true;
  } catch { return false; /* offline / rate-limited — retried on a later boot */ }
}
