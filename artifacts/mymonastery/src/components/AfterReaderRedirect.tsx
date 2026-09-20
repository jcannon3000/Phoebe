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
 * BACK AND DONE ARE DIFFERENT EXITS. The owner wants the reader's Done to end
 * the practice — log and pray — and its Back to return to the catalogue with
 * nothing else happening (2026-09-19: "I want it to go to the closing page and
 * log the song", and Back "to take you to pick a different song"). A plain
 * dismissal cannot be told apart from Done by the web side, so the NATIVE bar
 * says which: `phoebe:browserfinished` may carry `detail.action`, and "back"
 * drops the note instead of following it. Until the native side sends one,
 * every dismissal counts as Done, which is the behaviour the owner asked for
 * when there is only one way out.
 *
 * Mounted once, globally, inside the router (App.tsx).
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { clearAfterReader, takeAfterReader } from "@/lib/afterReader";
import { logListenNow } from "@/lib/logListenNow";

export function AfterReaderRedirect() {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    const consume = () => {
      const note = takeAfterReader();
      if (!note) return;
      // THE LOG BELONGS TO DONE, not to the tap that opened the reader: Back
      // consumes nothing, so it writes nothing (see lib/afterReader).
      if (note.logAs) logListenNow(note.logAs);
      if (location !== note.to) setLocation(note.to);
    };
    const checkVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      consume();
    };
    document.addEventListener("visibilitychange", checkVisible);
    window.addEventListener("phoebe:appactive", checkVisible);
    const onBrowserFinished = (e: Event) => {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "back") { clearAfterReader(); return; }
      setTimeout(consume, 0);
    };
    window.addEventListener("phoebe:browserfinished", onBrowserFinished);
    return () => {
      document.removeEventListener("visibilitychange", checkVisible);
      window.removeEventListener("phoebe:appactive", checkVisible);
      window.removeEventListener("phoebe:browserfinished", onBrowserFinished);
    };
  }, [location, setLocation]);
  return null;
}
