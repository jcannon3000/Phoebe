import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/**
 * SIGNING IN ON A PHONE THAT ALREADY HAS ITS DEVICE USER.
 *
 * A phone without an account runs as an anonymous device user (POST
 * /auth/anonymous). Signing UP upgrades that row in place, but signing IN to
 * an existing account starts a fresh session and leaves the device row
 * behind — so App Metrics counted the same person twice: once for what they
 * prayed before signing in, once after (audit, 2026-09-15).
 *
 * Nothing is moved. The device row is pointed at the account
 * (users.merged_into_user_id) and the metrics read every user id through it,
 * so the two count as one person. Everything the person sees is untouched,
 * and the phone's push token moves by itself on re-registration
 * (routes/push.ts retires copies held by other users).
 *
 * Call BEFORE loginFreshSession, while req.user is still the device user.
 * Best effort: a failure here must never block a sign-in.
 */
export async function noteAnonymousMerge(req: Request, accountId: number): Promise<void> {
  const current = req.user as { id?: number; isAnonymous?: boolean } | undefined;
  if (!current?.isAnonymous || !current.id || current.id === accountId) return;
  try {
    await db
      .update(usersTable)
      .set({ mergedIntoUserId: accountId })
      .where(and(eq(usersTable.id, current.id), eq(usersTable.isAnonymous, true)));
  } catch (err) {
    console.error("[auth] noting the device user's merge failed:", err);
  }
}
