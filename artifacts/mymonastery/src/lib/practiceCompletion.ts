import { apiRequest, ApiError, getQueryClient } from "@/lib/queryClient";
import { swellHaptic } from "@/lib/swellHaptic";
import { markRecentCompletion } from "@/lib/recentCompletion";
import { creditAnchorPractice } from "@/lib/officeManualLog";

// Tracks whether the user has completed an *optional* daily practice today —
// currently Gratitude and the Examen. These are the practices a user can add
// from the Customize flow to earn an extra Daily-progress checkmark.
//
// Mirrors lib/cacReadState.ts: localStorage for instant, offline-safe,
// per-device state (so the anchor flips the moment they finish) PLUS a
// best-effort server write to /api/practice-completion so the state syncs
// across devices and survives a cache purge. useRhythmState ORs the local
// flag with the server rows.
//
// "Today" is the user's LOCAL day (en-CA → ISO 2024-05-26), matching every
// other rhythm surface.

export type OptionalPractice = "examen" | "listening" | "reading" | "podcasts" | "walk" | "prayer-list" | "visio" | "icons" | "lectio";

function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Sunday on-or-before today, as YYYY-MM-DD in local time. The server's
// practice_completion row carries weekStart for the weekly-review rollup, and
// validates it as a date — so we send a real one rather than a placeholder.
function weekStartLocalISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // getDay(): 0 = Sunday
  return d.toLocaleDateString("en-CA");
}

const STORAGE_PREFIX = "phoebe:practice-done:";
// One shared event — listeners re-check whichever practices they care about.
export const PRACTICE_DONE_EVENT = "phoebe:practice-done";

function storageKey(section: OptionalPractice): string {
  return `${STORAGE_PREFIX}${section}`;
}

/** True if the user finished this practice today (local timezone), per the
 *  instant localStorage flag. OR this with the server rows for cross-device. */
export function hasPracticeDoneToday(section: OptionalPractice): boolean {
  try {
    return localStorage.getItem(storageKey(section)) === todayLocalISO();
  } catch {
    return false;
  }
}

/** Stamp this practice done for today locally + notify listeners, and
 *  best-effort sync to the server so it counts on the user's other devices.
 *  Idempotent: the server's unique (user, section, local_date) index makes a
 *  repeat call a no-op. */
export function markPracticeDoneToday(section: OptionalPractice): void {
  const localDate = todayLocalISO();
  const wasAlreadyDone = hasPracticeDoneToday(section);
  try {
    localStorage.setItem(storageKey(section), localDate);
    // Mutually exclusive with a "Not today" skip — done wins if the user
    // changes their mind and logs it after all.
    localStorage.removeItem(SKIP_PREFIX + section);
    window.dispatchEvent(new Event(PRACTICE_DONE_EVENT));
  } catch {
    /* private mode / quota — non-fatal */
  }
  // A fresh completion of a daily-routine practice → the swell haptic, and a
  // stamp so the home can play this card's completion moment. The optional
  // practice ids double as their home-card keys.
  if (!wasAlreadyDone) { swellHaptic(); markRecentCompletion(section); }
  // If this practice IS a side's anchor, completing it has to lift that side's
  // undo — otherwise the practice card goes green while the anchor stays in
  // Next for the rest of the day. See creditAnchorPractice for the report.
  try { creditAnchorPractice(section); } catch { /* non-fatal */ }
  // Sync to the server so OTHER devices see this completion — this write is
  // the ENTIRE cross-device sync mechanism (see useRhythmState's serverDone,
  // ORed with the local flag above). A silent failure here used to have zero
  // visibility: the local flag flips regardless (so the logging device shows
  // "done" no matter what), so a dropped network call looked identical to
  // success — reported as "logged on web, didn't show on mobile." One retry
  // after a short delay covers a transient blip; if it still fails, at least
  // log it so a real failure is diagnosable instead of silently invisible.
  const payload = { section, localDate, weekStart: weekStartLocalISO() };
  const post = () => apiRequest("POST", "/api/practice-completion", payload);
  post().catch(() => {
    setTimeout(() => {
      post().catch((err) => {
        /**
         * A 401 is not a sync failure — it's a signed-out guest, who has no
         * account to sync TO. The public no-login version is live, and its
         * cards call this like any other; alarming someone that their prayer
         * "failed to sync" when there was never anywhere to send it is both
         * untrue and unactionable. The local flag has already credited them,
         * which is the whole rhythm for a guest. Every sibling writer
         * (cacReadState's session posts, the office log) swallows this case
         * silently; only this one spoke up.
         */
        // Read the STATUS, not the message. ApiError.message is the response
        // BODY's `error` field, and this route answers `not_authenticated` —
        // which "Not authenticated" (space, not underscore) never matched, so
        // the guard was inert and guests still got the toast.
        if (err instanceof ApiError && err.status === 401) return;
        console.error(`[practiceCompletion] sync failed for "${section}" after retry:`, err);
        // Visible, not just logged — nobody's going to open dev tools to
        // notice a cross-device sync silently failed. A toast (wired up by
        // PracticeSyncFailedToast in App.tsx) is the only way this failure
        // becomes something the user can actually act on (retry, or at
        // least not be confused when another device doesn't show it done).
        try {
          window.dispatchEvent(new CustomEvent(PRACTICE_SYNC_FAILED_EVENT, { detail: { section } }));
        } catch { /* non-fatal */ }
      });
    }, 3000);
  });
}

