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

import http2 from "node:http2";
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
  // APNs collapse-id — if set, iOS replaces any pending notification
  // with the same ID instead of stacking. Use for events that are
  // idempotent and shouldn't show more than once (e.g. "letter #42
  // arrived" — if the backend somehow sends twice, the second replaces
  // the first rather than showing a duplicate on the lock screen).
  // Max 64 bytes per APNs spec.
  collapseId?: string;
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

  if (tokens.length === 0) {
    // Visible log so we can tell from Railway whether a push was
    // intended but had no target. "Tried to send to user X but they
    // have no active device tokens" almost always means the client
    // POST to /api/push/device-token failed silently on first launch.
    logger.info(
      { userId, title: payload.title },
      "[push] no active device tokens — skipping send"
    );
    return { attempted: 0, succeeded: 0, invalidated: 0 };
  }
  logger.info(
    { userId, tokenCount: tokens.length, title: payload.title },
    "[push] sending"
  );

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

  const headers: Record<string, string> = {
    authorization: `bearer ${jwt}`,
    "apns-topic": CREDS.bundleId as string,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "content-type": "application/json",
  };
  if (payload.collapseId) {
    // APNs limits collapse-id to 64 bytes; truncate defensively.
    headers["apns-collapse-id"] = payload.collapseId.slice(0, 64);
  }

  // APNs requires HTTP/2 — Node's native fetch (undici) only speaks
  // HTTP/1.1, so the previous version failed every send with
  // "fetch failed: Response does not match the HTTP/..." We use the
  // built-in node:http2 module instead. apnsRequest opens a session
  // per call (cheap; no pooling complexity for our low push volume)
  // and returns parsed { status, reason }.
  let result: { status: number; reason: string };
  try {
    result = await apnsRequest(deviceToken, headers, body);
  } catch (err) {
    logger.warn({ err }, "[push] APNs network error");
    return "error";
  }

  if (result.status === 200) return "ok";
  // 410 Gone = Unregistered; 400 + "BadDeviceToken" reason = device
  // token doesn't match environment (sandbox/prod mixup or app
  // uninstall). Both mean we should stop sending to this token.
  if (result.status === 410) return "invalid";

  logger.warn(
    { status: result.status, reason: result.reason, deviceToken: deviceToken.slice(0, 8) + "…" },
    "[push] APNs send failed"
  );

  if (
    result.status === 400 &&
    (result.reason === "BadDeviceToken" || result.reason === "DeviceTokenNotForTopic")
  ) {
    return "invalid";
  }
  // 4xx generally = something about the request is wrong permanently;
  // invalidate so we don't keep retrying. 5xx = transient, retry later.
  return result.status >= 400 && result.status < 500 ? "invalid" : "error";
}

// Open an HTTP/2 session to APNs, send one request, return the response.
// We don't pool sessions — Phoebe's push volume is tiny and the
// per-request session cost (a TLS handshake) is dwarfed by the JWT cache
// hit and the actual notification round-trip. Pooling would force us to
// handle session lifecycle, GOAWAY frames, idle timeouts, etc., for
// negligible benefit. If we ever push thousands per minute, revisit.
async function apnsRequest(
  deviceToken: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const session = http2.connect(APNS_HOST);
    let settled = false;
    const finish = (resOrErr: { status: number; reason: string } | Error) => {
      if (settled) return;
      settled = true;
      try { session.close(); } catch { /* already closed */ }
      if (resOrErr instanceof Error) reject(resOrErr); else resolve(resOrErr);
    };

    session.on("error", err => finish(err));

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      ...headers,
    });

    let status = 0;
    let bodyChunks = "";
    req.on("response", h => {
      status = Number(h[":status"] ?? 0);
    });
    req.on("error", err => finish(err));
    req.setEncoding("utf8");
    req.on("data", chunk => { bodyChunks += chunk; });
    req.on("end", () => {
      let reason = "";
      if (bodyChunks) {
        try {
          const parsed = JSON.parse(bodyChunks) as { reason?: string };
          reason = parsed.reason ?? bodyChunks;
        } catch {
          reason = bodyChunks;
        }
      }
      finish({ status, reason });
    });

    req.write(body);
    req.end();
  });
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
// carrying other people, not as a solo practice. Body is a gentle
// invitation rather than a metric; we deliberately avoid a per-user
// "N prayers waiting" count so the push says the same thing to
// everyone and stays readable when the count would be 0.
export function sendBellPush(userId: number) {
  return sendPushToUser(userId, {
    title: "🔔 Time to pray for your friends",
    body: "Open to begin praying for them and the world.",
    path: "/prayer-list",
    threadId: "bell",
    sound: "default",
  });
}

// Evening nudge (7 PM local). Only fires if the user hasn't logged a
// prayer that day — see runEveningNudgeSender for the gating.
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

