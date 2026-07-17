import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, ne, sql, isNull } from "drizzle-orm";
import { db, deviceTokensTable, webPushSubscriptionsTable } from "@workspace/db";
import { sendPushToUser } from "../lib/pushSender";

const router: IRouter = Router();

// VAPID public key — handed to the browser so it can register a
// subscription that's bound to OUR private key. Public-by-design;
// served unauthenticated since the browser needs it before the user
// is necessarily signed in. Returns 503 when unconfigured so the
// client can stay quiet rather than registering against a dead key.
router.get("/push/vapid-public-key", (_req, res): void => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    res.status(503).json({ error: "Web push not configured" });
    return;
  }
  res.json({ publicKey });
});

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

    // A physical device's push token belongs to exactly ONE account at a
    // time. Retire the same (platform, token) under any OTHER user so a
    // shared or handed-down device stops delivering the previous owner's
    // prayer notifications to whoever holds it now. (Logout does not clear
    // device tokens, so without this the stale binding persists.)
    await db.update(deviceTokensTable)
      .set({ invalidatedAt: sql`now()` })
      .where(and(
        eq(deviceTokensTable.platform, parsed.data.platform),
        eq(deviceTokensTable.token, parsed.data.token),
        sql`${deviceTokensTable.userId} <> ${user.id}`,
      ));
    // Visible log so we can confirm from Railway whether a given
    // user actually registered a token. Log only the prefix of the
    // token (tokens are not secret, but 72-char log lines are noise).
    console.log(
      `[push] device-token registered: userId=${user.id} platform=${parsed.data.platform} ` +
      `token=${parsed.data.token.slice(0, 12)}…`
    );

    // Granting push permission is the bell opt-in. Auto-enable the
    // morning bell at 07:00 local for any user who doesn't already have
    // a time set — they don't opt in from onboarding anymore. We use
    // COALESCE so a user who explicitly chose a different time keeps it
    // on subsequent token re-registrations (token rotation, reinstalls).
    // Same pass clears any stale calendar event ID — the calendar-invite
    // path is gone, push is the only delivery channel now.
    try {
      await db.execute(sql`
        UPDATE users
        SET bell_enabled = TRUE,
            daily_bell_time = COALESCE(daily_bell_time, '09:30'),
            bell_calendar_event_id = NULL
        WHERE id = ${user.id}
      `);
    } catch (err) {
      console.warn("[push] bell auto-enable failed:", err);
    }

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

  const { token, platform } = (req.body ?? {}) as { token?: string; platform?: string };
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

// ─── POST /api/push/test ─────────────────────────────────────────────────────
// Sends a test notification to the caller's own devices, bypassing the cron
// timing and "already prayed" gates. The response localizes a "I'm not getting
// notifications" problem:
//   • tokenCount 0           → no device registered (iOS permission not granted,
//                              or the token never reached us) — fix on-device.
//   • attempted 0, tokens>0  → master switch off OR creds missing (server side).
//   • attempted>0, succeeded 0 → APNs rejected every token (bad env / keys).
//   • succeeded>0            → delivered; the pipeline works.
router.post("/push/test", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const liveTokens = await db
      .select({ id: deviceTokensTable.id })
      .from(deviceTokensTable)
      .where(and(eq(deviceTokensTable.userId, user.id), isNull(deviceTokensTable.invalidatedAt)));
    const result = await sendPushToUser(user.id, {
      title: "Phoebe",
      body: "Test notification — if you can see this, your reminders will arrive too.",
      threadId: "test",
      data: { path: "/daily-progress" },
    });
    // Is the 15-min cron scheduler actually running? Office reminders come from
    // it (not the real-time path), so a stale/missing last-run here is the
    // smoking gun for "I get other notifications but not my morning reminder".
    let schedulerLastRunAgoMin: number | null = null;
    try {
      const rows = await db.execute<{ ago_seconds: number }>(
        sql`SELECT EXTRACT(EPOCH FROM (NOW() - MAX(started_at)))::int AS ago_seconds FROM scheduler_runs`,
      );
      const agoSeconds = rows.rows?.[0]?.ago_seconds;
      if (typeof agoSeconds === "number") schedulerLastRunAgoMin = Math.round(agoSeconds / 60);
    } catch { /* table may not exist yet — leave null */ }
    res.json({ tokenCount: liveTokens.length, ...result, schedulerLastRunAgoMin });
  } catch (err) {
    console.error("[push] test send failed:", err);
    res.status(500).json({ error: "test_failed" });
  }
});

// ─── POST /api/push/web-subscription ────────────────────────────────────────
// Browser (Android Chrome / Firefox / desktop) calls this after the
// user grants notification permission. The PushSubscription handed to
// JS includes an endpoint URL plus encryption keys; we store it so the
// bell sender can post to that endpoint with web-push later.
//
// Idempotent on (userId, endpoint) — re-registering the same browser
// just bumps last_seen_at and clears any prior invalidation (e.g.
// user re-granted permission after revoking it).
const webSubscriptionSchema = z.object({
  endpoint: z.string().url().min(20).max(500),
  keys: z.object({
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(10).max(100),
  }),
  userAgent: z.string().max(500).optional(),
});

router.post("/push/web-subscription", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = webSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", detail: parsed.error.format() });
    return;
  }

  try {
    await db.insert(webPushSubscriptionsTable)
      .values({
        userId: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: parsed.data.userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: [webPushSubscriptionsTable.userId, webPushSubscriptionsTable.endpoint],
        set: {
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent: parsed.data.userAgent ?? null,
          lastSeenAt: sql`now()`,
          invalidatedAt: null,
        },
      });

    // Retire the same endpoint under any OTHER user. A browser's push
    // endpoint is one physical delivery channel; a PushSubscription survives
    // logout, so if a shared browser switches accounts the previous owner's
    // row would otherwise keep delivering their private bells to whoever now
    // uses that browser. Only the most recently authenticated user may own it.
    await db.delete(webPushSubscriptionsTable).where(and(
      eq(webPushSubscriptionsTable.endpoint, parsed.data.endpoint),
      ne(webPushSubscriptionsTable.userId, user.id),
    ));

    console.log(
      `[push] web-subscription registered: userId=${user.id} ` +
      `endpoint=${parsed.data.endpoint.slice(0, 40)}…`
    );

    // Granting browser-push permission is the bell opt-in for web,
    // mirroring the iOS device-token path. Default 07:00 local if the
    // user hasn't picked a time yet.
    try {
      await db.execute(sql`
        UPDATE users
        SET bell_enabled = TRUE,
            daily_bell_time = COALESCE(daily_bell_time, '09:30'),
            bell_calendar_event_id = NULL
        WHERE id = ${user.id}
      `);
    } catch (err) {
      console.warn("[push] bell auto-enable failed:", err);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[push] web-subscription upsert failed:", err);
    res.status(500).json({ error: "Failed to register web subscription" });
  }
});

// ─── DELETE /api/push/web-subscription ──────────────────────────────────────
// Called when the user disables notifications in Settings or revokes
// permission. We scope to the caller's userId so one user can't drop
// another user's subscription.
router.delete("/push/web-subscription", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { endpoint } = (req.body ?? {}) as { endpoint?: string };
  if (!endpoint) {
    res.status(400).json({ error: "endpoint required" });
    return;
  }

  try {
    await db.delete(webPushSubscriptionsTable).where(and(
      eq(webPushSubscriptionsTable.userId, user.id),
      eq(webPushSubscriptionsTable.endpoint, endpoint),
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[push] web-subscription delete failed:", err);
    res.status(500).json({ error: "Failed to unregister web subscription" });
  }
});

export default router;
