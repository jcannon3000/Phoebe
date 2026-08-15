import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, userMutesTable, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";

// Muting — stopping seeing a specific person's prayer requests without
// blocking or reporting them. The READ side of this (checking who's muted)
// has lived in garden.ts/prayer.ts/people.ts the whole time (they filter
// muted authors out of the garden and skip push fan-out to muters); this
// file is the WRITE side — actually creating/removing a mute — which had
// been fully removed, leaving mute-checking with no way to create a new
// mute at all. Owner: "we need the mute features in settings back."
const router: IRouter = Router();

function getUser(req: any): { id: number } | null {
  return (req as any).user ?? null;
}

// GET /api/mutes/mine — the caller's muted list, for Settings.
router.get("/mutes/mine", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select({ userId: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(userMutesTable)
      .innerJoin(usersTable, eq(usersTable.id, userMutesTable.mutedUserId))
      .where(eq(userMutesTable.muterId, user.id));
    res.json({ muted: rows });
  } catch (err) {
    logger.error({ err }, "[mutes] GET /mutes/mine failed");
    res.status(500).json({ error: "Couldn't load your muted list." });
  }
});

// POST /api/mutes { mutedUserId } — mute someone.
router.post("/mutes", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const mutedUserId = Number(req.body?.mutedUserId);
  if (!Number.isInteger(mutedUserId) || mutedUserId <= 0) {
    res.status(400).json({ error: "Bad mutedUserId" });
    return;
  }
  if (mutedUserId === user.id) {
    res.status(400).json({ error: "You can't mute yourself." });
    return;
  }
  try {
    const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, mutedUserId));
    if (!target) { res.status(404).json({ error: "Not found" }); return; }
    await db.insert(userMutesTable)
      .values({ muterId: user.id, mutedUserId })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[mutes] POST /mutes failed");
    res.status(500).json({ error: "Couldn't mute — please try again." });
  }
});

// DELETE /api/mutes/:userId — unmute.
router.delete("/mutes/:userId", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const mutedUserId = Number(req.params.userId);
  if (!Number.isInteger(mutedUserId)) { res.status(400).json({ error: "Bad userId" }); return; }
  try {
    await db.delete(userMutesTable)
      .where(and(eq(userMutesTable.muterId, user.id), eq(userMutesTable.mutedUserId, mutedUserId)));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[mutes] DELETE /mutes/:userId failed");
    res.status(500).json({ error: "Couldn't unmute — please try again." });
  }
});

export default router;
