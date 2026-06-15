import { useEffect, useRef } from "react";

function nativeEvent(name: string) {
  try { window.dispatchEvent(new CustomEvent(name)); } catch { /* non-fatal */ }
}

// Keep the screen on while `active`. Mirrors ContemplationTimer's two-layer
// approach: the native shell toggles UIApplication.isIdleTimerDisabled via the
// phoebe:contemplation-keep-awake / -allow-sleep bridge (those event names are
// the app's generic keep-awake channel — native-shell.ts wires them straight to
// the KeepAwake plugin), and the plain web build uses navigator.wakeLock,
// re-acquired on foreground since the OS releases it when the app backgrounds.
export function useKeepAwake(active: boolean) {
  const ref = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const acquire = async () => {
      nativeEvent("phoebe:contemplation-keep-awake");
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } };
        if (nav.wakeLock && !ref.current) {
          const sentinel = await nav.wakeLock.request("screen");
          if (cancelled) { try { await sentinel.release(); } catch { /* non-fatal */ } }
          else ref.current = sentinel;
        }
      } catch { /* unsupported / denied — the breath still works, screen may dim */ }
    };
    const onVis = () => { if (document.visibilityState === "visible" && !ref.current) void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      nativeEvent("phoebe:contemplation-allow-sleep");
      try { ref.current?.release(); } catch { /* non-fatal */ }
      ref.current = null;
    };
  }, [active]);
}
