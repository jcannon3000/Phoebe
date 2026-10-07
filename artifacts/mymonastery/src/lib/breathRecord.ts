import { apiRequest, getQueryClient } from "@/lib/queryClient";
import { ensureAnonymousUser } from "@/lib/guestProvision";

/**
 * RECORD A BREATH — and make sure there is somebody to record it against.
 *
 * Breathing Together's count is COUNT(*) of breath_sessions for the day
 * (routes/breath.ts), so a breath that never reaches the server is a person
 * missing from the number everyone else is shown. Owner, 2026-10-07: "i am
 * not sure it is couting everyone who is breathing tiogether, because people
 * are breathing together and it is not showing" · "myabe its that they are
 * not signed in".
 *
 * That was exactly it. The row is user-keyed, so POST /breath/today 401s
 * without a session, and /cobreathe answered that by faking a success
 * (`{ ok: true, count: 1 }`) rather than showing "Your breath didn't save" —
 * the breath looked kept and was counted nowhere. A phone has no session when
 * its first-boot provisioning never landed (offline, or the per-IP limit on a
 * parish's wifi) or when someone signed OUT, since that stamp deliberately
 * survives a logout for two days.
 *
 * So: mint the anonymous DEVICE user first, the same machinery
 * welcome-public, overview-deck and routine-invite already use before their
 * own writes, and then record. An anonymous device user counts in the
 * communal breath like anyone else (owner, 2026-10-02: "make sure breathing
 * together is counting people who dont have accounts too").
 *
 * Returns the server's payload, or null when there was still no way to record
 * it — the caller decides what to show, and callers that used to fake a
 * success can keep doing so on null rather than painting an error over a
 * breath that really was prayed.
 */
export async function recordBreath<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    return await apiRequest<T>("POST", "/api/breath/today", body);
  } catch {
    // The one recoverable reason: no session. Provisioning is once per install
    // (guestProvision keeps its own stamp), so this is a no-op for a phone that
    // already has a device user and the retry below simply fails again.
    const made = await ensureAnonymousUser({ force: true }).catch(() => false);
    if (!made) return null;
    try {
      // Every consumer of /api/auth/me should see the new session.
      getQueryClient()?.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch { /* the POST below is what matters */ }
    try {
      return await apiRequest<T>("POST", "/api/breath/today", body);
    } catch {
      return null;
    }
  }
}
