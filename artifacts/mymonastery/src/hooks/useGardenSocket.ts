import { useEffect, useRef, useState, useCallback } from "react";
import type { AuthUser } from "./useAuth";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PresenceUser {
  user_id: number;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
}

export interface LogEvent {
  momentId: number;
  postId: number;
  momentName: string;
  templateType: string | null;
  guestName: string;
  // The poster's user id (null for account-less guests) — used only to suppress
  // the viewer's OWN log. Replaces the poster's email (no PII on the wire).
  userId: number | null;
}

type MessageHandler = (msg: { type: string; [key: string]: unknown }) => void;

// ── Singleton WebSocket ──────────────────────────────────────────────────────

let sharedSocket: WebSocket | null = null;
let handlers = new Set<MessageHandler>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function ensureSocket() {
  if (sharedSocket && sharedSocket.readyState <= WebSocket.OPEN) return;

  sharedSocket = new WebSocket(getWsUrl());

  sharedSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handlers.forEach(h => h(msg));
    } catch { /* ignore */ }
  };

  sharedSocket.onclose = () => {
    sharedSocket = null;
    // Reconnect after 3 seconds
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => ensureSocket(), 3000);
  };

  sharedSocket.onerror = () => {
    sharedSocket?.close();
  };
}

// Exported so other socket hooks (e.g. useCobreatheSync) share this ONE
// singleton connection instead of opening their own.
export function sendMessage(msg: Record<string, unknown>) {
  if (sharedSocket?.readyState === WebSocket.OPEN) {
    sharedSocket.send(JSON.stringify(msg));
  }
}

export function subscribe(handler: MessageHandler) {
  handlers.add(handler);
  ensureSocket();
  return () => {
    handlers.delete(handler);
    // Don't close the socket — other hooks may still be listening
  };
}

// ── Hooks ────────────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Tracks presence and listens for log notifications over a single WebSocket.
 */
export function useGardenSocket(user: AuthUser | null, gardenUserIds: Set<number>, userMomentIds: Set<number>) {
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const [logEvents, setLogEvents] = useState<LogEvent[]>([]);
  const isTrackedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const track = useCallback(() => {
    if (!user || !user.showPresence || isTrackedRef.current) return;
    sendMessage({
      type: "track",
      payload: {
        // Identity is set server-side from the session; these are display only.
        user_id: user.id,
        display_name: user.name,
        avatar_url: user.avatarUrl,
        joined_at: new Date().toISOString(),
      },
    });
    isTrackedRef.current = true;
  }, [user]);

  const untrack = useCallback(() => {
    if (!isTrackedRef.current) return;
    sendMessage({ type: "untrack" });
    isTrackedRef.current = false;
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!isTrackedRef.current && user?.showPresence) track();
    idleTimerRef.current = setTimeout(() => untrack(), IDLE_TIMEOUT_MS);
  }, [track, untrack, user?.showPresence]);

  useEffect(() => {
    if (!user) return;

    const handleMessage: MessageHandler = (msg) => {
      if (msg.type === "presence-sync") {
        const all = (msg.presence as PresenceUser[]) ?? [];
        // Filter: garden members only, not self — matched by user id (no email).
        const filtered = all.filter(
          p => p.user_id !== user.id && gardenUserIds.has(p.user_id)
        );
        setPresentUsers(filtered);
      }

      if (msg.type === "new-log") {
        const payload = msg.payload as LogEvent;
        if (!payload) return;
        // Don't show own logs (matched by user id; null = a guest, never me).
        if (payload.userId != null && payload.userId === user.id) return;
        // Only practices user is in
        if (!userMomentIds.has(payload.momentId)) return;
        setLogEvents(prev => [...prev, payload]);
      }
    };

    const unsub = subscribe(handleMessage);

    // Track presence once socket is ready. Both the poll interval and its
    // 10s give-up timeout are captured here so the effect cleanup can clear
    // them — otherwise an unmount within 10s leaves the 200ms poll firing
    // (and calling track()/resetIdleTimer) after the component is gone.
    let openCheckInterval: ReturnType<typeof setInterval> | null = null;
    let openCheckTimeout: ReturnType<typeof setTimeout> | null = null;
    const trackWhenReady = () => {
      if (sharedSocket?.readyState === WebSocket.OPEN && user.showPresence) {
        track();
        resetIdleTimer();
      } else {
        // Wait for socket to open
        openCheckInterval = setInterval(() => {
          if (sharedSocket?.readyState === WebSocket.OPEN) {
            if (openCheckInterval) clearInterval(openCheckInterval);
            openCheckInterval = null;
            if (user.showPresence) {
              track();
              resetIdleTimer();
            }
          }
        }, 200);
        openCheckTimeout = setTimeout(() => {
          if (openCheckInterval) clearInterval(openCheckInterval);
          openCheckInterval = null;
        }, 10000); // give up after 10s
      }
    };
    trackWhenReady();

    // Visibility change
    const handleVisibility = () => {
      if (document.hidden) {
        untrack();
      } else if (user.showPresence) {
        track();
        resetIdleTimer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Idle timer
    const handleActivity = () => resetIdleTimer();
    const events = ["mousemove", "keydown", "scroll", "touchstart"] as const;
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    resetIdleTimer();

    return () => {
      unsub();
      untrack();
      if (openCheckInterval) clearInterval(openCheckInterval);
      if (openCheckTimeout) clearTimeout(openCheckTimeout);
      document.removeEventListener("visibilitychange", handleVisibility);
      events.forEach(e => window.removeEventListener(e, handleActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      isTrackedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.showPresence, gardenUserIds.size, userMomentIds.size]);

  // Consume log events (caller should clear after processing)
  const consumeLogEvents = useCallback(() => {
    const events = [...logEvents];
    setLogEvents([]);
    return events;
  }, [logEvents]);

  return { presentUsers, logEvents, consumeLogEvents };
}
