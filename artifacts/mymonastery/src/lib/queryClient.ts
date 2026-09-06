import type { QueryClient } from "@tanstack/react-query";
import { isOnline } from "@/lib/offline";

/**
 * The app's QueryClient, registered by App.tsx at creation so plain libs
 * (practiceCompletion's cache-forgetting unlog) can reach the cache without
 * importing App — which would be a module cycle.
 */
let appQueryClient: QueryClient | null = null;
export function registerQueryClient(c: QueryClient): void { appQueryClient = c; }
export function getQueryClient(): QueryClient | null { return appQueryClient; }

// ApiError carries the parsed JSON body alongside a user-readable
// `.message`. Callers that just want to display an error can read
// `err.message` (preferred from `body.message`, then `body.error`,
// then the raw response text). Callers that switch on the server's
// error code (e.g. WriteLetter) can read `err.body.error` /
// `err.body.nextPeriodStart` etc. without having to JSON.parse the
// message string.
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// A hung GET on a flaky / captive-portal network should fail FAST so the
// caller falls back to cached (persisted) data and a background retry, instead
// of spinning for the OS default (60s+). We bound only GETs: writes
// (POST/PATCH/DELETE) may legitimately run long — uploads, large letters — and
// must never be aborted mid-flight, which could drop the user's data.
//
// See the note in apiRequest: on device this bound has to be a raced timer,
// because the native fetch patch ignores AbortSignal entirely.
const GET_TIMEOUT_MS = 12_000;
const OFFLINE_GET_TIMEOUT_MS = 2_500;

export async function apiRequest<T = unknown>(
  method: string,
  url: string,
  body?: unknown
): Promise<T> {
  const isGet = method.toUpperCase() === "GET";
  const controller = isGet && typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), GET_TIMEOUT_MS)
    : null;

  let res: Response;
  try {
    /**
     * THE TIMEOUT CANNOT BE AN ABORT ALONE ON THE PHONE.
     *
     * `CapacitorHttp` is enabled for the app (capacitor.config.ts), and its
     * bridge REPLACES window.fetch with `async (resource, options)` that never
     * reads `options.signal` — there is not one mention of it in the whole
     * native-bridge bundle. So on device the abort above fires into nothing:
     * the promise stays pending until URLSession's own timeout, up to a
     * minute, and every "fail fast so we can fall back to what's saved" path
     * in the app waits that long instead. It is why the owner's Airplane Mode
     * recording (2026-09-06) showed a blank office rather than the saved one —
     * the fallback was correct and simply had not been reached yet.
     *
     * Racing a timer is what actually bounds it. The request is left running
     * (we cannot cancel it natively; nothing depends on it once we reject),
     * and the signal stays on for the web build, where abort does work and
     * does free the socket.
     */
    const req = fetch(url, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
    // Offline, the wait is shorter still: twelve seconds of spinner before a
    // page shows what it has saved is most of a practice. Not zero — the OS
    // has been wrong about this before (a WKWebView can report offline while
    // a request would have gone through), so a working connection still gets
    // a couple of seconds to answer.
    const budget = isOnline() ? GET_TIMEOUT_MS : OFFLINE_GET_TIMEOUT_MS;
    res = isGet
      ? await Promise.race([
          req,
          new Promise<Response>((_, reject) =>
            setTimeout(() => reject(new Error(`Timed out: ${method} ${url}`)), budget)),
        ])
      : await req;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    let message = text || `${method} ${url} failed: ${res.status}`;
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      if (typeof p.message === "string" && p.message.trim()) message = p.message;
      else if (typeof p.error === "string") message = p.error;
    }
    throw new ApiError(message, res.status, parsed ?? text);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return undefined as unknown as T;
}
