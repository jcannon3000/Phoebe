// A tiny durable outbox for prayer-session writes.
//
// WHY: the app had no write queue at all. Query-client mutations are
// `retry: false`, the service worker ignores every non-GET, and each of these
// writes flips an instant LOCAL flag before firing — so an offline or failed
// POST vanished silently while the checkmark stayed on screen. The worst case
// was a contemplation sit: `recordSession` marked itself recorded BEFORE the
// network call, so a failed save could never be retried and twenty minutes of
// silence was simply gone, with the closing screen still congratulating you.
// (2026-07-21 data audit.)
//
// This is deliberately small: a localStorage queue of prayer-session payloads,
// flushed on app start, when the browser comes back online, and on app-active.
// It is a safety net for the failure path, NOT a general offline sync layer —
// callers keep their normal POST and only enqueue when that POST fails, so the
// success path is completely unchanged.
import { apiRequest, ApiError } from "./queryClient";

const KEY = "phoebe:session-outbox";
/** Bound the queue so a long offline stretch can't fill localStorage. Oldest
 *  entries are dropped first; a lost sit is bad, a bricked app is worse. */
const MAX_PENDING = 50;

type Pending = { id: string; body: Record<string, unknown> };

function read(): Pending[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Pending[]).filter((p) => p && p.id && p.body) : [];
  } catch {
    return [];
  }
}

function write(list: Pending[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_PENDING)));
  } catch {
    /* private mode / quota — the sit is already lost at this point; don't throw */
  }
}

/** Queue a prayer-session payload whose POST failed, so a later flush retries
 *  it. Pass a stable `id` when the same logical session can be enqueued from
 *  two places (e.g. pagehide and unmount) so it is only ever sent once. */
export function enqueueSession(body: Record<string, unknown>, id?: string): void {
  const entryId = id ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const list = read();
  if (list.some((p) => p.id === entryId)) return;
  list.push({ id: entryId, body });
  write(list);
}

/** The ids still waiting to be sent — what lets a screen count a sit that the
 *  server has not heard about yet (lib/contemplationPending). */
export function pendingSessionIds(): string[] {
  return read().map((p) => p.id);
}

let flushing = false;

/** Best-effort: POST everything queued, dropping each entry that lands. A
 *  network failure keeps the entry for the next flush; a 4xx drops it, since
 *  replaying a payload the server rejected will never succeed. */
export async function flushSessions(): Promise<void> {
  if (flushing) return;
  const list = read();
  if (list.length === 0) return;
  flushing = true;
  try {
    const survivors: Pending[] = [];
    for (const entry of list) {
      try {
        await apiRequest("POST", "/api/prayer-sessions", entry.body);
      } catch (err) {
        /**
         * Keep it only if this looks retryable — read the STATUS.
         *
         * This used to regex the message for a 3-digit number, but
         * ApiError.message is the response BODY's `error` field, and nothing in
         * this endpoint's failure vocabulary ("Unauthorized",
         * "not_authenticated", "Invalid input") contains digits at all. So
         * `permanent` was never true and a hard reject survived forever: a
         * signed-out guest's every office and sit queued and then replayed on
         * every app start, every reconnect and every foreground, up to the
         * 50-entry cap. Silent, but a standing request storm.
         */
        const permanent = err instanceof ApiError && err.status >= 400 && err.status < 500;
        if (!permanent) survivors.push(entry);
      }
    }
    write(survivors);
  } finally {
    flushing = false;
  }
}

/** Flush now and whenever the device comes back online / the app resumes.
 *  Returns an unsubscribe fn; the app keeps it for its whole life. */
export function installSessionOutboxFlush(): () => void {
  const onFlush = () => { void flushSessions(); };
  onFlush();
  window.addEventListener("online", onFlush);
  window.addEventListener("phoebe:appactive", onFlush);
  return () => {
    window.removeEventListener("online", onFlush);
    window.removeEventListener("phoebe:appactive", onFlush);
  };
}
