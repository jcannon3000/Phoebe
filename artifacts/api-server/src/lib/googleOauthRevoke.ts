// Revokes Google OAuth access and refresh tokens stored on a user row.
//
// Called on logout and on account deletion so the app no longer holds an
// active grant to the user's Google account. Best-effort: if Google is
// unreachable or the token is already invalid, we log and move on — the
// user's session still ends locally. Also clears the columns on the
// users row, but the caller is expected to do that (or delete the row
// outright) when this is part of a larger transaction.
//
// Historical context: individual users' Google access/refresh tokens used
// to be stored per-row for per-user calendar writes. The scheduler account
// (invites@withphoebe.app) now handles all calendar operations, so newly
// signed-up users don't populate these columns. But legacy rows may still
// have tokens, so this helper exists to honor the privacy commitment:
// when you log out or delete, we revoke anything we're still holding.

export async function revokeGoogleTokensFor(tokens: {
  accessToken?: string | null;
  refreshToken?: string | null;
}): Promise<void> {
  const toRevoke = [tokens.accessToken, tokens.refreshToken].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );
  if (toRevoke.length === 0) return;

  for (const token of toRevoke) {
    try {
      // Google's revoke endpoint accepts the token as a form field and
      // returns 200 OK on success. An already-revoked or expired token
      // returns 400 with { error: "invalid_token" } — we treat that as
      // a no-op since the end state is what we wanted.
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      });
      if (!res.ok && res.status !== 400) {
        console.warn("[googleOauthRevoke] non-OK revoke response:", res.status);
      }
    } catch (err) {
      console.warn("[googleOauthRevoke] revoke failed:", err);
    }
  }
}
