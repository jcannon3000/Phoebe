import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { enqueueSession } from "@/lib/sessionOutbox";

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
  // Compline — the night office (BCP pp. 127-135). Counts as an
  // evening-side office for the admin-metrics "morning vs evening"
  // rollup; the SQL surface list in admin-metrics.ts and the parish
  // session enums must also include this value for the session to
  // be picked up by the prayed-today calculations.
  | "compline"
  | "morning-devotion"
  | "early-evening-devotion"
  // "examen" — the Ignatian Daily Examen, a guided five-movement
  // reflective prayer. Counts toward "time praying" like the offices;
  // the server stores surface as free text so no enum migration.
  | "examen"
  // "prayer-list" — opening the manage prayer list page counts as a
  // prayer event for the metrics dashboard. Server exempts this
  // surface from the 5-second floor so a glance still records.
  | "prayer-list";

export function usePrayerSession(
  surface: PrayerSurface | null | undefined,
  /** Optional ref the parent updates with the highest slide index
   *  the user has advanced to during the session. The metrics
   *  endpoint uses this to filter "actually prayed an office"
   *  (≥3 slides) from "tap-and-bail" (<3). */
  slidesCompletedRef?: React.MutableRefObject<number>,
  /** Optional ref the parent flips to true when it has already logged
   *  this session itself — e.g. the office's physical-book "I prayed
   *  this office" button POSTs a deliberate session row, and the
   *  automatic unmount commit here would double-count it. */
  suppressPostRef?: React.MutableRefObject<boolean>,
  /** Optional ref the parent flips to true once the office/devotion
   *  slideshow was actually finished (closing Amen/Done). The unmount
   *  commit stamps the session `completed` from this, so the server's
   *  office-history only counts a finished office — a partial sit that
   *  auto-commits here stays completed:false and doesn't credit it. */
  completedRef?: React.MutableRefObject<boolean>,
) {
  // Refs so the visibility / unload handlers always read the live
  // accumulator without needing surface as a dep — the hook can be
  // mounted with a null surface (waiting on auth) and still no-op.
  const startedAtRef = useRef<Date | null>(null);
  const segmentStartedAtRef = useRef<number | null>(null);
  const accumulatedSecondsRef = useRef<number>(0);
  const surfaceRef = useRef<PrayerSurface | null>(surface ?? null);
  const slidesRef = slidesCompletedRef;

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
        && !suppressPostRef?.current
      ) {
        const endedAt = new Date();
        // Fire-and-forget — the hook is unmounting and we don't want
        // the close to wait on the network. Server drops sessions
        // <5s on its own, so a quick navigate-through doesn't post a
        // useless row.
        const sessionBody = {
          surface: surfaceAtCleanup,
          durationSeconds: total,
          slidesCompleted: slidesRef?.current,
          completed: completedRef?.current ?? false,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        };
        apiRequest("POST", "/api/prayer-sessions", sessionBody).catch(() => {
          // Offline or flaky: queue it durably rather than dropping it. For an
          // office this row carries `completed`, which is the ONLY thing that
          // credits office history — losing it loses the whole office.
          enqueueSession(sessionBody);
        });
      }

      // Reset for the next mount of the same component instance.
      startedAtRef.current = null;
      segmentStartedAtRef.current = null;
      accumulatedSecondsRef.current = 0;
    };
  }, [surface]);
}
