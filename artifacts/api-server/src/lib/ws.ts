import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";
import { getFellowUserIds } from "./garden";
import { sendPushToUser } from "./pushSender";
import { sessionMiddleware } from "./session";

// ── Types ────────────────────────────────────────────────────────────────────

// Presence carries NO email — clients match their garden by user_id. (Email
// used to cross the wire to every connected client, a PII leak.)
interface PresenceInfo {
  user_id: number;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
}

interface ClientState {
  ws: WebSocket;
  userId: number | null;
  presence: PresenceInfo | null;
}

// A live cobreathe session: a user currently breathing, with the seed + start
// origin garden-mates need to follow their photo order. Garden filtering is done
// client-side (like presence), so this stays free of the social graph / DB.
interface CobreatheSession {
  userId: number;
  email: string;
  startEpochMs: number;
  masterSeed: number;
  fingerprint: string;
  // OPT-IN coarse location ("same air"): a 5-char geohash (~5km cell) the
  // breather attached if they enabled shareBreathLocation AND the OS granted
  // location. In-memory only — NEVER broadcast to clients (stripped in
  // getCobreatheSessions) and NEVER stored. The server derives only a count +
  // coarse band from it, and evaporates it when the session ends.
  geohash?: string;
  // OPT-IN PRECISE location for the "breathing together" map (the in-person
  // session opt-in). Relayed ONLY to this breather's mutual Fellows via the
  // per-recipient cobreathe-near message — never to strangers, never in the
  // general sync (stripped in getCobreatheSessions), never stored.
  lat?: number;
  lng?: number;
}

// ── State ────────────────────────────────────────────────────────────────────

const clients = new Map<WebSocket, ClientState>();
const cobreatheSessions = new Map<WebSocket, CobreatheSession>();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Broadcast a "new log" notification to the sockets of the moment's OWN members.
 *
 * It must NOT fan out to every connected socket: the payload carries the moment
 * name (user free text, can name a person/situation) and the poster's name, so a
 * global broadcast let any connected client — including anonymous device users —
 * harvest a real-time who-posted-to-which-practice graph across practices they
 * don't belong to. `memberUserIds` is the moment's member user ids; we send only
 * to sockets whose authenticated user is in that set. (Account-less guests have
 * no userId and simply pick the post up on their next poll.)
 */
export function broadcastLog(payload: {
  momentId: number;
  postId: number;
  momentName: string;
  templateType: string | null;
  guestName: string;
  // The poster's user id (null for account-less guests) — used by the client
  // ONLY to suppress its own log. Replaces the poster's email, which used to be
  // broadcast to every client in the moment (a PII leak).
  userId: number | null;
}, memberUserIds: number[]) {
  if (memberUserIds.length === 0) return;
  const allow = new Set(memberUserIds);
  const msg = JSON.stringify({ type: "new-log", payload });
  for (const [ws, state] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (state.userId == null || !allow.has(state.userId)) continue;
    ws.send(msg);
  }
}

/**
 * Get all currently present users.
 */
function getPresenceList(): PresenceInfo[] {
  const list: PresenceInfo[] = [];
  const seen = new Set<number>();
  for (const state of clients.values()) {
    if (state.presence && state.userId && !seen.has(state.userId)) {
      seen.add(state.userId);
      list.push(state.presence);
    }
  }
  return list;
}

