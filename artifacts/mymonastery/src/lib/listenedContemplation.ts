import { apiRequest, getQueryClient } from "@/lib/queryClient";
import { enqueueSession } from "@/lib/sessionOutbox";
import { addGuestSilenceMinutes } from "@/lib/guestSilenceLog";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import type { AuthUser } from "@/hooks/useAuth";

// ── Listened prayer, counted as contemplation time ──────────────────────────
//
// Owner, 2026-09-18, of Pray As You Go Daily: "when someone listens to it have
// it count towards their contemplation time too like breathing together does".
//
// Breathing Together logs its breath as a `surface: "contemplation"` prayer
// session with its own `source`, and a device-local guest's minutes go to the
// local silence tally the home's Silence card reads (pages/cobreathe, logSit).
// This is the same two steps for audio that is prayed rather than merely
// played — the one shape, so the silence goal, the contemplation stats, the
// history list and App Metrics all see it as the sit it is.
//
// The caller decides WHEN (the player credits at ≥60% heard, once per play)
// and passes the seconds ACTUALLY listened, not the episode's length: skipping
// to the end is not time spent in prayer.

/** Ignore a stray fraction of a minute — the tally is whole minutes. */
const MIN_SECONDS = 60;

/**
 * RESOLVES WHEN THE ROW HAS LANDED, so a caller can refresh the totals
 * AFTERWARDS (owner, 2026-09-23: "even the extra time is not displaying
 * initally when you go home, you have to refresh").
 *
 * This used to return nothing, and every caller invalidated the contemplation
 * queries on the next line — which refetched while the POST was still in
 * flight and cached the total from BEFORE the sit. React Query then held that
 * answer for its stale time, so the home showed the old number until the page
 * was reloaded by hand. The sit timer had always awaited its own POST
 * (ContemplationTimer); this path simply never did.
 *
 * It never rejects: a failed post is queued, which is still a promise kept.
 */
export function logListenedContemplation(opts: {
  seconds: number;
  /** Which practice the time came from, e.g. "payg" — the session's `source`. */
  source: string;
  user: AuthUser | null;
}): Promise<void> {
  const seconds = Math.round(opts.seconds);
  if (!Number.isFinite(seconds) || seconds < MIN_SECONDS) return Promise.resolve();

  // A phone with no account keeps its own tally; that is the only record it
  // has, and the home's Silence card reads it.
  if (isDeviceLocalGuest(opts.user)) addGuestSilenceMinutes(Math.floor(seconds / 60));
  // The ANONYMOUS DEVICE USER still has a real session, so it falls through
  // and logs like any account — without that, a phone without an account is
  // missing from the admin metrics (the same note cobreathe's logSit carries).
  if (!opts.user) return Promise.resolve();

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - seconds * 1000);
  const body = {
    surface: "contemplation",
    source: opts.source,
    durationSeconds: seconds,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    isPrivate: false,
  };
  // Queue rather than drop — prayer taken with no connection is still prayer
  // (reference_offline_sync_outboxes).
  return apiRequest("POST", "/api/prayer-sessions", body)
    .then(() => { /* landed */ })
    .catch(() => { enqueueSession(body); });
}

/**
 * Log it, then refresh what shows the total — the home's contemplation card,
 * the silence goal, the history list. One helper so no caller can forget the
 * second half, which is how Visio's and the icon sit's minutes sat invisible
 * until something else happened to refetch (owner, 2026-09-23).
 */
export function logListenedContemplationAndRefresh(opts: {
  seconds: number;
  source: string;
  user: AuthUser | null;
}): void {
  void logListenedContemplation(opts).then(() => {
    const qc = getQueryClient();
    if (!qc) return;
    qc.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
    qc.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
  });
}
