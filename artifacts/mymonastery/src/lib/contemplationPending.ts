/**
 * A SIT THE SERVER HAS NOT HEARD ABOUT YET.
 *
 * Owner: "make sure contemplation sessions are saving offline." They were —
 * the timer already queues the session (lib/sessionOutbox) and it goes out
 * with the connection. What it did NOT do was count: the minutes on the card
 * come from the server's tally, so twenty minutes sat in Airplane Mode left
 * the day reading exactly as it had before, and the sit looked lost.
 *
 * So a queued sit is remembered here with the same id the outbox holds, and
 * the tally adds it until the send lands. There is no bookkeeping to get
 * wrong: an entry counts only while its id is still IN the outbox, so a
 * successful flush removes it by itself.
 */
import { pendingSessionIds } from "@/lib/sessionOutbox";

const KEY = "phoebe:contemplation-pending";
const MAX = 40;

type Pending = { id: string; ymd: string; seconds: number };

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function read(): Pending[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Pending[]).filter((p) => p && p.id && p.ymd) : [];
  } catch { return []; }
}

function write(list: Pending[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* private mode */ }
}

export const CONTEMPLATION_PENDING_EVENT = "phoebe:contemplation-pending";

/** Remember a sit whose session could not be sent. `id` must be the id the
 *  outbox was given, so the two rise and fall together. */
export function recordPendingSit(id: string, seconds: number): void {
  if (!id || !Number.isFinite(seconds) || seconds <= 0) return;
  const list = read().filter((p) => p.id !== id);
  list.push({ id, ymd: todayYmd(), seconds: Math.round(seconds) });
  write(list);
  try { window.dispatchEvent(new Event(CONTEMPLATION_PENDING_EVENT)); } catch { /* ignore */ }
}

/** Seconds sat today that the server has not confirmed. Self-cleaning: an
 *  entry counts only while the outbox still holds its id. */
export function pendingSecondsToday(): number {
  const list = read();
  if (list.length === 0) return 0;
  const waiting = new Set(pendingSessionIds());
  const today = todayYmd();
  const live = list.filter((p) => waiting.has(p.id));
  // Anything the outbox has forgotten has been sent (or given up on) — drop it
  // so the tally can't double-count once the server's own total includes it.
  if (live.length !== list.length) write(live);
  return live.filter((p) => p.ymd === today).reduce((n, p) => n + p.seconds, 0);
}
