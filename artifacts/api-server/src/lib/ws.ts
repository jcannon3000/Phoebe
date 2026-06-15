import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";
import { getFellowUserIds } from "./garden";
import { sendPushToUser } from "./pushSender";

// ── Types ────────────────────────────────────────────────────────────────────

interface PresenceInfo {
  user_id: number;
  display_name: string;
  email: string;
  avatar_url: string | null;
  joined_at: string;
}

interface ClientState {
  ws: WebSocket;
  userId: number | null;
  email: string | null;
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
}

// ── State ────────────────────────────────────────────────────────────────────

const clients = new Map<WebSocket, ClientState>();
const cobreatheSessions = new Map<WebSocket, CobreatheSession>();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Broadcast a log notification to all connected clients.
 * Each client filters on their own (only shows logs for practices they're in).
 */
export function broadcastLog(payload: {
  momentId: number;
  postId: number;
  momentName: string;
  templateType: string | null;
  guestName: string;
  userEmail: string;
}) {
  const msg = JSON.stringify({ type: "new-log", payload });
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
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
  const presence = getPresenceList();
  const msg = JSON.stringify({ type: "presence-sync", presence });
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
function getCobreatheSessions(): Array<Omit<CobreatheSession, "email">> {
  return Array.from(cobreatheSessions.values()).map(({ email: _email, ...rest }) => rest);
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

// ── Setup ────────────────────────────────────────────────────────────────────

export function attachWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const state: ClientState = { ws, userId: null, email: null, presence: null };
    clients.set(ws, state);

    // Send current presence + cobreathe state to the new client so a late joiner
    // immediately sees who's present and who's already breathing.
    ws.send(JSON.stringify({ type: "presence-sync", presence: getPresenceList() }));
    ws.send(JSON.stringify({ type: "cobreathe-sync", sessions: getCobreatheSessions() }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));

        if (msg.type === "track" && msg.payload) {
          const p = msg.payload as PresenceInfo;
          state.userId = p.user_id;
          state.email = p.email;
          state.presence = p;
          broadcastPresenceSync();
        }

        if (msg.type === "untrack") {
          state.presence = null;
          broadcastPresenceSync();
        }

        // A user started breathing — store their seed + origin so garden-mates
        // can follow the same photo order, and tell everyone.
        if (msg.type === "cobreathe-start" && msg.payload) {
          const p = msg.payload as Partial<CobreatheSession>;
          if (
            typeof p.userId === "number" &&
            typeof p.email === "string" &&
            typeof p.startEpochMs === "number" &&
            typeof p.masterSeed === "number" &&
            typeof p.fingerprint === "string"
          ) {
            cobreatheSessions.set(ws, {
              userId: p.userId,
              email: p.email,
              startEpochMs: p.startEpochMs,
              masterSeed: p.masterSeed,
              fingerprint: p.fingerprint,
            });
            broadcastCobreatheSync();
            scheduleBreathRecompute();
          }
        }

        if (msg.type === "cobreathe-stop") {
          if (cobreatheSessions.delete(ws)) { broadcastCobreatheSync(); scheduleBreathRecompute(); }
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
      }
    });

    ws.on("error", () => {
      const hadCobreathe = cobreatheSessions.delete(ws);
      clients.delete(ws);
      if (hadCobreathe) {
        broadcastCobreatheSync();
        scheduleBreathRecompute();
      }
    });
  });

  logger.info("WebSocket server attached at /ws");
}
