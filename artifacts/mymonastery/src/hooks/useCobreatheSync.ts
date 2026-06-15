import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "./useAuth";
import { sendMessage, subscribe } from "./useGardenSocket";

// ── Cobreathe photo sync ─────────────────────────────────────────────────────
//
// When garden-mates are online and breathing at the same time, they should see
// the SAME breathing photos in the SAME order — following the first ("leader")
// person. This hook rides the existing singleton /ws socket (see useGardenSocket)
// and adds three messages, mirroring the presence pattern:
//
//   • cobreathe-start { userId, email, startEpochMs, masterSeed, fingerprint }
//   • cobreathe-stop
//   • cobreathe-sync  { sessions: [...] }   ← server → all clients
//
// Election: among garden-mates with a MATCHING photo fingerprint, the leader is
// the earliest (startEpochMs, userId). The /cobreathe page passes the leader's
// {startEpochMs, masterSeed} into CobreatheBreath, which locks onto it when its
// own count begins (so a leader leaving never disrupts a follower — the order is
// fully derivable from the seed). If there's no leader, the breath announces
// itself via onLeading and we broadcast cobreathe-start.

export interface CobreatheLeader {
  startEpochMs: number;
  masterSeed: number;
}

interface CobreatheSessionMsg {
  userId: number;
  // Only present on the payload WE send (our own email); the server strips it
  // from the broadcast, so received sessions match by userId, not email.
  email?: string;
  startEpochMs: number;
  masterSeed: number;
  fingerprint: string;
}

export function useCobreatheSync(
  user: AuthUser | null,
  gardenUserIds: Set<number>,
  opts: { fingerprint: string; active: boolean },
) {
  const { fingerprint, active } = opts;
  // Sync reveals "I'm breathing right now" to garden-mates — the same class of
  // signal as presence, so we gate the whole feature on showPresence. Off → the
  // breath runs solo on its own random seed (today's behavior), emitting nothing.
  const enabled = !!user && !!user.showPresence && active;

  const [leader, setLeader] = useState<CobreatheLeader | null>(null);

  // Refs read inside the (rarely re-subscribed) socket handler, so changing
  // garden/fingerprint doesn't churn the subscription.
  const userRef = useRef(user);
  userRef.current = user;
  const gardenRef = useRef(gardenUserIds);
  gardenRef.current = gardenUserIds;
  const fpRef = useRef(fingerprint);
  fpRef.current = fingerprint;
  // What we broadcast when WE lead — kept so we can re-announce after a reconnect.
  const leadingRef = useRef<CobreatheSessionMsg | null>(null);
  // Latest sessions snapshot, so we can re-elect when garden/fingerprint change.
  const sessionsRef = useRef<CobreatheSessionMsg[]>([]);

  // Stable key for the garden set so the re-election effect doesn't fire on every
  // render (gardenUserIds is a fresh Set each render).
  const gardenKey = useMemo(() => Array.from(gardenUserIds).sort((a, b) => a - b).join(","), [gardenUserIds]);

  const elect = useCallback((sessions: CobreatheSessionMsg[]): CobreatheLeader | null => {
    const u = userRef.current;
    if (!u) return null;
    const garden = gardenRef.current;
    const fp = fpRef.current;
    const candidates = sessions
      .filter((s) => s.userId !== u.id && garden.has(s.userId) && s.fingerprint === fp)
      .sort((a, b) => a.startEpochMs - b.startEpochMs || a.userId - b.userId);
    const top = candidates[0];
    return top ? { startEpochMs: top.startEpochMs, masterSeed: top.masterSeed } : null;
  }, []);

  // Subscribe to cobreathe-sync. Deps kept minimal (just enabled) so a session in
  // progress isn't torn down by unrelated re-renders. Cleanup auto-stops if we
  // were leading (covers leaving the breath / unmount).
  useEffect(() => {
    if (!enabled) {
      setLeader(null);
      return;
    }
    const handle = (msg: { type: string; [k: string]: unknown }) => {
      if (msg.type !== "cobreathe-sync") return;
      const sessions = (msg.sessions as CobreatheSessionMsg[]) ?? [];
      sessionsRef.current = sessions;
      setLeader(elect(sessions));
      // Reconnect self-heal: if we're leading but the server no longer lists us
      // (our socket dropped + reconnected, dropping our session), re-announce.
      const mine = leadingRef.current;
      const u = userRef.current;
      if (mine && u && !sessions.some((s) => s.userId === u.id)) {
        sendMessage({ type: "cobreathe-start", payload: mine });
      }
    };
    const unsub = subscribe(handle);
    return () => {
      unsub();
      if (leadingRef.current) {
        sendMessage({ type: "cobreathe-stop" });
        leadingRef.current = null;
      }
    };
  }, [enabled, elect]);

  // Re-elect when the garden set or fingerprint changes (e.g. people list loads
  // after the first sync message arrived).
  useEffect(() => {
    if (enabled) setLeader(elect(sessionsRef.current));
  }, [enabled, gardenKey, fingerprint, elect]);

  // Called by CobreatheBreath's onSession at count-begin with the plan we're
  // running — our own when leading/solo, or the leader's when following. Either
  // way we advertise it, so a follower re-broadcasts the leader's plan and the
  // chain survives the original leader leaving.
  const announceSession = useCallback(
    (startEpochMs: number, masterSeed: number) => {
      const u = userRef.current;
      if (!enabled || !u) return;
      const payload: CobreatheSessionMsg = {
        userId: u.id,
        email: u.email,
        startEpochMs,
        masterSeed,
        fingerprint: fpRef.current,
      };
      leadingRef.current = payload;
      sendMessage({ type: "cobreathe-start", payload });
    },
    [enabled],
  );

  const stop = useCallback(() => {
    if (leadingRef.current) {
      sendMessage({ type: "cobreathe-stop" });
      leadingRef.current = null;
    }
  }, []);

  return { leader, announceSession, stop };
}
