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
const GET_TIMEOUT_MS = 12_000;

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
    res = await fetch(url, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
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
