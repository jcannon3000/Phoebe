// Server clock — a SHARED time source so the Cobreathe global breath starts at
// the same instant on every device.
//
// The breath is a pure function of wall-clock time (Date.now() % CYCLE_MS), so
// two people are in phase only if their CLOCKS agree. Device clocks can be off
// by seconds (no NTP, manual time, drift), which on a 20s cycle is a visible
// desync. So instead of trusting each phone's own clock, we measure the offset
// between the SERVER's clock and the local clock (NTP-lite, with round-trip
// correction) and expose `syncedNow()` = the server's current epoch ms as seen
// locally. Everyone who breathes off `syncedNow()` shares one schedule: breath
// N starts at server-epoch ⌈t/CYCLE⌉·CYCLE for all.

import { apiRequest } from "@/lib/queryClient";

const OFFSET_KEY = "phoebe:clock-offset";
const FRESH_MS = 5 * 60 * 1000; // treat an offset younger than this as fresh
const MAX_PLAUSIBLE_OFFSET = 24 * 60 * 60 * 1000; // ignore absurd cached offsets

let offset = 0;          // syncedNow = Date.now() + offset
let lastSyncAt = 0;
let inFlight: Promise<void> | null = null;

// Seed from sessionStorage so a warm reload is already aligned (no flash of the
// device clock before the first network sync lands).
try {
  const raw = sessionStorage.getItem(OFFSET_KEY);
  if (raw !== null) {
    const n = Number(raw);
    if (Number.isFinite(n) && Math.abs(n) < MAX_PLAUSIBLE_OFFSET) offset = n;
  }
} catch { /* private mode — start at offset 0 (local clock) */ }

/** The server's current time, in epoch ms, as seen on this device. */
export function syncedNow(): number {
  return Date.now() + offset;
}

export function getClockOffset(): number {
  return offset;
}

export function isClockFresh(): boolean {
  return lastSyncAt > 0 && Date.now() - lastSyncAt < FRESH_MS;
}

// One round-trip probe → an offset estimate + the round-trip time (smaller RTT =
// more accurate). server `now` was the server's time at roughly the midpoint of
// the round trip, so the local time matching it is t1 - rtt/2.
async function sampleOnce(): Promise<{ off: number; rtt: number } | null> {
  const t0 = Date.now();
  try {
    const data = await apiRequest<{ now: number }>("GET", "/api/time");
    const t1 = Date.now();
    if (!data || typeof data.now !== "number") return null;
    const rtt = t1 - t0;
    const off = data.now + rtt / 2 - t1;
    return { off, rtt };
  } catch {
    return null;
  }
}

/** Re-measure the server offset. Takes a few samples and keeps the one with the
 *  smallest round-trip (least jitter). Coalesces concurrent callers. */
export function syncClock(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let best: { off: number; rtt: number } | null = null;
    for (let i = 0; i < 3; i++) {
      const s = await sampleOnce();
      if (s && (best === null || s.rtt < best.rtt)) best = s;
    }
    if (best) {
      offset = best.off;
      lastSyncAt = Date.now();
      try { sessionStorage.setItem(OFFSET_KEY, String(offset)); } catch { /* non-fatal */ }
    }
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/** Resolve once the clock is synced — instant if a fresh offset already exists,
 *  otherwise after a sync. Callers that need an accurate clock NOW (the start of
 *  a Cobreathe session) await this. */
export async function ensureClockSynced(): Promise<void> {
  if (isClockFresh()) return;
  await syncClock();
}

// Keep the offset warm: sync on load, on return-to-foreground, and periodically,
// so it's ready before a Cobreathe session ever starts.
if (typeof window !== "undefined") {
  void syncClock();
  window.addEventListener("phoebe:appactive", () => { void syncClock(); });
  window.addEventListener("focus", () => { if (!isClockFresh()) void syncClock(); });
  setInterval(() => { void syncClock(); }, FRESH_MS);
}