function broadcastPresenceSync() {
  // Presence is emailless — clients filter their garden by user_id.
  const msg = JSON.stringify({ type: "presence-sync", presence: getPresenceList() });
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// Public view broadcast to clients — WITHOUT email. Clients match sessions to
// their connections by userId (the page passes garden user-ids), so email never
// needs to cross the wire to every connected client. (email is kept server-side
// in the Map but never broadcast — a privacy fix vs. the original design.)
function getCobreatheSessions(): Array<Omit<CobreatheSession, "email" | "geohash" | "lat" | "lng">> {
  // Strip the server-only email, the coarse geohash, AND the precise lat/lng —
  // none of these may reach a client via the general sync. (Precise coords go
  // ONLY to a breather's mutual Fellows, via the per-recipient cobreathe-near
  // message.) Garden filtering still happens client-side by userId.
  return Array.from(cobreatheSessions.values()).map(({ email: _email, geohash: _geohash, lat: _lat, lng: _lng, ...rest }) => rest);
}

function broadcastCobreatheSync() {
  const msg = JSON.stringify({ type: "cobreathe-sync", sessions: getCobreatheSessions() });
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ── "Join the breath" notifications ────────────────────────────────────────────
//
// When 3+ of a user's FELLOWS (1:1 connections — symmetric, so getFellowUserIds
// is enough) are in a live cobreathe session at once, push the (non-breathing)
// user "Join the breath" with the names. Refresh it as the group changes, and
// REMOVE it (silent push → the app clears the banner) once fewer than 3 of their
// Fellows are still breathing. iOS only; best-effort. All state is in-memory.

const BREATH_THRESHOLD = 3;
const BREATH_NAMES_SHOWN = 3;
const BREATH_THREAD = "cobreathe-live";
const BREATH_REALERT_COOLDOWN_MS = 5 * 60_000;

// Recipients with a "Join the breath" banner outstanding → the (sorted) breathing
// fellow ids we last told them about, so we only re-push when the set changes.
const breathNotified = new Map<number, number[]>();
// Last time we withdrew a recipient's banner — anti-flap on the initial alert.
const breathWithdrawnAt = new Map<number, number>();

let breathRecomputeTimer: ReturnType<typeof setTimeout> | null = null;
// Debounce: coalesce bursts of start/stop into one recompute.
function scheduleBreathRecompute() {
  if (breathRecomputeTimer) return;
  breathRecomputeTimer = setTimeout(() => {
    breathRecomputeTimer = null;
    recomputeBreathNotifications().catch((err) =>
      logger.warn({ err }, "[cobreathe] join-the-breath recompute failed"));
  }, 1500);
}

function breathFirstName(name: string): string {
  return (name ?? "").trim().split(/\s+/)[0] || "Someone";
}

// "A, B, and C are breathing together right now" / "A, B, C and 5 others …"
function breathBody(names: string[], total: number): string {
  const shown = names.slice(0, BREATH_NAMES_SHOWN);
  const extra = total - shown.length;
  if (extra > 0) {
    return `${shown.join(", ")} and ${extra} other${extra === 1 ? "" : "s"} are breathing together right now`;
  }
  const list = shown.length <= 1
    ? (shown[0] ?? "")
    : `${shown.slice(0, -1).join(", ")}, and ${shown[shown.length - 1]}`;
  return `${list} are breathing together right now`;
}

async function namesForUsers(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  try {
    const rows = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable).where(inArray(usersTable.id, ids));
    for (const r of rows) map.set(r.id, r.name);
  } catch { /* names are best-effort — body falls back to "Someone" */ }
  return map;
}

function withdrawBreath(recipientId: number) {
  if (!breathNotified.delete(recipientId)) return;
  breathWithdrawnAt.set(recipientId, Date.now());
  void sendPushToUser(recipientId, {
    title: "", body: "",
    silent: true, iosOnly: true,
    collapseId: BREATH_THREAD,
    data: { type: "cobreathe-live-withdraw", threadId: BREATH_THREAD },
  }).catch((err) => logger.warn({ err, recipientId }, "[cobreathe] withdraw push failed"));
}

async function recomputeBreathNotifications() {
  // Distinct users currently breathing.
  const breathingIds = new Set<number>();
  for (const s of cobreatheSessions.values()) breathingIds.add(s.userId);

  // Below the threshold nobody can have 3 breathing fellows → clear everything.
  if (breathingIds.size < BREATH_THRESHOLD) {
    for (const recipientId of [...breathNotified.keys()]) withdrawBreath(recipientId);
    return;
  }

  // fellowsBreathingOf[F] = sorted breathing-fellow ids of F (F not breathing).
  const fellowsBreathingOf = new Map<number, number[]>();
  for (const breather of breathingIds) {
    let fellows: number[];
    try { fellows = await getFellowUserIds(breather); } catch { continue; }
    for (const f of fellows) {
      if (breathingIds.has(f)) continue; // don't notify someone already breathing
      const arr = fellowsBreathingOf.get(f) ?? [];
      arr.push(breather);
      fellowsBreathingOf.set(f, arr);
    }
  }
  for (const arr of fellowsBreathingOf.values()) arr.sort((a, b) => a - b);

  const nameById = await namesForUsers([...breathingIds]);

  // Notify / refresh recipients at or above the threshold.
  for (const [recipientId, fellowIds] of fellowsBreathingOf) {
    if (fellowIds.length < BREATH_THRESHOLD) continue;
    const prev = breathNotified.get(recipientId);
    const unchanged = prev
      && prev.length === fellowIds.length
      && prev.every((id, i) => id === fellowIds[i]);
    if (unchanged) continue;
    const isInitial = !prev;
    // Anti-flap: don't fire a fresh initial alert right after a withdrawal.
    if (isInitial && Date.now() - (breathWithdrawnAt.get(recipientId) ?? 0) < BREATH_REALERT_COOLDOWN_MS) {
      continue;
    }
    const names = fellowIds.map((id) => breathFirstName(nameById.get(id) ?? "")).sort();
    void sendPushToUser(recipientId, {
      title: "Join the breath",
      body: breathBody(names, fellowIds.length),
      path: "/cobreathe?start=1",
      collapseId: BREATH_THREAD,
      threadId: BREATH_THREAD,
      iosOnly: true,
      // First alert breaks through normally; refreshes update the slot quietly.
      interruptionLevel: isInitial ? "active" : "passive",
      data: { type: "cobreathe-live" },
    }).catch((err) => logger.warn({ err, recipientId }, "[cobreathe] join push failed"));
    breathNotified.set(recipientId, fellowIds);
  }

  // Withdraw anyone previously notified who's now below the threshold.
  for (const recipientId of [...breathNotified.keys()]) {
    const cur = fellowsBreathingOf.get(recipientId);
    if (!cur || cur.length < BREATH_THRESHOLD) withdrawBreath(recipientId);
  }
}

// ── "Same air" — who's breathing near you right now ─────────────────────────
//
// When a breather opts in (shareBreathLocation + OS grant), the client attaches
// a COARSE 5-char geohash (~5km cell) to their cobreathe-start. The server keeps
// it in memory only and, on any change, sends each opted-in breather a PRIVATE
// `cobreathe-near` message with: a COUNT of others in the same cell (strangers
// stay an anonymous +1) and, for those who are their Fellows, a first name +
// avatar + a coarse distance BAND. No client ever receives another user's
// geohash, coordinates, or exact distance. All state is in-memory + ephemeral.

const GEOHASH_RE = /^[0-9bcdefghjkmnpqrstuvwxyz]{1,5}$/; // base32 (geohash alphabet), ≤ precision 5
const NEAR_FELLOWS_SHOWN = 6;

// Coarse band from how much two geohashes share. Beta matches whole 5-char
// cells, so matched Fellows are always "near you"; the finer bands are
// forward-compatible for when neighbor-cell matching lands.
function geoBand(a: string, b: string): "near" | "blocks" | "town" {
  let shared = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] === b[i]) shared++; else break; }
  if (shared >= 5) return "near";
  if (shared >= 4) return "blocks";
  return "town";
}

