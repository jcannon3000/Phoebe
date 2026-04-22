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
    // If the server responded with JSON containing an `error` field,
    // surface that string as the Error message instead of the raw
    // JSON body — otherwise callers that display err.message end up
    // showing `{"error":"..."}` to users.
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") message = parsed.error;
    } catch { /* not JSON — fall through with raw text */ }
    throw new Error(message || `${method} ${url} failed: ${res.status}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return undefined as unknown as T;
}
