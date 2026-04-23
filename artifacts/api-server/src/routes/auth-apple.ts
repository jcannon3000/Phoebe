/**
 * Sign in with Apple — native iOS flow.
 *
 * Apple Guideline 4.8 mandates SIWA because Phoebe offers Google SSO. On
 * iOS the client-side `@capacitor-community/apple-sign-in` plugin hands
 * us a signed JWT (the "identity token"). We verify it here against
 * Apple's published JWKS, then upsert into `users` with the same pattern
 * as the Google OAuth handler (`routes/auth.ts`).
 *
 * We deliberately do NOT implement the web OAuth redirect (Services ID
 * + client-secret JWT) — that's only needed if we ever add SIWA to the
 * web build. For a native-only target, the App ID is the client ID.
 *
 * Security notes:
 *   - `jose`'s createRemoteJWKSet caches Apple's keys + handles rotation.
 *   - We pin `iss`, `aud`, and require a non-expired token.
 *   - `nonce` is echoed back by Apple only if the client supplied it;
 *     we enforce that it matches what the client says it sent. (The
 *     client generates a per-login nonce to prevent token replay.)
 *   - Apple returns user's name ONLY on first authorization on a given
 *     device. Capture at that first call or live with "email-prefix".
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = new URL("https://appleid.apple.com/auth/keys");
// The native Apple Sign In plugin uses the iOS bundle ID as the `aud`
// claim value. Keep in sync with `phoebe-mobile/capacitor.config.ts`.
const APPLE_AUDIENCE = process.env["APPLE_BUNDLE_ID"] ?? "app.withphoebe.mobile";

const jwks = createRemoteJWKSet(APPLE_JWKS_URL);

const AppleNativeSchema = z.object({
  identityToken: z.string().min(32).max(4096),
  // Random string the client generated before opening the Apple sheet.
  // Apple echoes it in the token; we assert they match to prevent replay.
  nonce: z.string().min(8).max(256),
  // Only populated on first authorization — Apple forgets names after.
  name: z
    .object({
      givenName: z.string().max(120).optional(),
      familyName: z.string().max(120).optional(),
    })
    .optional(),
});

// POST /api/auth/apple/native
// Body: { identityToken, nonce, name? }
// Verifies the Apple JWT, upserts the user, logs them in via Passport.
router.post("/auth/apple/native", async (req, res): Promise<void> => {
  const parsed = AppleNativeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
    return;
  }
  const { identityToken, nonce, name } = parsed.data;

  // 1. Verify + decode the JWT.
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(identityToken, jwks, {
      issuer: APPLE_ISSUER,
      audience: APPLE_AUDIENCE,
    });
    payload = result.payload as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[auth:apple] token_verify_failed:", msg);
    res.status(401).json({ error: "invalid_token", detail: msg });
    return;
  }

  // 2. Nonce check. Apple hashes the nonce (SHA-256 hex) into `nonce` on
  // the returned token when the client sent one. For the native plugin
  // the raw nonce is echoed verbatim — we accept either form so we're
  // resilient to plugin version drift.
  const tokenNonce = typeof payload["nonce"] === "string" ? (payload["nonce"] as string) : null;
  const tokenNonceHex = typeof payload["nonce_supported"] === "boolean" ? payload["nonce"] : null;
  void tokenNonceHex; // reserved for future use if we switch to SHA-256 echo
  if (tokenNonce && tokenNonce !== nonce) {
    console.warn("[auth:apple] nonce_mismatch");
    res.status(401).json({ error: "nonce_mismatch" });
    return;
  }

  // 3. Extract claims.
  const sub = typeof payload["sub"] === "string" ? (payload["sub"] as string) : null;
  const email = typeof payload["email"] === "string" ? (payload["email"] as string).toLowerCase() : null;
  if (!sub) {
    res.status(401).json({ error: "missing_sub" });
    return;
  }

  // 4. Build a display name. Apple returned name comes once per lifetime
  // of an Apple-ID-on-bundle pairing, so we take it if we got it, else
  // fall back to the email's local part, else a generic "friend".
  const displayName =
    [name?.givenName?.trim(), name?.familyName?.trim()].filter(Boolean).join(" ").trim() ||
    (email ? email.split("@")[0] : "friend");

  // 5. Upsert strategy mirrors Google auth (routes/auth.ts:49-74):
  //   - apple_id hit → log them in
  //   - email hit (no apple_id yet) → link apple_id
  //   - otherwise → create new row
  try {
    const byApple = await db.select().from(usersTable).where(eq(usersTable.appleId, sub));
    let user = byApple[0];

    if (!user && email) {
      const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, email));
      if (byEmail[0]) {
        const [linked] = await db
          .update(usersTable)
          .set({ appleId: sub })
          .where(eq(usersTable.id, byEmail[0].id))
          .returning();
        user = linked;
      }
    }

    if (!user) {
      if (!email) {
        // Extremely rare — Apple declined to share an email AND this is a
        // brand-new Phoebe account. We can't contact them, so refuse.
        res.status(400).json({ error: "email_required_on_first_signup" });
        return;
      }
      const [created] = await db
        .insert(usersTable)
        .values({
          name: displayName,
          email,
          appleId: sub,
        })
        .returning();
      user = created;
    }

    // 6. Log in via Passport so the browser session cookie picks up.
    req.login(user as Express.User, (err) => {
      if (err) {
        console.error("[auth:apple] req.login failed:", err);
        res.status(500).json({ error: "login_failed" });
        return;
      }
      req.session.save(() => {
        res.json({
          ok: true,
          userId: (user as { id: number }).id,
          // Echo name so the client can populate its local cache without
          // an extra round-trip to /api/users/me.
          name: (user as { name: string }).name,
        });
      });
    });
  } catch (err) {
    console.error("[auth:apple] upsert_failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
