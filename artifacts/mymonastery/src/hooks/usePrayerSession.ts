import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

/**
 * Track time spent in a prayer surface (slideshow / Office / Devotion)
 * and POST a prayer_sessions row to the server when the surface is
 * exited. Used by the dashboard's "Times prayed" + "Time praying"
 * community metrics.
 *
 * Lifecycle:
 *   • Hook starts a clock on mount.
 *   • If the page goes to the background (visibilitychange or
 *     pagehide) we accumulate the elapsed segment — the user might
 *     not return, so we want the time before that point credited.
 *   • If the page comes back to the foreground we start a fresh
 *     segment from the moment of return; we DON'T count the time the
 *     user was away.
 *   • On unmount the hook commits a single session row covering the
 *     full accumulated time across segments.
 *
 * The bible-reading flow doesn't need a separate hook: when an
 * Office's lesson slide opens BibleGateway in SFSafariViewController,
 * the React component stays mounted and visibility flips to hidden
 * (web pages still consider an in-app browser overlay as hidden).
 * On return the timer resumes. So all three surfaces — including the
 * reading time launched from a lesson — fall out of this same hook.
 *
 * Anti-cheat (server side) drops sessions <5s and caps >60min per
 * session, so the client doesn't need to be careful about either.
 */
export type PrayerSurface =
  | "slideshow"
  | "morning-prayer"
  | "evening-prayer"
  | "morning-devotion"
  | "early-evening-devotion";

export function usePrayerSession(surface: PrayerSurface | null | undefined) {
  // Refs so the visibility / unload handlers always read the live
  // accumulator without needing surface as a dep — the hook can be
  // mounted with a null surface (waiting on auth) and still no-op.
  const startedAtRef = useRef<Date | null>(null);
  const segmentStartedAtRef = useRef<number | null>(null);
  const accumulatedSecondsRef = useRef<number>(0);
  const surfaceRef = useRef<PrayerSurface | null>(surface ?? null);

  useEffect(() => {
    surfaceRef.current = surface ?? null;
    if (!surface) return;

    startedAtRef.current = new Date();
    segmentStartedAtRef.current = Date.now();
    accumulatedSecondsRef.current = 0;

    const closeSegment = () => {
      const start = segmentStartedAtRef.current;
      if (start === null) return;
      const elapsedMs = Date.now() - start;
      if (elapsedMs > 0) {
        accumulatedSecondsRef.current += elapsedMs / 1000;
      }
      segmentStartedAtRef.current = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        closeSegment();
      } else if (document.visibilityState === "visible") {
        // Start a fresh segment — we don't count time spent away.
        if (segmentStartedAtRef.current === null) {
          segmentStartedAtRef.current = Date.now();
        }
      }
    };

    // pagehide is the iOS-Safari-friendly version of beforeunload —
    // fires when the WKWebView swaps the page out (e.g. user kills
    // the app). We commit any in-flight segment so the time isn't
    // lost. sendBeacon would be ideal but Capacitor's WKWebView
    // doesn't reliably deliver it; the common case is "user
    // backgrounds and comes back" which visibilitychange handles.
    const onPageHide = () => {
      closeSegment();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);

      // Final commit on unmount.
      closeSegment();
      const total = Math.round(accumulatedSecondsRef.current);
      const startedAt = startedAtRef.current;
      const surfaceAtCleanup = surfaceRef.current;
      if (
        total > 0
        && startedAt
        && surfaceAtCleanup
      ) {
        const endedAt = new Date();
        // Fire-and-forget — the hook is unmounting and we don't want
        // the close to wait on the network. Server drops sessions
        // <5s on its own, so a quick navigate-through doesn't post a
        // useless row.
        apiRequest("POST", "/api/prayer-sessions", {
          surface: surfaceAtCleanup,
          durationSeconds: total,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        }).catch(() => { /* best-effort */ });
      }

      // Reset for the next mount of the same component instance.
      startedAtRef.current = null;
      segmentStartedAtRef.current = null;
      accumulatedSecondsRef.current = 0;
    };
  }, [surface]);
}
