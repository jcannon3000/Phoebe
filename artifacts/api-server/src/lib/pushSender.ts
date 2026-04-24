// APNs push sender for Phoebe Mobile.
//
// Reads the following env vars (set in Railway → api-server → Variables):
//   APNS_KEY_P8       — full .p8 contents (BEGIN/END lines incl.)
//   APNS_KEY_ID       — 10-char string from developer.apple.com → Keys
//   APNS_TEAM_ID      — 10-char string from developer.apple.com → Membership
//   APNS_BUNDLE_ID    — defaults to "app.withphoebe.mobile"
//   APNS_ENVIRONMENT  — "production" (default) | "sandbox"
//
// If APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID are unset, the sender
// degrades to a log-only stub (`sendOneApns` returns "stub") so local
// dev and preview deploys don't 500 on every trigger.
//
// Flow: sendPushToUser() reads active device tokens for the user,
// signs a single ES256 JWT (cached for ~55 min via getApnsJwt), and
// POSTs a standard `aps` payload to api.push.apple.com. 410s and
// BadDeviceToken responses mark the row invalid so the next pass
// skips it.

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { SignJWT, importPKCS8, type KeyLike } from "jose";
import { db, deviceTokensTable } from "@workspace/db";
import { logger } from "./logger";

const APNS_ENV = (process.env["APNS_ENVIRONMENT"] ?? "production").toLowerCase();
const APNS_HOST = APNS_ENV === "sandbox"
  ? "https://api.sandbox.push.apple.com"
  : "https://api.push.apple.com";

const CREDS = {
  keyP8: process.env["APNS_KEY_P8"] ?? null,
  keyId: process.env["APNS_KEY_ID"] ?? null,
  teamId: process.env["APNS_TEAM_ID"] ?? null,
  bundleId: process.env["APNS_BUNDLE_ID"] ?? "app.withphoebe.mobile",
};

export interface PushPayload {
  title: string;
  body: string;
  // Optional deep-link path that the Capacitor shell routes to on tap.
  // e.g. "/communities/phoebe-architects"
  path?: string;
  // iOS badge number; pass `null` to clear, `undefined` to leave alone.
  badge?: number | null;
  // APNs thread-id for notification grouping. Phoebe uses one thread per
  // "kind" (e.g. "bell", "prayer-request-new", "member-joined").
  threadId?: string;
  // Sound name from the app bundle, or "default".
  sound?: string;
}

interface SendResult {
  attempted: number;
  succeeded: number;
  invalidated: number;
}

/**
 * Send a push to every active iOS/Android device token belonging to the
 * given user. Invalid tokens are automatically marked with
 * `invalidated_at = now()` so the next cron pass skips them.
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<SendResult> {
  const tokens = await db.select({
    id: deviceTokensTable.id,
    platform: deviceTokensTable.platform,
    token: deviceTokensTable.token,
  })
    .from(deviceTokensTable)
    .where(and(
      eq(deviceTokensTable.userId, userId),
      isNull(deviceTokensTable.invalidatedAt),
    ));

  if (tokens.length === 0) return { attempted: 0, succeeded: 0, invalidated: 0 };

  const result: SendResult = { attempted: tokens.length, succeeded: 0, invalidated: 0 };
  const invalidTokenIds: number[] = [];

  for (const t of tokens) {
    if (t.platform !== "ios") continue; // Android path to be added later
    const outcome = await sendOneApns(t.token, payload);
    if (outcome === "ok") result.succeeded += 1;
    else if (outcome === "invalid") invalidTokenIds.push(t.id);
  }

  if (invalidTokenIds.length > 0) {
    await db.update(deviceTokensTable)
      .set({ invalidatedAt: sql`now()` })
      .where(inArray(deviceTokensTable.id, invalidTokenIds));
    result.invalidated = invalidTokenIds.length;
  }

  return result;
}

type ApnsOutcome = "ok" | "invalid" | "error" | "stub";

/**
 * Send a single APNs notification. Returns:
 *   "ok"      — APNs accepted the payload (200)
 *   "invalid" — APNs rejected the token (410 Unregistered or BadDeviceToken)
 *   "error"   — any other failure (5xx, network). Caller should retry
 *               next bell tick; we don't invalidate the token.
 *   "stub"    — credentials not configured; sender logged and skipped.
 */
