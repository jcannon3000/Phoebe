import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/queryClient";

// Full-page overlay that takes over the app when the Phoebe API is
// confirmed unreachable. Distinct from `NetworkBanner`:
//
//   • NetworkBanner: a top strip for "you're offline" (OS-level) or
//     "flaky" (occasional failures over otherwise-working Wi-Fi). The
//     app remains usable underneath.
//   • ServerDownScreen: a blocking overlay shown only when we've
//     actively confirmed the server isn't responding — i.e. the
//     `/api/healthz` probe itself has failed repeatedly. This is the
//     case during a failed deploy, a Railway outage, etc.
//
// Detection is two-staged so a single transient 5xx never triggers it:
//
//   1. The hook subscribes to the React Query cache and watches for
//      network failures (fetch rejection / TypeError) or 5xx responses
//      from `ApiError`. The first such error while online flips the
//      hook into "probing" — we begin pinging `/api/healthz` every 5s.
//   2. After two consecutive probe failures, the overlay appears.
//   3. The probe keeps running while the overlay is up; the first
//      successful probe tears the overlay back down.
//
// Offline (navigator.onLine === false) is never treated as "server
// down" — the OS knows that case better and NetworkBanner has it
// covered. Going back online while down triggers an immediate probe so
// recovery is fast.

type Status = "ok" | "down";

function isServerSideError(err: unknown): boolean {
  // fetch() rejection — network unreachable, DNS, TLS, TCP reset.
  if (err instanceof TypeError) return true;
  // Our wrapper throws ApiError with .status set. 5xx = server-side.
  if (err instanceof ApiError && err.status >= 500) return true;
  // Some thrown errors carry a numeric `status` without being ApiError.
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === "number" && s >= 500) return true;
  }
  return false;
}

async function probeHealth(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 4500);
    const res = await fetch("/api/healthz", {
      method: "GET",
      signal: ctrl.signal,
      credentials: "omit",
      cache: "no-store",
    });
    window.clearTimeout(timeout);
    if (!res.ok) return false;
    // Captive portals love to return 200 with HTML. Insist on JSON
    // shaped { status: "ok" } so we don't false-recover on a portal.
    const data = await res.json().catch(() => null);
    return !!(data && typeof data === "object" && (data as { status?: unknown }).status === "ok");
  } catch {
    return false;
  }
}

const PROBE_INTERVAL_MS = 5_000;
const FAILS_BEFORE_SHOWING = 2;

export function ServerDownScreen() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("ok");
  // Whether a probe loop is currently running. We only ever want one.
  const probingRef = useRef(false);
  const consecutiveFailsRef = useRef(0);
  // Latest setStatus accessor for the probe loop (so the loop doesn't
  // capture a stale value).
  const setStatusRef = useRef(setStatus);
  setStatusRef.current = setStatus;

  const runProbe = useCallback(async () => {
    if (probingRef.current === false) return; // someone called stop
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Offline — pause the loop. The 'online' listener below will
      // restart it the moment we're back.
      probingRef.current = false;
      return;
    }

    const ok = await probeHealth();
    if (ok) {
      consecutiveFailsRef.current = 0;
      probingRef.current = false;
      setStatusRef.current("ok");
      return;
    }
    consecutiveFailsRef.current += 1;
    if (consecutiveFailsRef.current >= FAILS_BEFORE_SHOWING) {
      setStatusRef.current("down");
    }
    window.setTimeout(runProbe, PROBE_INTERVAL_MS);
  }, []);

  const startProbing = useCallback(() => {
    if (probingRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    probingRef.current = true;
    // Small initial delay so a single 500 that's about to retry doesn't
    // race the probe.
    window.setTimeout(runProbe, 1_500);
  }, [runProbe]);

  // Subscribe to React Query errors. Any server-side-looking failure
  // kicks off the probe (if not already running).
  useEffect(() => {
    const cache = qc.getQueryCache();
    const unsub = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      const action = (event as { action?: { type?: string; error?: unknown } }).action;
      if (!action || action.type !== "error") return;
      if (isServerSideError(action.error)) startProbing();
    });
    return () => unsub();
  }, [qc, startProbing]);

  // When the OS reports we just came back online, jump to a probe so
  // we recover quickly instead of waiting 5s.
  useEffect(() => {
    const onOnline = () => {
      if (status === "down") {
        consecutiveFailsRef.current = 0;
        probingRef.current = false;
        startProbing();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status, startProbing]);

  if (status !== "down") return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100_000,
        background: "#091A10",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 22, lineHeight: 1 }}>🌿</div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#F0EDE6",
          margin: 0,
          marginBottom: 12,
          letterSpacing: "-0.01em",
        }}
      >
        We&rsquo;ll be right back.
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "#8FAF96",
          maxWidth: 360,
          lineHeight: 1.6,
          margin: 0,
          marginBottom: 32,
        }}
      >
        Phoebe can&rsquo;t reach the server right now. We&rsquo;re trying to
        reconnect — this page will return as soon as it&rsquo;s back.
      </p>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          borderRadius: 999,
          background: "rgba(46,107,64,0.12)",
          border: "1px solid rgba(46,107,64,0.3)",
          color: "rgba(200,212,192,0.85)",
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#8FAF96",
            animation: "phoebe-server-pulse 1.4s ease-in-out infinite",
          }}
        />
        Trying to reconnect…
      </div>

      <button
        onClick={() => {
          consecutiveFailsRef.current = 0;
          probingRef.current = false;
          startProbing();
        }}
        style={{
          marginTop: 24,
          padding: "10px 22px",
          background: "transparent",
          color: "rgba(143,175,150,0.7)",
          border: "1px solid rgba(143,175,150,0.25)",
          borderRadius: 999,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        Try again now
      </button>

      <style>{`
        @keyframes phoebe-server-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