// "{Name} wrote you a letter." Fires when a 1:1 letter arrives — read-
// focused copy because the user might not be ready to reply right
// away (a follow-up reminder push handles the "your turn is still
// open" beat 2 days later, if they haven't written by then).
//
// Small_group letters do NOT push at all. Members get a separate
// "your write window opened" push at the start of each new period
// instead — a community feed isn't supposed to ping you every time
// someone in it writes.
//
// The caller passes the letterId for the APNs collapse-id so retries
// / races / re-deploys can't double-notify.
export function sendNewLetterPush(
  userId: number,
  opts: {
    letterId: number;
    correspondenceId: number;
    correspondenceName: string;
    authorName: string;
  }
) {
  return sendPushToUser(userId, {
    title: `✉️ ${opts.authorName} wrote you a letter`,
    body: `Open “${opts.correspondenceName}” to read.`,
    path: `/mail/correspondences/${opts.correspondenceId}`,
    threadId: `letter-${opts.correspondenceId}`,
    collapseId: `letter-${opts.letterId}`,
    sound: "default",
  });
}

// Follow-up reminder for a 1:1 correspondence. Fires N days after the
// last incoming letter if the recipient still hasn't written back AND
// the period is still open. Once per period per recipient — the
// scheduler tracks via letter_window_pushes (kind = "respond").
//
// Copy is gentler than the initial "you got a letter" — assumes the
// user already saw it and just needs the time/space prompt.
export function sendLetterRespondReminderPush(
  userId: number,
  opts: { correspondenceId: number; correspondenceName: string; authorName: string },
) {
  return sendPushToUser(userId, {
    title: `✨ ${opts.authorName} is waiting for you`,
    body: `Your reply window is still open in “${opts.correspondenceName}.”`,
    path: `/mail/correspondences/${opts.correspondenceId}/write`,
    threadId: `letter-${opts.correspondenceId}`,
    sound: "default",
  });
}

// "Your write window just opened in {name}." Fires once per member at
// the start of each small_group correspondence period. The period is
// the 14-day cycle anchored to the correspondence's startedAt; the
// scheduler computes current period start, and if no
// letter_window_pushes row exists for (correspondence, user,
// periodStart, kind="open") we push and insert the tracker.
export function sendLetterPeriodOpenPush(
  userId: number,
  opts: { correspondenceId: number; correspondenceName: string; periodStartDate: string },
) {
  return sendPushToUser(userId, {
    title: `✉️ Time to write in “${opts.correspondenceName}”`,
    body: "Your group's write window is open.",
    path: `/mail/correspondences/${opts.correspondenceId}/write`,
    threadId: `letter-${opts.correspondenceId}`,
    collapseId: `letter-period-open-${opts.correspondenceId}-${opts.periodStartDate}`,
    sound: "default",
  });
}

// Fires when someone writes a "word of comfort" / prayer response on
// another user's prayer request. Sender-revealing (recipients want to
// know who cared enough to reach out). Tap lands on the recipient's
// prayer list so they can read it.
//
// We already gate at the route layer (only on FIRST insert per
// author+request, not on edits), but the collapse-id is belt-and-
// suspenders: if the route ever fires twice for the same pair,
// iOS replaces rather than stacks.
export function sendPrayerWordPush(
  recipientUserId: number,
  opts: { authorUserId?: number; authorName: string; prayerRequestId?: number }
) {
  const collapseId = opts.prayerRequestId && opts.authorUserId
    ? `prayer-word-${opts.prayerRequestId}-${opts.authorUserId}`
    : undefined;
  return sendPushToUser(recipientUserId, {
    title: `💬 ${opts.authorName} raised you in prayer`,
    body: "Open Phoebe to read what they wrote.",
    path: "/prayer-list",
    threadId: opts.prayerRequestId ? `prayer-request-${opts.prayerRequestId}` : "prayer-word",
    collapseId,
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

// First-ever amen on a brand-new prayer request — the moment the
// owner's ask stops being theirs alone. Sender-anonymous (the request
// owner gets the FEELING, not a name; community signal, not a
// reply). Fires exactly once per request, gated server-side. The
// collapse-id makes that exactness idempotent against any race.
export function sendFirstAmenPush(
  recipientUserId: number,
  opts: { prayerRequestId: number },
) {
  return sendPushToUser(recipientUserId, {
    title: "🌿 Your community is praying for you",
    body: "The first prayer just went up for your request.",
    path: "/prayer-list",
    threadId: `prayer-request-${opts.prayerRequestId}`,
    collapseId: `first-amen-${opts.prayerRequestId}`,
    sound: "default",
  });
}

// "3 people are praying for you today." Fires the moment the third
// distinct (user, today-in-owner-tz) amen lands. Today is bucketed in
// the owner's timezone so the count matches what they see in the UI.
// Collapse-id includes the date so a request that crosses days can
// fire on each new day, but only once per day.
export function sendThirdAmenTodayPush(
  recipientUserId: number,
  opts: { prayerRequestId: number; localYmd: string },
) {
  return sendPushToUser(recipientUserId, {
    title: "🙏🏽 3 people are praying for you today",
    body: "Your request is being carried.",
    path: "/prayer-list",
    threadId: `prayer-request-${opts.prayerRequestId}`,
    collapseId: `third-amen-${opts.prayerRequestId}-${opts.localYmd}`,
    sound: "default",
  });
}

// (`sendLetterWindowOpenPush` removed — for one-to-one correspondences
// the moment a letter arrives IS the moment the recipient's write
// window opens, so we just branch sendNewLetterPush below by group
// type and use turn-focused copy. For small_group there's no "your
// turn" — anyone can write any time during the period — so the
// generic "you have a new letter" framing stays.)
