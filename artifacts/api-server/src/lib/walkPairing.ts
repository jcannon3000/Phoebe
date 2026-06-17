// walkPairing — consent gate for "Walking together". Every cross-user read of
// a companion's progress MUST funnel through getActiveWalk() so a fellow's
// today-dots are returned ONLY when both have an ACTIVE pairing. Mirrors the
// normalized lo/hi pair model of prayer_partnerships. Never trust a client-
// supplied user id — callers pass the session user id (req.user.id).
import { eq, and, or } from "drizzle-orm";
import { db, walkPairingsTable, fellowsTable, type WalkPairing } from "@workspace/db";

export function normalizePair(a: number, b: number): { lo: number; hi: number } {
  return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
}

// Any-status row for the pair (used by the invite/accept/pause/stop transitions).
export async function getWalkRow(a: number, b: number): Promise<WalkPairing | null> {
  const { lo, hi } = normalizePair(a, b);
  const [row] = await db.select().from(walkPairingsTable)
    .where(and(eq(walkPairingsTable.userLoId, lo), eq(walkPairingsTable.userHiId, hi)));
  return row ?? null;
}

// The consent gate: returns the row ONLY if the pair is actively walking
// together. Reads of a companion's progress 403 unless this is non-null.
export async function getActiveWalk(a: number, b: number): Promise<WalkPairing | null> {
  const row = await getWalkRow(a, b);
  return row && row.status === "active" ? row : null;
}

// Defense-in-depth: a walk requires the underlying Fellow link to still exist.
export async function areFellows(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: fellowsTable.id }).from(fellowsTable).where(or(
    and(eq(fellowsTable.userId, a), eq(fellowsTable.fellowUserId, b)),
    and(eq(fellowsTable.userId, b), eq(fellowsTable.fellowUserId, a)),
  )).limit(1);
  return rows.length > 0;
}
