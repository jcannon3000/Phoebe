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
 *  /api/auth/me so every consumer sees it); false when nothing changed.
 *  `force` goes past the once-per-install stamp (the hourly retry still
 *  applies) — see SIGNED_OUT_DAYS_BEFORE_ID. */
export async function ensureAnonymousUser(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!PHOEBE_GUEST_ENABLED) return false;
  try {
    if (localStorage.getItem(DONE_KEY) && !opts.force) return false;
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

/**
 * A PHONE THAT STAYS SIGNED OUT GETS AN ID AFTER MORE THAN TWO DAYS.
 *
 * The stamp above survives a logout on purpose, so a signed-out phone keeps
 * no session — and a phone with no session cannot be counted at all: every
 * prayer is refused 401 and dropped. Owner, 2026-09-15: "If they use it for
 * more then 2 days asign them an id." So the days a phone is used WITHOUT a
 * session are noted, and on the third distinct day it is given its device user
 * after all. A day with any session clears the count, so it starts again from
 * the next logout.
 */
export const SIGNED_OUT_DAYS_BEFORE_ID = 2;
const SIGNED_OUT_DAYS_KEY = "phoebe:signed-out-days";

function localYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Note today as a day this phone was used with no session; returns how many
 *  distinct such days there have been since it last had one. */
export function noteSignedOutDay(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(SIGNED_OUT_DAYS_KEY) ?? "[]");
    const days = new Set<string>(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
    days.add(localYmd());
    // Only the count matters past the threshold — keep the newest few.
    const kept = [...days].sort().slice(-(SIGNED_OUT_DAYS_BEFORE_ID + 1));
    localStorage.setItem(SIGNED_OUT_DAYS_KEY, JSON.stringify(kept));
    return kept.length;
  } catch { return 0; /* private mode — no memory of days, so no forced ID */ }
}

export function clearSignedOutDays(): void {
  try { localStorage.removeItem(SIGNED_OUT_DAYS_KEY); } catch { /* ignore */ }
}
