// APNs push sender — scaffolded for Phoebe Mobile.
//
// This module is intentionally a stub-with-shape: the function signatures,
// table reads, and error-handling flow are real, but the actual APNs
// signing + POST is gated on `APNS_KEY_P8` / `APNS_KEY_ID` / `APNS_TEAM_ID`
// / `APNS_BUNDLE_ID` env vars. Until those land in Railway, `sendPush`
// logs the payload it WOULD send and returns cleanly — so callers
// (bellSender, notifyAdminsOfNewMember, etc.) can integrate now without
// waiting on Apple Developer account setup.
//
// When you're ready to enable real delivery:
//   1. Create an APNs Auth Key (.p8) in developer.apple.com → Keys.
//   2. Railway env:
//        APNS_KEY_P8       — paste the full .p8 contents (BEGIN/END lines incl.)
//        APNS_KEY_ID       — 10-char string from the key page
//        APNS_TEAM_ID      — 10-char string from developer.apple.com → Membership
//        APNS_BUNDLE_ID    — app.withphoebe.mobile
//        APNS_ENVIRONMENT  — "production" | "sandbox" (default: production)
//   3. `pnpm --filter @workspace/api-server add jose` (we use jose to sign
//      the APNs JWT; no native deps).
//   4. Replace `sendOneApns` below with the real jose-based implementation
//      (sketch left in the comment inside that function).
//
// Everything above `sendOneApns` can ship as-is today.

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

export function sendBellPush(userId: number, opts: { actionableCount: number; practices: string[] }) {
  const body = opts.actionableCount === 0
    ? "A quiet day — nothing scheduled."
    : opts.practices.length <= 2
      ? opts.practices.join(" and ")
      : `${opts.practices.slice(0, 2).join(", ")} and ${opts.practices.length - 2} more`;
  return sendPushToUser(userId, {
    title: "Daily bell",
    body,
    // Tap lands on the prayer list so the user walks straight into the
    // practice flow. If the list is empty the page itself shows an
    // appropriate "all quiet" state, which matches the push copy.
    path: opts.actionableCount > 0 ? "/prayer-list" : "/dashboard",
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
// app's conversation view (`/mail/correspondences/:id`).
export function sendNewLetterPush(
  userId: number,
  opts: { correspondenceId: number; correspondenceName: string; authorName: string }
) {
  return sendPushToUser(userId, {
    title: opts.correspondenceName,
    body: `${opts.authorName} wrote.`,
    path: `/mail/correspondences/${opts.correspondenceId}`,
    threadId: `letter-${opts.correspondenceId}`,
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