async function sendOneApns(deviceToken: string, payload: PushPayload): Promise<ApnsOutcome> {
  if (!CREDS.keyP8 || !CREDS.keyId || !CREDS.teamId) {
    logger.info({
      apns: "stub",
      bundleId: CREDS.bundleId,
      host: APNS_HOST,
      deviceToken: deviceToken.slice(0, 8) + "…",
      payload,
    }, "[push] APNS_* env vars not set — would have sent");
    return "stub";
  }

  // APNs accepts an ES256-signed JWT in the Authorization header. The same
  // JWT is valid for up to 1 hour across any number of requests; we cache
  // it module-scope to avoid re-signing on every push.
  let jwt: string;
  try {
    jwt = await getApnsJwt();
  } catch (err) {
    logger.error({ err }, "[push] APNs JWT sign failed");
    return "error";
  }

  const apsPayload: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body },
    sound: payload.sound ?? "default",
  };
  if (payload.threadId) apsPayload["thread-id"] = payload.threadId;
  if (payload.badge !== undefined) apsPayload["badge"] = payload.badge;

  const body = JSON.stringify({
    aps: apsPayload,
    // Custom fields below `aps` — read by the native shell's
    // `pushNotificationActionPerformed` listener to deep-link in-app.
    ...(payload.path ? { path: payload.path } : {}),
  });

  let res: Response;
  try {
    res = await fetch(`${APNS_HOST}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": CREDS.bundleId as string,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body,
    });
  } catch (err) {
    logger.warn({ err }, "[push] APNs network error");
    return "error";
  }

  if (res.status === 200) return "ok";
  // 410 Gone = Unregistered; 400 + "BadDeviceToken" reason = device
  // token doesn't match environment (sandbox/prod mixup or app
  // uninstall). Both mean we should stop sending to this token.
  if (res.status === 410) return "invalid";

  let reasonText = "";
  try {
    reasonText = await res.text();
  } catch {
    /* body drained */
  }
  const reason = (() => {
    try {
      const body = JSON.parse(reasonText) as { reason?: string };
      return body.reason ?? "";
    } catch {
      return reasonText;
    }
  })();

  logger.warn(
    { status: res.status, reason, deviceToken: deviceToken.slice(0, 8) + "…" },
    "[push] APNs send failed"
  );

  if (
    res.status === 400 &&
    (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic")
  ) {
    return "invalid";
  }
  // 4xx generally = something about the request is wrong permanently;
  // invalidate so we don't keep retrying. 5xx = transient, retry later.
  return res.status >= 400 && res.status < 500 ? "invalid" : "error";
}

// ─── APNs JWT caching ──────────────────────────────────────────────────────
// Apple accepts a single ES256-signed JWT for up to 60 minutes per-token.
// Sign once, cache 55 min, resign.
const APNS_JWT_TTL_MS = 55 * 60 * 1000;
let apnsKeyCache: KeyLike | null = null;
let apnsJwtCache: { token: string; expiresAt: number } | null = null;

async function getApnsJwt(): Promise<string> {
  if (apnsJwtCache && apnsJwtCache.expiresAt > Date.now()) {
    return apnsJwtCache.token;
  }
  if (!apnsKeyCache) {
    apnsKeyCache = (await importPKCS8(
      CREDS.keyP8 as string,
      "ES256"
    )) as KeyLike;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: CREDS.keyId as string })
    .setIssuer(CREDS.teamId as string)
    .setIssuedAt(nowSec)
    .sign(apnsKeyCache);
  apnsJwtCache = { token, expiresAt: Date.now() + APNS_JWT_TTL_MS };
  return token;
}

// Thin helpers for common notification kinds. Callers don't need to
// know payload conventions; they just call by name.

// Morning monastery bell (7 AM local). The copy is deliberately
// relational — "your friends" — because the whole app frames prayer as
// carrying other people, not as a solo practice. Tap opens the prayer
// list slideshow so they walk straight into it.
export function sendBellPush(userId: number, _opts: { actionableCount: number; practices: string[] }) {
  return sendPushToUser(userId, {
    title: "🔔 Time to pray for your friends",
    body: "Your community is waiting to be remembered.",
    path: "/prayer-list",
    threadId: "bell",
    sound: "default",
  });
}

// Evening nudge (7 PM local). Only fires if the user hasn't logged a
// prayer that day — see eveningNudgeSender for the gating.
export function sendEveningNudgePush(userId: number) {
  return sendPushToUser(userId, {
    title: "🌙 Don't forget to pray for your friends",
    body: "A few minutes before the day closes.",
    path: "/prayer-list",
    threadId: "bell",
    sound: "default",
  });
}

export function sendNewMemberPush(adminUserId: number, groupSlug: string, memberName: string) {
  return sendPushToUser(adminUserId, {
    title: `New member in your community`,
    body: `${memberName} just joined.`,
    path: `/communities/${groupSlug}`,
    threadId: "member-joined",
    sound: "default",
  });
}

export function sendNewPrayerRequestPush(userId: number, groupSlug: string, authorName: string | null) {
  return sendPushToUser(userId, {
    title: "New prayer request",
    body: authorName ? `${authorName} shared a request.` : "Someone shared a request.",
    path: `/communities/${groupSlug}`,
    threadId: "prayer-request-new",
    sound: "default",
  });
}

// Fan-out wrapper. We iterate in parallel so a slow / unresponsive APNs
// call for one recipient doesn't hold up the rest of the request.
// Errors are swallowed per-user inside sendPushToUser → sendOneApns.
export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  // Dedup — protects against overlapping member queries (e.g. someone is
  // both admin + member).
  const unique = Array.from(new Set(userIds.filter(id => Number.isFinite(id))));
  await Promise.all(unique.map(id => sendPushToUser(id, payload).catch(() => ({ attempted: 0, succeeded: 0, invalidated: 0 }))));
}

// Sender-anonymous. Phoebe's convention: a prayer "for you" is a gift,
// not a transaction — we don't reveal who. Tap opens /dashboard where
// the recipient can see their list of prayers.
export function sendPrayerForYouPush(recipientUserId: number) {
  return sendPushToUser(recipientUserId, {
    title: "Someone is praying for you",
    body: "Open Phoebe to see.",
    path: "/dashboard",
    threadId: "prayer-for-you",
    sound: "default",
  });
}

// Fires per-recipient (not per-correspondence). The author is NOT in the
// list — the caller filters them out. Tap deep-links into the letters
// app's conversation view.
export function sendNewLetterPush(
  userId: number,
  opts: { correspondenceId: number; correspondenceName: string; authorName: string }
) {
  return sendPushToUser(userId, {
    title: "✉️ You have a new letter",
    body: `${opts.authorName} wrote in “${opts.correspondenceName}.”`,
    path: `/mail/correspondences/${opts.correspondenceId}`,
    threadId: `letter-${opts.correspondenceId}`,
    sound: "default",
  });
}

// Fires when someone writes a "word of comfort" / prayer response on
// another user's prayer request. Sender-revealing (recipients want to
// know who cared enough to reach out). Tap lands on the recipient's
// prayer list so they can read it.
export function sendPrayerWordPush(
  recipientUserId: number,
  opts: { authorName: string; prayerRequestId?: number }
) {
  return sendPushToUser(recipientUserId, {
    title: `💬 ${opts.authorName} raised you in prayer`,
    body: "Open Phoebe to read what they wrote.",
    path: "/prayer-list",
    threadId: opts.prayerRequestId ? `prayer-request-${opts.prayerRequestId}` : "prayer-word",
    sound: "default",
  });
}

// Fires for all group members except the creator. Copy branches by
// templateType so a new intercession reads differently from a new
// lectio-divina practice.
export function sendNewGroupMomentPush(
  userId: number,
  opts: { groupSlug: string; momentName: string; templateType: string; creatorName: string }
) {
  const verb = (() => {
    switch (opts.templateType) {
      case "intercession": return "started an intercession";
      case "lectio-divina": return "started a Lectio Divina practice";
      case "fasting":      return "started a fast";
      case "morning-prayer":
      case "evening-prayer":
                           return "started a prayer practice";
      case "contemplative":
                           return "started a contemplative practice";
      default:             return "started a practice";
    }
  })();
  return sendPushToUser(userId, {
    title: opts.momentName || "Phoebe",
    body: `${opts.creatorName} ${verb}.`,
    path: `/communities/${opts.groupSlug}`,
    threadId: `group-moment-${opts.groupSlug}`,
    sound: "default",
  });
}
