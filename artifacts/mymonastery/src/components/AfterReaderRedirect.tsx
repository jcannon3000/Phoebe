/**
 * Where the app goes when the in-app reader closes — for the music pages.
 *
 * Owner, 2026-09-19, of the hymn player's Done: "the done proceeds in the
 * slideshow to the closing prompt of taking a moment to bring to god… and have
 * it be logged". On the web and on Android /video's own Done does exactly
 * that. On iOS that page runs INSIDE the reader, a separate web view that
 * cannot move the app underneath it, so the reader's own Done is the way on:
 * the caller leaves a note (lib/afterReader) before opening it, and this
 * consumes the note when the reader closes.
 *
 * The same shape as ReflectionReturnRedirect beside it, and the same triggers:
 * the native shell's browserfinished event, plus visibility / foreground for
 * the cases where the reader was never native at all.
 *
 * Mounted once, globally, inside the router (App.tsx).
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { takeAfterReader } from "@/lib/afterReader";

export function AfterReaderRedirect() {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    const consume = () => {
      const target = takeAfterReader();
      if (target && location !== target) setLocation(target);
    };
    const checkVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      consume();
    };
    document.addEventListener("visibilitychange", checkVisible);
    window.addEventListener("phoebe:appactive", checkVisible);
    const onBrowserFinished = () => setTimeout(consume, 0);
    window.addEventListener("phoebe:browserfinished", onBrowserFinished);
    return () => {
      document.removeEventListener("visibilitychange", checkVisible);
      window.removeEventListener("phoebe:appactive", checkVisible);
      window.removeEventListener("phoebe:browserfinished", onBrowserFinished);
    };
  }, [location, setLocation]);
  return null;
}
