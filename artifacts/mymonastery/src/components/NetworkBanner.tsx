import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Top-of-app banner that surfaces network trouble in language the user
// can act on. Two modes:
//
// 1. `offline`: navigator.onLine says we're off — the OS knows for sure.
//    Render an amber strip that reads "📡 You're offline."
//
// 2. `flaky`: navigator.onLine is true, but we've accumulated several
//    query failures in a short window. Common on captive-portal / hotel /
//    library Wi-Fi that TCP-resets some TLS handshakes while letting
//    others through. Point the user at the real fix — portal terms or
//    switching to cellular — instead of showing Safari's generic
//    "Can't establish secure connection" page (which can't be
//    overridden from app code because it fires before our JS loads).
//
// The banner self-dismisses once a query succeeds.
export function NetworkBanner() {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [recentErrors, setRecentErrors] = useState(0);

  // Listen to the OS online/offline events. These fire reliably for
  // hard disconnects (airplane mode, Wi-Fi off) but NOT for silent
  // TLS failures behind a captive portal — that's what recentErrors
  // is for.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Watch the query cache for error/success events. Bump a counter on
  // every error, decay it after 30s, and clear it when anything
  // succeeds — so a run of transient failures raises the banner, and
  // a single recovery brings it back down.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsub = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      const action = (event as { action?: { type?: string } }).action;
      if (!action) return;
      if (action.type === "error") {
        setRecentErrors((n) => {
          const next = n + 1;
          window.setTimeout(() => setRecentErrors((m) => Math.max(0, m - 1)), 30_000);
          return next;
        });
      } else if (action.type === "success") {
        setRecentErrors(0);
      }
    });
    return () => unsub();
  }, [queryClient]);

  const showOffline = !online;
  // Threshold = 3 failures across all queries in a 30s window. Anything
  // less is probably a single legitimate 500 or an aborted navigation.
  const showFlaky = online && recentErrors >= 3;

  if (!showOffline && !showFlaky) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10_000,
        background: showOffline ? "#3A2E14" : "#2A3A2E",
        borderBottom: `1px solid ${showOffline ? "rgba(193,154,58,0.35)" : "rgba(111,175,133,0.35)"}`,
        color: showOffline ? "#E8B872" : "#A8C5A0",
        fontSize: 13,
        lineHeight: 1.4,
        padding: "10px 16px",
        textAlign: "center",
        fontFamily: "'Space Grotesk', sans-serif",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
      }}
    >
      {showOffline
        ? "📡 You're offline. Some things may not load until you reconnect."
        : "📡 Having trouble reaching the server. If you're on public Wi-Fi, tap to accept any portal terms, or try switching to cellular data."}
    </div>
  );
}
