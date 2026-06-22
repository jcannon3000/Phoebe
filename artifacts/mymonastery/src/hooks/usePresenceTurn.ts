import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// Turn 🔆 — the first of the three fellow lights. Passive dwell: ~30s of
// FOREGROUND time in the app lights it, once per local day. Deliberately built
// behind this one hook (the "small abstraction" the brief asks for) so the
// trigger can later swap to a deliberate act — one Godward tap — without
// touching the Fellows surface or the server. Never notifies anyone.
const TURN_MS = 30_000;

function ymd(): string { return new Date().toLocaleDateString("en-CA"); }
function turnedKey(): string { return `phoebe:turn:${ymd()}`; }

export function usePresenceTurn(): void {
  const { user } = useAuth();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    try { if (localStorage.getItem(turnedKey()) === "1") { firedRef.current = true; return; } } catch { /* private mode */ }

    let elapsed = 0;
    let startedAt: number | null = (typeof document === "undefined" || document.visibilityState === "visible") ? Date.now() : null;
    let timer: number | null = null;

    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      try { localStorage.setItem(turnedKey(), "1"); } catch { /* ignore */ }
      apiRequest("POST", "/api/fellows/turn").catch(() => { /* best-effort — presence, not a transaction */ });
    };
    const schedule = () => {
      if (firedRef.current || startedAt === null) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(fire, Math.max(0, TURN_MS - elapsed));
    };
    const onVis = () => {
      if (firedRef.current) return;
      if (document.visibilityState === "visible") {
        if (startedAt === null) { startedAt = Date.now(); schedule(); }
      } else if (startedAt !== null) {
        // Pause the clock while backgrounded — Turn is 30s of ACTUAL use.
        elapsed += Date.now() - startedAt;
        startedAt = null;
        if (timer !== null) { window.clearTimeout(timer); timer = null; }
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user]);
}
