import { useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { openExternalThenMarkRead } from "@/lib/openExternal";
import { NOUWEN_TODAY_URL, markNouwenRead } from "@/lib/cacReadState";

/**
 * "A moment to reflect" lands on the home with ?reflect=nouwen. This opens
 * today's Nouwen meditation on the Henri Nouwen Society's own page in the
 * reader — the same open, with the same read mark, as the home card. Once per
 * link: the hint is removed from the address as soon as it is used.
 *
 * THE EFFECT USED TO CANCEL ITS OWN OPEN (owner, 2026-10-04: "Henri Nouwen
 * notifications were not opening the reflection even on the new build").
 *
 * It is keyed on useSearch — it has to be, since a tap while the app is
 * running changes only the query and does not remount anything. But it also
 * REWRITES the query itself, to spend the hint, and wouter monkey-patches
 * history.replaceState to dispatch an event its useSearch subscribes to. So:
 *
 *   effect runs → replaceState drops `reflect` → wouter notifies →
 *   `search` changes → React runs the OLD effect's cleanup first →
 *   clearTimeout kills the pending open → the new run returns early.
 *
 * The reader never opened, every time, on every build — and the hint was gone
 * from the address afterwards, which is exactly what it looks like when a
 * deep link "worked" and did nothing.
 *
 * So the open is now cancelled only on UNMOUNT, never by a re-run, and a ref
 * makes it once-per-link rather than relying on the query having changed.
 */
export function NouwenLinkLauncher() {
  const search = useSearch();
  const handledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Unmount only. A re-run must not touch the pending open — see above.
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (handledRef.current) return;
    if (new URLSearchParams(search).get("reflect") !== "nouwen") return;
    handledRef.current = true;
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("reflect");
      window.history.replaceState({}, "", u.pathname + (u.search || "") + u.hash);
    } catch { /* leave it; the open below still happens */ }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      openExternalThenMarkRead(NOUWEN_TODAY_URL, () => markNouwenRead(), { reader: true });
    }, 400);
  }, [search]);

  return null;
}
