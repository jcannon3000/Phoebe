import { useEffect } from "react";
import { useSearch } from "wouter";
import { openExternalThenMarkRead } from "@/lib/openExternal";
import { NOUWEN_TODAY_URL, markNouwenRead } from "@/lib/cacReadState";

// "A moment to reflect" lands on the home with ?reflect=nouwen. A build that knows the hint
// opens today's Nouwen meditation on the Henri Nouwen Society's own page in the reader (the
// same open, with the same read mark, as the home card); a build that does not simply shows
// the home. Once per link: the hint is removed from the address as soon as it is used.
export function NouwenLinkLauncher() {
  const search = useSearch();
  useEffect(() => {
    if (new URLSearchParams(search).get("reflect") !== "nouwen") return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("reflect");
      window.history.replaceState({}, "", u.pathname + (u.search || "") + u.hash);
    } catch { /* leave it; the open below still happens once per mount */ }
    const t = window.setTimeout(() => {
      openExternalThenMarkRead(NOUWEN_TODAY_URL, () => markNouwenRead(), { reader: true });
    }, 400);
    return () => window.clearTimeout(t);
  }, [search]);
  return null;
}
