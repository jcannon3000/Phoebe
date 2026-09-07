import { noteNetworkFailure, noteNetworkSuccess } from "@/lib/offline";

/**
 * fetch with a bound that actually holds on the phone.
 *
 * `CapacitorHttp` is enabled for this app (capacitor.config.ts), and its
 * bridge REPLACES window.fetch with `async (resource, options)` that never
 * reads `options.signal` — there is not one mention of it in the whole
 * native-bridge bundle. So on device an AbortController times nothing out:
 * the promise stays pending until URLSession gives up, up to a minute.
 *
 * That is what made the owner's Airplane Mode office a blank screen rather
 * than a saved one (2026-09-06): every fallback in the offline layer lives
 * after a `catch` that had not happened yet. Racing a timer is the only bound
 * that works here. The request is left running — it cannot be cancelled
 * natively, and nothing depends on it once we have rejected.
 *
 * Use this anywhere a failure should fall back to something saved.
 */
export const FETCH_BOUND_MS = 8000;

export function boundedFetch(input: string, init?: RequestInit, ms: number = FETCH_BOUND_MS): Promise<Response> {
  return Promise.race([
    fetch(input, init),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out: ${input}`)), ms)),
  ]).then(
    /**
     * …AND IT REPORTS WHAT IT LEARNED.
     *
     * The whole offline layer fetches through here — the walk, the pages, the
     * pictures, the day-lists — and none of it fed lib/offline's record of
     * whether this app can actually reach anything. Only apiRequest did. So
     * dozens of failures in Airplane Mode taught the app nothing, and
     * isOnline()'s 20-second memory could lapse mid-practice and go back to
     * believing navigator.onLine, which lies. That is the exact bug this
     * mechanism exists to prevent, one call site away from returning.
     */
    (res) => { noteNetworkSuccess(); return res; },
    (err) => { noteNetworkFailure(); throw err; },
  );
}
