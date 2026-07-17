// Shared auth + membership infrastructure for the letter routes.
//
// Both routes/letters.ts (legacy, served at /api/letters/* and used by
// the standalone letters-app at /mail) and routes/phoebe.ts (current,
// served at /api/phoebe/* and used by the main mymonastery bundle)
// had byte-identical copies of this code. Extracting it here is the
// first safe step of the letters.ts/phoebe.ts dedup (API audit #4):
// it removes the duplicated infrastructure WITHOUT touching any route
// path or response shape, so neither frontend changes behavior.
//
// The riskier part of the dedup — sharing the actual route HANDLERS
// (whose response shapes have drifted slightly between the two files)
// — is deliberately left for a follow-up. This module only covers the
// auth plumbing, which is identical.

import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, correspondenceMembersTable } from "@workspace/db";

export interface LetterAuth {
  userId: number | null;
  email: string;
  name: string;
  /**
   * When the caller authenticated via an invite `?token=`, this is the
   * correspondence that token belongs to — the token is a capability for
   * THAT correspondence only, not a global identity. `null` means a real
   * logged-in session (unrestricted, may act on any correspondence they
   * belong to). getMembership enforces the scope.
   */
  correspondenceScope: number | null;
}

/**
 * Resolve the caller's identity for letter routes. Session auth (a
 * logged-in user) takes precedence; otherwise we accept a
 * `?token=<inviteToken>` query param that maps to a JOINED
 * correspondence member (un-joined invitees can't act yet). Returns
 * null when neither path identifies the caller.
 */
export async function resolveLetterAuth(req: Request): Promise<LetterAuth | null> {
  // Session auth first.
  if (req.user) {
    const u = req.user as { id: number; email: string; name: string };
    return { userId: u.id, email: u.email, name: u.name, correspondenceScope: null };
  }
  // Token-based auth — the invite token doubles as a capability for
  // not-yet-registered recipients reading / replying via a link. It is
  // scoped to the ONE correspondence it was minted for: a leaked token
  // must not authenticate the same person against their OTHER
  // correspondences (getMembership rejects a mismatched :id).
  const token = req.query.token as string | undefined;
  if (token) {
    const [member] = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.inviteToken, token))
      .limit(1);
    if (member && member.joinedAt) {
      return {
        userId: member.userId,
        email: member.email,
        name: member.name || "Anonymous",
        correspondenceScope: member.correspondenceId,
      };
    }
  }
  return null;
}

/**
 * Wrap a handler so it only runs for an authenticated caller (session
 * OR valid invite token). 401s otherwise.
 */
export function requireAuth(
  handler: (req: Request, res: Response, auth: LetterAuth) => Promise<void>,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const auth = await resolveLetterAuth(req);
    if (!auth) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    await handler(req, res, auth);
  };
}

/**
 * Stricter variant — requires a real logged-in session (no invite-
 * token path). Used for actions an anonymous token-holder shouldn't be
 * able to take (e.g. creating a brand-new correspondence).
 */
export function requireSessionAuth(
  handler: (req: Request, res: Response, auth: LetterAuth) => Promise<void>,
) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const u = req.user as { id: number; email: string; name: string };
    await handler(req, res, { userId: u.id, email: u.email, name: u.name, correspondenceScope: null });
  };
}

/**
 * Load all member rows for a correspondence + the row that matches the
 * caller. Matches by userId when available, else case-insensitive
 * email (belt-and-suspenders against any path that stored a non-
 * lowercased address).
 */
export async function getMembership(correspondenceId: number, auth: LetterAuth) {
  // A token-scoped caller may only act on the one correspondence the token
  // was minted for. Refuse (as a non-member) for any other :id, so a leaked
  // invite link can't be replayed against the invitee's other correspondences.
  if (auth.correspondenceScope != null && auth.correspondenceScope !== correspondenceId) {
    return { member: undefined, members: [] };
  }
  const members = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.correspondenceId, correspondenceId));
  const authEmailLc = auth.email.toLowerCase();
  const member = members.find(
    (m) => (auth.userId && m.userId === auth.userId) || m.email.toLowerCase() === authEmailLc,
  );
  return { member, members };
}