async function peopleForUsers(ids: number[]): Promise<Map<number, { name: string; avatarUrl: string | null }>> {
  const map = new Map<number, { name: string; avatarUrl: string | null }>();
  if (ids.length === 0) return map;
  try {
    const rows = await db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(usersTable).where(inArray(usersTable.id, ids));
    for (const r of rows) map.set(r.id, { name: r.name, avatarUrl: r.avatarUrl });
  } catch { /* faces are best-effort */ }
  return map;
}

// Send each opted-in breather their private "near" view. O(sessions²) over a
// small live set; fellow + name lookups are cached per recompute.
async function computeAndBroadcastNear() {
  // Sessions that shared a bucket this round (one per ws). lat/lng ride along
  // when the breather opted into an in-person session (drives the map).
  const located: Array<{ ws: WebSocket; userId: number; geohash: string; lat?: number; lng?: number }> = [];
  for (const [ws, s] of cobreatheSessions) {
    if (s.geohash && ws.readyState === WebSocket.OPEN) located.push({ ws, userId: s.userId, geohash: s.geohash, lat: s.lat, lng: s.lng });
  }
  if (located.length === 0) return;

  // Fellow ids for every located breather (so we name / map only relationships).
  const fellowIdsOf = new Map<number, Set<number>>();
  await Promise.all(Array.from(new Set(located.map((l) => l.userId))).map(async (uid) => {
    try { fellowIdsOf.set(uid, new Set(await getFellowUserIds(uid))); } catch { fellowIdsOf.set(uid, new Set()); }
  }));

  // Pre-fetch names/avatars for every mutual Fellow who could appear — same-cell
  // "near" Fellows AND (any distance) Fellows who shared coords for the map.
  const facesNeeded = new Set<number>();
  for (const me of located) {
    const myFellows = fellowIdsOf.get(me.userId) ?? new Set<number>();
    for (const other of located) {
      if (other.userId === me.userId || !myFellows.has(other.userId)) continue;
      if (other.geohash === me.geohash) facesNeeded.add(other.userId);
      if (other.lat != null && other.lng != null) facesNeeded.add(other.userId);
    }
  }
  const faces = await peopleForUsers([...facesNeeded]);

  for (const me of located) {
    const myFellows = fellowIdsOf.get(me.userId) ?? new Set<number>();
    const nearUserIds = new Set<number>();
    const nearFellows: Array<{ userId: number; name: string; avatarUrl: string | null; band: string }> = [];
    // Map points: every mutual Fellow breathing now who shared precise coords,
    // at ANY distance (so "breathing together while apart" can draw a line).
    const mapFellows: Array<{ userId: number; name: string; avatarUrl: string | null; lat: number; lng: number }> = [];
    const mapAdded = new Set<number>();
    for (const other of located) {
      if (other.userId === me.userId) continue;          // not myself
      if (myFellows.has(other.userId) && other.lat != null && other.lng != null && !mapAdded.has(other.userId)) {
        mapAdded.add(other.userId);
        const f = faces.get(other.userId);
        mapFellows.push({ userId: other.userId, name: breathFirstName(f?.name ?? ""), avatarUrl: f?.avatarUrl ?? null, lat: other.lat, lng: other.lng });
      }
      if (other.geohash !== me.geohash) continue;        // same ~5km cell only (the "near" count)
      if (nearUserIds.has(other.userId)) continue;        // distinct people
      nearUserIds.add(other.userId);
      if (myFellows.has(other.userId) && nearFellows.length < NEAR_FELLOWS_SHOWN) {
        const f = faces.get(other.userId);
        nearFellows.push({ userId: other.userId, name: breathFirstName(f?.name ?? ""), avatarUrl: f?.avatarUrl ?? null, band: geoBand(me.geohash, other.geohash) });
      }
    }
    if (me.ws.readyState === WebSocket.OPEN) {
      // myLoc only when I shared my OWN coords (needed to anchor the map); without
      // it we send no map points, so a breather never sees others' precise spots
      // without contributing their own.
      const myLoc = (me.lat != null && me.lng != null) ? { lat: me.lat, lng: me.lng } : null;
      me.ws.send(JSON.stringify({ type: "cobreathe-near", nearCount: nearUserIds.size, nearFellows, mapFellows: myLoc ? mapFellows : [], myLoc }));
    }
  }
}

let breathNearTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBreathNear() {
  if (breathNearTimer) return;
  breathNearTimer = setTimeout(() => {
    breathNearTimer = null;
    computeAndBroadcastNear().catch((err) => logger.warn({ err }, "[cobreathe] near recompute failed"));
  }, 800);
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function attachWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Run the express-session middleware on the upgrade request so we can read the
  // authenticated user id (passport stores it at session.passport.user).
  const runSession = sessionMiddleware as unknown as (
    req: IncomingMessage, res: Record<string, unknown>, next: () => void,
  ) => void;

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // AUTHENTICATE the socket against the SAME session cookie the HTTP API uses.
    // Until now the WS trusted client-supplied identity entirely: any anonymous
    // client could impersonate a user (forging presence as them), spoof
    // cobreathe sessions (push-spamming a victim's fellows + probing the social
    // graph server-side), and pull a live roster of every present user. After
    // this gate we NEVER trust a client-supplied user id — it always comes from
    // the session.
    runSession(req, {}, () => {
      const authedUserId = (req as unknown as { session?: { passport?: { user?: number } } })
        .session?.passport?.user;
      if (typeof authedUserId !== "number") {
        try { ws.close(1008, "Unauthorized"); } catch { /* already closing */ }
        return;
      }

      const state: ClientState = { ws, userId: authedUserId, presence: null };
      clients.set(ws, state);

      // Send current presence + cobreathe state to the new client so a late
      // joiner immediately sees who's present and who's already breathing.
      ws.send(JSON.stringify({ type: "presence-sync", presence: getPresenceList() }));
      ws.send(JSON.stringify({ type: "cobreathe-sync", sessions: getCobreatheSessions() }));

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw));

          if (msg.type === "track" && msg.payload) {
            const p = msg.payload as Partial<PresenceInfo>;
            // user_id is the AUTHENTICATED user — never the client payload (that
            // was the impersonation hole). Only cosmetic display fields are
            // taken from the client; no email crosses the wire anymore.
            state.presence = {
              user_id: authedUserId,
              display_name: typeof p.display_name === "string" ? p.display_name : "",
              avatar_url: typeof p.avatar_url === "string" ? p.avatar_url : null,
              joined_at: typeof p.joined_at === "string" ? p.joined_at : new Date().toISOString(),
            };
            broadcastPresenceSync();
          }

          if (msg.type === "untrack") {
            state.presence = null;
            broadcastPresenceSync();
          }

          // A user started breathing — store their seed + origin so garden-mates
          // can follow the same photo order, and tell everyone. The userId is
          // the authenticated one, so a client can't forge a session for someone
          // else (which would have spammed that person's fellows).
          if (msg.type === "cobreathe-start" && msg.payload) {
            const p = msg.payload as Partial<CobreatheSession>;
            if (
              typeof p.startEpochMs === "number" &&
              typeof p.masterSeed === "number" &&
              typeof p.fingerprint === "string"
            ) {
              // Coarse "same air" bucket — accept only a valid ≤5-char geohash
              // (the client coarsens on-device before sending). Anything else is
              // dropped silently, leaving the session location-less.
              const geohash = typeof p.geohash === "string" && GEOHASH_RE.test(p.geohash) ? p.geohash : undefined;
              // Precise coords for the map — only kept when in valid range; only
              // ever relayed to mutual Fellows (see computeAndBroadcastNear).
              const lat = typeof p.lat === "number" && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 ? p.lat : undefined;
              const lng = typeof p.lng === "number" && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 ? p.lng : undefined;
              cobreatheSessions.set(ws, {
                userId: authedUserId,
                email: "",
                startEpochMs: p.startEpochMs,
                masterSeed: p.masterSeed,
                fingerprint: p.fingerprint,
                geohash,
                lat,
                lng,
              });
              broadcastCobreatheSync();
              scheduleBreathRecompute();
              scheduleBreathNear();
            }
          }

          if (msg.type === "cobreathe-stop") {
            if (cobreatheSessions.delete(ws)) { broadcastCobreatheSync(); scheduleBreathRecompute(); scheduleBreathNear(); }
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on("close", () => {
        const hadPresence = state.presence !== null;
        const hadCobreathe = cobreatheSessions.delete(ws);
        clients.delete(ws);
        if (hadPresence) {
          broadcastPresenceSync();
        }
        if (hadCobreathe) {
          broadcastCobreatheSync();
          scheduleBreathRecompute();
          scheduleBreathNear();
        }
      });

      ws.on("error", () => {
        const hadCobreathe = cobreatheSessions.delete(ws);
        clients.delete(ws);
        if (hadCobreathe) {
          broadcastCobreatheSync();
          scheduleBreathRecompute();
          scheduleBreathNear();
        }
      });
    });
  });

  logger.info("WebSocket server attached at /ws");
}
