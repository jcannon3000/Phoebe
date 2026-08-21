/**
 * The routine backlog — past routines a person can go back to.
 *
 * Owner: "make a way when someone goes to edit their routine [with] a third
 * option where it says revert to past routine, and we have a backlog that
 * saves routines. Every time they get the customizer."
 *
 *   POST /me/routine-snapshots          → save the CURRENT routine
 *   GET  /me/routine-snapshots          → the backlog, newest first
 *   POST /me/routine-snapshots/:id/restore → go back to one
 *
 * The capture endpoint takes NO body. It reads the routine off the account
 * (captureRoutineSpec, the inverse of applyRoutineSpecToUser), so a snapshot
 * is always exactly what was in force — a client-supplied one could drift from
 * what apply actually wrote, and the whole value of a backlog is that it's
 * trustworthy on the day you need it.
 */
import { Router, type IRouter } from "express";
import { and, desc, eq, lt } from "drizzle-orm";
import { db, routineSnapshotsTable } from "@workspace/db";
import { captureRoutineSpec, sanitizeSpec, applyRoutineSpecToUser } from "../lib/routineSpec";
import { describeSpec } from "../lib/routineDescribe";
import { perUserRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

function getUserId(req: any): number | null {
  return req.user ? (req.user as { id: number }).id : null;
}

// How many past routines to keep. Enough to cover "the one before the last few
// experiments", short of a list nobody can choose from — and a hard bound on
// what one account can store.
const MAX_SNAPSHOTS = 15;
const SOURCES = new Set(["customizer", "interview", "restore"]);

/**
 * Save the routine currently in force.
 *
 * Deduped against the newest row: opening the customizer, backing out, and
 * opening it again shouldn't leave three identical entries and push the
 * routine they actually want off the end of the list.
 */
export async function saveRoutineSnapshot(userId: number, source: string): Promise<number> {
  const countRows = async (): Promise<number> => {
    const rows = await db
      .select({ id: routineSnapshotsTable.id })
      .from(routineSnapshotsTable)
      .where(eq(routineSnapshotsTable.userId, userId))
      .limit(MAX_SNAPSHOTS);
    return rows.length;
  };

  const spec = await captureRoutineSpec(userId);
  // Nothing worth keeping (a fresh account with no layout yet) — storing an
  // empty spec would offer them a "past routine" that wipes their rhythm.
  if (!spec) return countRows();

  const [newest] = await db
    .select({ id: routineSnapshotsTable.id, spec: routineSnapshotsTable.spec })
    .from(routineSnapshotsTable)
    .where(eq(routineSnapshotsTable.userId, userId))
    .orderBy(desc(routineSnapshotsTable.createdAt))
    .limit(1);
  if (newest && JSON.stringify(newest.spec) === JSON.stringify(spec)) return countRows();

  await db.insert(routineSnapshotsTable).values({
    userId,
    spec,
    source: SOURCES.has(source) ? source : "customizer",
  });

  // Trim the tail. Read the cutoff row's timestamp and delete everything older,
  // rather than deleting by a fetched id list, so a concurrent insert can't
  // slip past the trim.
  const keep = await db
    .select({ createdAt: routineSnapshotsTable.createdAt })
    .from(routineSnapshotsTable)
    .where(eq(routineSnapshotsTable.userId, userId))
    .orderBy(desc(routineSnapshotsTable.createdAt))
    .limit(MAX_SNAPSHOTS);
  if (keep.length === MAX_SNAPSHOTS) {
    const cutoff = keep[keep.length - 1]!.createdAt;
    await db.delete(routineSnapshotsTable).where(
      and(eq(routineSnapshotsTable.userId, userId), lt(routineSnapshotsTable.createdAt, cutoff)),
    );
  }
  return keep.length;
}

router.post("/me/routine-snapshots", perUserRateLimit("routine_snapshot_save", {
  max: 60, windowMs: 60 * 60 * 1000,
}), async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    // `count` is what lets the client know a backlog EXISTS without a second
    // round trip — it stores that locally so the customizer's entry slide can
    // offer "go back to a past routine" synchronously on the next visit,
    // instead of racing a fetch and popping the option in after first paint.
    const count = await saveRoutineSnapshot(userId, String(req.body?.source ?? "customizer"));
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[routine-snapshots] save failed:", err);
    // Never block someone from opening the customizer because the backlog
    // couldn't be written — the snapshot is a safety net, not a gate.
    res.json({ ok: false, count: 0 });
  }
});

router.get("/me/routine-snapshots", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select({
        id: routineSnapshotsTable.id,
        spec: routineSnapshotsTable.spec,
        source: routineSnapshotsTable.source,
        createdAt: routineSnapshotsTable.createdAt,
      })
      .from(routineSnapshotsTable)
      .where(eq(routineSnapshotsTable.userId, userId))
      .orderBy(desc(routineSnapshotsTable.createdAt))
      .limit(MAX_SNAPSHOTS);

    res.json({
      snapshots: rows.flatMap((r) => {
        // Describe through the same gate the interview uses, so a past routine
        // is named in the same words as a new one.
        const spec = sanitizeSpec(r.spec);
        if (!spec) return [];
        return [{
          id: r.id,
          source: r.source,
          createdAt: r.createdAt,
          settings: describeSpec(spec),
        }];
      }),
    });
  } catch (err) {
    console.error("[routine-snapshots] list failed:", err);
    res.json({ snapshots: [] });
  }
});

router.post("/me/routine-snapshots/:id/restore", perUserRateLimit("routine_snapshot_restore", {
  max: 20, windowMs: 60 * 60 * 1000,
}), async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = req.params.id;
  const id = parseInt(typeof raw === "string" ? raw : "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "invalid" }); return; }

  try {
    const [row] = await db
      .select({ spec: routineSnapshotsTable.spec })
      .from(routineSnapshotsTable)
      // Scoped to the caller — the id alone must never be enough to read
      // someone else's routine.
      .where(and(eq(routineSnapshotsTable.id, id), eq(routineSnapshotsTable.userId, userId)));
    if (!row) { res.status(404).json({ error: "not_found" }); return; }

    const spec = sanitizeSpec(row.spec);
    if (!spec) { res.status(422).json({ error: "unusable_snapshot" }); return; }

    // Snapshot what they have NOW before replacing it, so reverting is itself
    // revertible — someone reaching for this feature is already unsure, and a
    // one-way undo would be a cruel place to find that out.
    await saveRoutineSnapshot(userId, "restore");
    await applyRoutineSpecToUser(userId, spec);
    // The client mirrors office levels and slots from localStorage, so hand
    // back the rule-config for it to adopt locally (same as the interview).
    res.json({ ok: true, spec });
  } catch (err) {
    console.error("[routine-snapshots] restore failed:", err);
    res.status(500).json({ error: "restore_failed" });
  }
});

export default router;
