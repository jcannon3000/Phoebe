import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, sql } from "drizzle-orm";
import { db, deviceTokensTable, usersTable } from "@workspace/db";
import { deleteCalendarEvent } from "../lib/calendar";

const router: IRouter = Router();

function getUser(req: any): { id: number } | null {
  return (req as any).user ?? null;
}

// ─── POST /api/push/device-token ────────────────────────────────────────────
// Phoebe Mobile calls this after the user grants push permission. The APNs
// token is per-device, rotates occasionally (OS update, iCloud restore,
// app reinstall), and we want to de-dup on (userId, platform, token).
//
// The schema's unique index on (user_id, platform, token) + ON CONFLICT
// DO UPDATE means this is safely idempotent — the same device calling
// repeatedly just bumps `last_seen_at`.
const registerSchema = z.object({
  token: z.string().min(32).max(512),
  // "ios" today; "android" reserved for the Capacitor Android target.
  platform: z.enum(["ios", "android"]),
});

router.post("/push/device-token", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", detail: parsed.error.format() });
    return;
  }

  try {
    // Re-registering the same device bumps last_seen_at + clears any prior
    // invalidation (e.g. user reinstalled the app and got a fresh token —
    // the row should be alive again).
    await db.insert(deviceTokensTable)
      .values({
        userId: user.id,
        platform: parsed.data.platform,
        token: parsed.data.token,
      })
      .onConflictDoUpdate({
        target: [deviceTokensTable.userId, deviceTokensTable.platform, deviceTokensTable.token],
        set: {
          lastSeenAt: sql`now()`,
          invalidatedAt: null,
        },
      });

    // Once a user has a push channel, the bell calendar invite becomes
    // redundant (and would double-notify). Remove any stale event we
    // created earlier via /bell/preferences. Fire-and-forget so a
    // calendar API blip doesn't fail the token-registration request.
    (async () => {
      try {
        const [row] = await db.select({ bellCalendarEventId: usersTable.bellCalendarEventId })
          .from(usersTable).where(eq(usersTable.id, user.id));
        if (row?.bellCalendarEventId) {
          await deleteCalendarEvent(user.id, row.bellCalendarEventId).catch(() => null);
          await db.update(usersTable)
            .set({ bellCalendarEventId: null })
            .where(eq(usersTable.id, user.id));
        }
      } catch (err) {
        console.warn("[push] bell calendar cleanup failed:", err);
      }
    })();

    res.json({ ok: true });
  } catch (err) {
    console.error("[push] device-token upsert failed:", err);
    res.status(500).json({ error: "Failed to register device" });
  }
});

// ─── DELETE /api/push/device-token ──────────────────────────────────────────
// Called when the user disables push from within the app, or when a logout
// handler wants to stop pushes to a specific device. We scope to the
// caller's userId so one user can't unregister another user's device.
router.delete("/push/device-token", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { token, platform } = req.body as { token?: string; platform?: string };
  if (!token || (platform !== "ios" && platform !== "android")) {
    res.status(400).json({ error: "token and platform required" });
    return;
  }

  try {
    await db.delete(deviceTokensTable).where(and(
      eq(deviceTokensTable.userId, user.id),
      eq(deviceTokensTable.platform, platform),
      eq(deviceTokensTable.token, token),
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[push] device-token delete failed:", err);
    res.status(500).json({ error: "Failed to unregister device" });
  }
});

export default router;
