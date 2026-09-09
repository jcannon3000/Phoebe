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
  /** The place they checked into, when they checked into one. */
  placeId?: number | null;
}

export function useCobreatheSync(
  user: AuthUser | null,
  gardenUserIds: Set<number>,
  opts: { fingerprint: string; active: boolean; presence?: boolean },
) {
  const { fingerprint, active, presence = false } = opts;
  // Sync reveals "I'm breathing right now" to garden-mates — the same class of
  // signal as presence, so we gate the whole feature on showPresence. A per-sit
  // `presence` override lets someone opt into it for THIS sit without flipping
  // the global setting. Off → the breath runs solo on its own random seed
  // (today's behavior), emitting nothing.
  const enabled = !!user && (!!user.showPresence || presence) && active;

  const [leader, setLeader] = useState<CobreatheLeader | null>(null);
  // Garden-mates breathing RIGHT NOW (their userIds, excluding self). Lets the
  // page capture who you cobreathed with so the first to finish still sees the
  // others on the summary — even after their live session ends.
  const [coBreatherIds, setCoBreatherIds] = useState<number[]>([]);

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
  /** Latest place counts from the server, kept so re-entering the picker can
   *  paint immediately — see the re-seed in the subscribe effect. */
  const placeCountsRef = useRef<Record<number, number>>({});
  /**
   * WHO ELSE IS BREATHING RIGHT NOW, AND WHERE — place id → other people's
   * user ids, never including you.
   *
   * The place list reads this to say "Breathing Together with 3 people" while
   * it is happening, instead of only "3 breathed here today" once it is over.
   * Filled from the same sessions snapshot that elects the leader, so there is
   * one idea of who is live.
   */
  const [breathersByPlace, setBreathersByPlace] = useState<Record<number, number>>({});

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

  // Garden-mates currently breathing (any photo set), excluding self — the live
  // co-breather set, deduped.
  /**
   * Live breathers grouped by the place they checked into, minus you.
   *
   * NOT garden-filtered, unlike coBreathers above: a place is a public,
   * physical fact — the person across the room counts whether or not you know
   * them. That is the whole point of checking in somewhere.
   */
  const byPlace = useCallback((counts: Record<number, number> | undefined): Record<number, number> => {
    const mine = leadingRef.current?.placeId;
    const out: Record<number, number> = {};
    for (const [k, n] of Object.entries(counts ?? {})) {
      const place = Number(k);
      // The server counts everyone at the place, including us — we know the
      // place we announced, so we take ourselves back out here. It cannot
      // publish a per-person subtraction without putting each person's
      // location on the wire, which is the thing we stopped doing.
      const others = n - (typeof mine === "number" && mine === place ? 1 : 0);
      if (others > 0) out[place] = others;
    }
    return out;
  }, []);

  const coBreathers = useCallback((sessions: CobreatheSessionMsg[]): number[] => {
    const u = userRef.current;
    if (!u) return [];
    const garden = gardenRef.current;
    return Array.from(new Set(
      sessions.filter((s) => s.userId !== u.id && garden.has(s.userId)).map((s) => s.userId),
    ));
  }, []);

  // Subscribe to cobreathe-sync. Deps kept minimal (just enabled) so a session in
  // progress isn't torn down by unrelated re-renders. Cleanup auto-stops if we
  // were leading (covers leaving the breath / unmount).
  useEffect(() => {
    if (!enabled) {
      setLeader(null);
      setCoBreatherIds([]);
      setBreathersByPlace({});
      return;
    }
    const handle = (msg: { type: string; [k: string]: unknown }) => {
      if (msg.type !== "cobreathe-sync") return;
      const sessions = (msg.sessions as CobreatheSessionMsg[]) ?? [];
      sessionsRef.current = sessions;
      placeCountsRef.current = (msg.placeCounts as Record<number, number>) ?? {};
      setLeader(elect(sessions));
      setCoBreatherIds(coBreathers(sessions));
      setBreathersByPlace(byPlace(placeCountsRef.current));
      // Reconnect self-heal: if we're leading but the server no longer lists us
      // (our socket dropped + reconnected, dropping our session), re-announce.
      const mine = leadingRef.current;
      const u = userRef.current;
      if (mine && u && !sessions.some((s) => s.userId === u.id)) {
        sendMessage({ type: "cobreathe-start", payload: mine });
      }
    };
    /**
     * SEED FROM THE LAST SNAPSHOT WE SAW.
     *
     * The server sends a cobreathe-sync only on a NEW socket connection or
     * when someone starts or stops. The socket is never closed between modes,
     * so coming back to the place picker — which is the ordinary path, since
     * picking a place goes through the stats screen and back — got no snapshot
     * and the blue "Breathing Together with N" line never appeared. Breathing
     * self-heals because announcing triggers a broadcast; the picker announces
     * nothing by design, so it was the one surface with no way to recover.
     */
    setBreathersByPlace(byPlace(placeCountsRef.current));
    const unsub = subscribe(handle);
    return () => {
      unsub();
      if (leadingRef.current) {
        sendMessage({ type: "cobreathe-stop" });
        leadingRef.current = null;
      }
    };
  }, [enabled, elect, coBreathers, byPlace]);

  // Re-elect when the garden set or fingerprint changes (e.g. people list loads
  // after the first sync message arrived).
  useEffect(() => {
    if (enabled) { setLeader(elect(sessionsRef.current)); setCoBreatherIds(coBreathers(sessionsRef.current)); }
  }, [enabled, gardenKey, fingerprint, elect, coBreathers]);

  // Called by CobreatheBreath's onSession at count-begin with the plan we're
  // running — our own when leading/solo, or the leader's when following. Either
  // way we advertise it, so a follower re-broadcasts the leader's plan and the
  // chain survives the original leader leaving.
  const announceSession = useCallback(
    (startEpochMs: number, masterSeed: number, placeId?: number | null) => {
      const u = userRef.current;
      if (!enabled || !u) return;
      const payload: CobreatheSessionMsg = {
        userId: u.id,
        // Audit #20: don't transmit our email over /ws. The receive side matches
        // only on userId + fingerprint and no client reads email off the payload,
        // so sending it was pure over-transmission relying on the server to strip it.
        startEpochMs,
        masterSeed,
        fingerprint: fpRef.current,
        // WHERE, so a place can say who is breathing there right now.
        placeId: typeof placeId === "number" ? placeId : null,
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

  return { leader, announceSession, stop, coBreatherIds, breathersByPlace };
}
