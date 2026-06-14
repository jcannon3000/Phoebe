import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { logger } from "./logger";

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

function getCobreatheSessions(): CobreatheSession[] {
  return Array.from(cobreatheSessions.values());
}

function broadcastCobreatheSync() {
  const msg = JSON.stringify({ type: "cobreathe-sync", sessions: getCobreatheSessions() });
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
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
          }
        }

        if (msg.type === "cobreathe-stop") {
          if (cobreatheSessions.delete(ws)) broadcastCobreatheSync();
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
      }
    });

    ws.on("error", () => {
      const hadCobreathe = cobreatheSessions.delete(ws);
      clients.delete(ws);
      if (hadCobreathe) {
        broadcastCobreatheSync();
      }
    });
  });

  logger.info("WebSocket server attached at /ws");
}
