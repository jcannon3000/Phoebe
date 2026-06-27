import { apiRequest } from "@/lib/queryClient";
import { swellHaptic } from "@/lib/swellHaptic";

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

export type OptionalPractice = "gratitude" | "examen" | "listening" | "journaling" | "lectio" | "reading" | "podcasts" | "walk" | "prayer-list" | "scripture";

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
    window.dispatchEvent(new Event(PRACTICE_DONE_EVENT));
  } catch {
    /* private mode / quota — non-fatal */
  }
  // A fresh completion of a daily-routine practice → the swell haptic.
  if (!wasAlreadyDone) swellHaptic();
  // Fire-and-forget; an unauthenticated/offline call just no-ops.
  void apiRequest("POST", "/api/practice-completion", {
    section,
    localDate,
    weekStart: weekStartLocalISO(),
  }).catch(() => { /* best effort */ });
}
