// Client-side helpers for the long-lived auth token that outlasts the
// session cookie. Stored in `localStorage` under a `phoebe:persist:` key
// so the iOS native shell mirrors it into Capacitor Preferences
// (`group.app.withphoebe.mobile`), which survives WebView cache purges
// and app updates — the whole reason this exists. See the matching
// server-side comment in `routes/auth.ts` next to `mintPersistentToken`.
//
// On web (no native mirror), localStorage alone is what we've got — same
// durability as the session cookie itself. We still bother on web so that
// the same code path works without branching on platform.

const TOKEN_KEY = "phoebe:persist:auth-token";

export function getPersistentToken(): string | null {
  try {
    const v = localStorage.getItem(TOKEN_KEY);
    return v && v.length >= 32 ? v : null;
  } catch {
    // localStorage can throw in private-mode Safari; behave as if no token.
    return null;
  }
}

export function setPersistentToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private-mode Safari etc. — non-fatal */
  }
}

export function clearPersistentToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* non-fatal */
  }
}

// Mint a token for the currently authenticated user and stash it. Safe
// to call repeatedly — extra tokens are per-device and don't conflict
// with each other; we only mint when our local store is empty.
export async function ensurePersistentToken(): Promise<void> {
  if (getPersistentToken()) return;
  try {
    const res = await fetch("/api/auth/persistent-token", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return;
    const body = (await res.json()) as { token?: string };
    if (typeof body.token === "string" && body.token.length >= 32) {
      setPersistentToken(body.token);
    }
  } catch {
    /* network error — try again next session */
  }
}

// Exchange our stored token for a fresh session cookie. Used when
// /api/auth/me returns 401 — the cookie is gone but the token isn't.
// On success, replaces our stored token (server rotates on every
// exchange). On any failure, clears the stored value so we don't keep
// replaying a known-bad token.
export async function tryExchangePersistentToken(): Promise<boolean> {
  const token = getPersistentToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/auth/exchange-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      clearPersistentToken();
      return false;
    }
    const body = (await res.json()) as { token?: string };
    if (typeof body.token === "string" && body.token.length >= 32) {
      setPersistentToken(body.token);
    } else {
      clearPersistentToken();
    }
    return true;
  } catch {
    return false;
  }
}
