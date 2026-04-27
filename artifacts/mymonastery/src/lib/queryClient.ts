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

export async function apiRequest<T = unknown>(
  method: string,
  url: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
