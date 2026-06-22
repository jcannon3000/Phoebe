import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [recentErrors, setRecentErrors] = useState(0);
  // The banner is a brief NOTICE, not a persistent bar — it shows when trouble
  // starts, then fades out on its own even if you're still offline.
  const [autoHidden, setAutoHidden] = useState(false);

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
  //
  // Critically, we IGNORE 4xx (auth / permission / not-found) errors
  // here. Those are policy decisions made by a happily reachable
  // server — not a sign the network is flaky. Offices-only accounts
  // 403 on /api/groups, /api/prayer-feeds/mine, etc.; counting those
  // would trip the banner on first paint of every screen even though
  // everything is working as designed. Only true network-class
  // failures (fetch reject, 5xx, timeout) should drive the banner.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsub = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      const action = (event as {
        action?: { type?: string; error?: unknown };
      }).action;
      if (!action) return;
      if (action.type === "error") {
        // apiRequest throws Error with a `status` property on non-2xx
        // responses. Pull it off and skip 4xx so a "Forbidden" doesn't
        // masquerade as "network down."
        const status = (action.error as { status?: number } | undefined)?.status;
        if (typeof status === "number" && status >= 400 && status < 500) {
          return;
        }
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

  // Auto-dismiss after a few seconds so it doesn't sit on screen the whole time
  // you're offline. A fresh offline/flaky transition re-arms it (the effect
  // re-runs when showOffline/showFlaky flips), so a NEW drop still gets noticed.
  useEffect(() => {
    if (!showOffline && !showFlaky) { setAutoHidden(false); return; }
    setAutoHidden(false);
    const id = window.setTimeout(() => setAutoHidden(true), 4000);
    return () => window.clearTimeout(id);
  }, [showOffline, showFlaky]);

  if ((!showOffline && !showFlaky) || autoHidden) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        // Pinned to the BOTTOM so it doesn't cover the header / Daily-progress
        // pill at the top of the screen.
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10_000,
        background: showOffline ? "#3A2E14" : "#2A3A2E",
        borderTop: `1px solid ${showOffline ? "rgba(193,154,58,0.35)" : "rgba(111,175,133,0.35)"}`,
        color: showOffline ? "#E8B872" : "#A8C5A0",
        fontSize: 13,
        lineHeight: 1.4,
        padding: "10px 16px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        textAlign: "center",
        fontFamily: "'Space Grotesk', sans-serif",
        boxShadow: "0 -2px 8px rgba(0,0,0,0.35)",
      }}
    >
      {showOffline ? t("network.offline") : t("network.flaky")}
    </div>
  );
}