// Fired when BOTH the initial write and the one retry fail — see
// markPracticeDoneToday above. Listened for globally (App.tsx) to surface
// a toast, since this failure is otherwise invisible to the user.
export const PRACTICE_SYNC_FAILED_EVENT = "phoebe:practice-sync-failed";

/** Undo today's mark — same shape as markPracticeDoneToday, mirrored for the
 *  opposite direction: clear the local flag first (instant, offline-safe),
 *  then best-effort DELETE the server row with the same one-retry +
 *  visible-failure pattern. Idempotent — deleting a row that's already
 *  gone is a no-op server-side. */
export function unmarkPracticeDoneToday(section: OptionalPractice): void {
  try {
    localStorage.removeItem(storageKey(section));
    window.dispatchEvent(new Event(PRACTICE_DONE_EVENT));
  } catch {
    /* private mode / quota — non-fatal */
  }
  const localDate = todayLocalISO();
  /**
   * THE CACHED SERVER ROWS MUST FORGET THIS TOO, immediately. A card's done
   * is `localFlag || serverDone`, and serverDone reads the React-Query cache
   * of /api/practice-completion — so clearing the flag and DELETEing the row
   * left THIS device's cache still carrying today's row, and the card sat in
   * Done until some later refetch. Reported: "I tried to unlog some
   * practices on iOS and they didn't move — but they showed up unlogged on
   * the web" (the web was a fresh fetch; the phone was the stale cache).
   * Drop the row from every cached page synchronously, then invalidate so
   * the server's truth reconciles behind it.
   */
  try {
    const qc = getQueryClient();
    qc?.setQueriesData(
      { queryKey: ["/api/practice-completion"] },
      (old: unknown) => {
        const o = old as { completions?: Array<{ section?: string; localDate?: string }> } | undefined;
        if (!o?.completions) return old;
        return { ...o, completions: o.completions.filter((c) => !(c.section === section && c.localDate === localDate)) };
      },
    );
    void qc?.invalidateQueries({ queryKey: ["/api/practice-completion"] });
  } catch { /* non-fatal — the refetch on next focus still reconciles */ }
  const del = () => apiRequest("DELETE", "/api/practice-completion", { section, localDate });
  del().catch(() => {
    setTimeout(() => {
      del().catch((err) => {
        // Same as the mark path above: a signed-out guest has no server row to
        // delete, so a 401 here is expected, not a failure to report.
        if (err instanceof ApiError && err.status === 401) return;
        console.error(`[practiceCompletion] un-sync failed for "${section}" after retry:`, err);
        try {
          window.dispatchEvent(new CustomEvent(PRACTICE_SYNC_FAILED_EVENT, { detail: { section } }));
        } catch { /* non-fatal */ }
      });
    }, 3000);
  });
}

/** Tap-to-check, tap-to-undo — a real toggle rather than a one-way stamp,
 *  matching how a custom "Create your own" anchor's card behaves
 *  (toggleCustomDoneToday, lib/customAnchors.ts) and markCustomPrayed/
 *  unmarkCustomPrayed (lib/cacReadState.ts). Reads the CURRENT local flag
 *  (not a server round-trip) so the decision is instant. */
export function togglePracticeDoneToday(section: OptionalPractice): void {
  if (hasPracticeDoneToday(section)) unmarkPracticeDoneToday(section);
  else markPracticeDoneToday(section);
}

// "Not today" — the user logged that they're skipping this practice today,
// same concept as lib/customAnchors.ts's SKIP_PREFIX. A skipped practice
// drops out of the Next list entirely for the day (not just "not done"),
// same as a skipped custom anchor — it was previously calling
// unmarkPracticeDoneToday, which just cleared a flag that was already unset
// (the card was never marked done), so the button had no visible effect.
// Local-only, like the done stamp's instant flag; no server sync — a
// skipped day isn't meaningful history to carry across devices.
const SKIP_PREFIX = "phoebe:practice-skip:";

export function hasPracticeSkippedToday(section: OptionalPractice): boolean {
  try {
    return localStorage.getItem(SKIP_PREFIX + section) === todayLocalISO();
  } catch {
    return false;
  }
}

/** Mutually exclusive with markPracticeDoneToday — skipping also clears
 *  any done stamp for today (matching customAnchors' "done wins" rule,
 *  applied here in reverse since a fresh skip should win over a stale done). */
export function setPracticeNotToday(section: OptionalPractice): void {
  try {
    localStorage.setItem(SKIP_PREFIX + section, todayLocalISO());
    localStorage.removeItem(storageKey(section));
    window.dispatchEvent(new Event(PRACTICE_DONE_EVENT));
  } catch {
    /* private mode / quota — non-fatal */
  }
}
