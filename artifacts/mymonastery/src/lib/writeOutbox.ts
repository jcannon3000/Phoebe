/**
 * writeOutbox — a write that could not be sent, kept until it can be.
 *
 * Marking a practice kept, un-keeping it, logging what you listened to: each
 * is local-first, so the screen is right immediately, and each then POSTs. The
 * POST retried once and gave up — fine for a flaky moment, wrong for a walk
 * with no signal, where the day was kept on the phone and the server never
 * heard. A peer put it exactly right while we were dividing this work: "a kept
 * practice that quietly un-keeps itself when the connection returns is the one
 * that would make someone distrust the whole rhythm."
 *
 * So the write waits here instead, and goes out when the connection does.
 * Modelled on lib/sessionOutbox (prayer sessions have had this for a while);
 * this one carries any method and path, and dedupes by a key the caller owns
 * so the same practice on the same day is only ever queued once.
 */
import { apiRequest, ApiError } from "./queryClient";
import { isReallyOnline } from "@/lib/offline";

const KEY = "phoebe:write-outbox";
const MAX_PENDING = 60;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Pending = {
  /** Dedupe key — "practice-done:visio:2026-09-06". Last write of a key wins. */
  id: string;
  method: "POST" | "DELETE" | "PUT";
  url: string;
  body?: Record<string, unknown>;
  at: number;
};

function read(): Pending[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return (parsed as Pending[]).filter((p) => p && p.id && p.url && p.method && (p.at ?? 0) > cutoff);
  } catch { return []; }
}

function write(list: Pending[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_PENDING))); } catch { /* private mode */ }
}

/** Queue a write. A later write with the same id REPLACES the earlier one —
 *  keeping then un-keeping a practice offline must not send both. */
export function enqueueWrite(id: string, method: Pending["method"], url: string, body?: Record<string, unknown>): void {
  const list = read().filter((p) => p.id !== id);
  list.push({ id, method, url, ...(body ? { body } : {}), at: Date.now() });
  write(list);
}

/** Drop a queued write — the caller sent it themselves after all. */
export function dropWrite(id: string): void {
  const list = read();
  const next = list.filter((p) => p.id !== id);
  if (next.length !== list.length) write(next);
}

export function pendingWriteCount(): number {
  return read().length;
}

let flushing = false;
/** Send what is waiting, oldest first. Safe to call often; no-ops offline. */
export async function flushWrites(): Promise<void> {
  if (flushing) return;
  // The app's own truth, not the WebView's: navigator.onLine reports true
  // in Airplane Mode, and it also meant the Simulate-offline switch could not
  // hold a queued write back for testing.
  if (!isReallyOnline()) return;
  const list = read();
  if (list.length === 0) return;
  flushing = true;
  try {
    for (const entry of list) {
      try {
        await apiRequest(entry.method, entry.url, entry.body);
        dropWrite(entry.id);
      } catch (err) {
        /**
         * A 4xx means THIS ENTRY will never be accepted — a signed-out device
         * with no row to write, a deleted target, or a body the server rejects.
         * Drop it and keep going.
         *
         * This used to drop only on 401/403/404, so a malformed body (a 400)
         * sat at the head of the queue and blocked every write behind it until
         * it aged out a week later. One bad entry must not cost the person
         * their whole offline day, so the rule is now "permanent means drop".
         *
         * 408 and 429 are the exceptions: both are explicitly "try again".
         */
        if (err instanceof ApiError && err.status >= 400 && err.status < 500
            && err.status !== 408 && err.status !== 429) {
          dropWrite(entry.id);
          continue;
        }
        // Anything else — still offline, or the server is down. Stop here and
        // keep the rest in order for the next attempt.
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/** Mounted once (App.tsx): flush on return of the connection, on app-active,
 *  and once on boot. Returns its own teardown. */
export function installWriteOutboxFlush(): () => void {
  const flush = () => { void flushWrites(); };
  window.addEventListener("online", flush);
  window.addEventListener("phoebe:appactive", flush);
  // Named, so the teardown below can actually remove it — an inline arrow
  // here leaked a listener on every remount.
  const onVisible = () => { if (document.visibilityState === "visible") flush(); };
  document.addEventListener("visibilitychange", onVisible);
  const boot = window.setTimeout(flush, 4000);
  return () => {
    window.clearTimeout(boot);
    window.removeEventListener("online", flush);
    window.removeEventListener("phoebe:appactive", flush);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
