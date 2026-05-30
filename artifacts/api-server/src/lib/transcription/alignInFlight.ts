// Process-local guard for on-demand alignment.
//
// When a client opens the office read-along (or Reflect & Sit) before the
// worker has computed today's alignment, the route kicks the build off in the
// background and the client polls until it's ready — no worker required. This
// guard ensures only ONE build runs at a time per key, so repeated polls don't
// each launch a duplicate (expensive) Whisper pass.
//
// Best-effort: with multiple web replicas each process has its own set, but the
// build functions are idempotent on the stored episode row, so the worst case
// is a rare duplicate transcription, never corrupted data.

const inFlight = new Set<string>();

// Fire `run` in the background if nothing is already running for `key`.
// Returns true if it started a new run, false if one was already in flight.
export function triggerOnce(key: string, run: () => Promise<unknown>): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  void Promise.resolve()
    .then(run)
    // Errors are persisted as a "failed" row by the builder itself; swallow
    // here so a background rejection never crashes the process.
    .catch(() => { /* non-fatal */ })
    .finally(() => inFlight.delete(key));
  return true;
}
