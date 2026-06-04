/**
 * Warms the in-app reflection page a reader returns to after opening a daily
 * newsletter in the in-app browser, so the post-browser redirect lands on a
 * ready page instead of a loading one. Mounted once, globally (App.tsx).
 *
 * Triggered by preheatReflection(source) — dispatched from the home card on tap,
 * i.e. while the user is still reading in the browser:
 *   • CAC      — prefetch /reflect/cac's route chunk + its /api/cac/* queries.
 *   • FDD/SSJE — prefetch /menu/reflections/:source's route chunk + load the
 *     embedded newsletter URL in a hidden iframe so the reader's iframe paints
 *     from a warm HTTP cache. (These pages allow framing; CAC doesn't — which
 *     is why CAC warms data instead of an iframe.)
 *
 * Best-effort and silent: warming happens in the main WebView while the native
 * browser is up, so it may be throttled until the browser is dismissed — a
 * missed warm just means the page loads on arrival as it otherwise would.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { FDD_TODAY_URL, SSJE_TODAY_URL } from "@/lib/cacReadState";
import { PREHEAT_REFLECTION_EVENT, type ReflectionSource } from "@/lib/reflectionPreheat";

// Keep the hidden warm-iframe mounted long enough to pull the document + bundle
// into the HTTP cache, but not so long it lingers as a background page.
const WARM_IFRAME_MS = 45_000;

export function ReflectionPreheater() {
  const qc = useQueryClient();
  const { user } = useAuth();
  // The cross-origin newsletter URL currently warming in a hidden iframe (FDD or
  // SSJE), or null. One at a time — a second tap replaces the first.
  const [warmUrl, setWarmUrl] = useState<string | null>(null);

  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | undefined;

    // Trigger the same dynamic import the lazy route uses, so its JS chunk is
    // already in memory when ReflectionReturnRedirect navigates there.
    const warmChunk = (source: ReflectionSource) => {
      if (source === "cac") void import("@/pages/reflect-cac").catch(() => {});
      else void import("@/pages/reflection-read").catch(() => {});
    };

    // Prime the companion page's data so it renders populated, not spinning.
    const warmCacData = () => {
      if (!user) return; // /api/cac/readers|reflections are auth-gated
      const today = new Date().toLocaleDateString("en-CA");
      void qc.prefetchQuery({ queryKey: ["/api/cac/today-meta"], queryFn: () => apiRequest("GET", "/api/cac/today-meta"), staleTime: 30 * 60_000 });
      void qc.prefetchQuery({ queryKey: ["/api/cac/readers", today], queryFn: () => apiRequest("GET", `/api/cac/readers?ymd=${today}`), staleTime: 60_000 });
      void qc.prefetchQuery({ queryKey: ["/api/cac/reflections/mine"], queryFn: () => apiRequest("GET", "/api/cac/reflections/mine"), staleTime: 30_000 });
      void qc.prefetchQuery({ queryKey: ["/api/cac/reflections/responses"], queryFn: () => apiRequest("GET", "/api/cac/reflections/responses"), staleTime: 30_000 });
    };

    const onPreheat = (e: Event) => {
      const source = (e as CustomEvent).detail?.source as ReflectionSource | undefined;
      if (!source) return;
      try {
        warmChunk(source);
        if (source === "cac") {
          warmCacData();
        } else {
          // FDD / SSJE — warm the embedded newsletter in a hidden iframe.
          setWarmUrl(source === "fdd" ? FDD_TODAY_URL : SSJE_TODAY_URL);
          if (clearTimer) clearTimeout(clearTimer);
          clearTimer = setTimeout(() => setWarmUrl(null), WARM_IFRAME_MS);
        }
      } catch {
        /* best effort */
      }
    };

    window.addEventListener(PREHEAT_REFLECTION_EVENT, onPreheat);
    return () => {
      window.removeEventListener(PREHEAT_REFLECTION_EVENT, onPreheat);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [qc, user]);

  if (!warmUrl) return null;
  // Off-screen, inert, invisible — present only to pull the page into the
  // WebView's HTTP cache so the reader's iframe paints from a warm start.
  return (
    <iframe
      key={warmUrl}
      src={warmUrl}
      title=""
      aria-hidden
      tabIndex={-1}
      style={{ position: "fixed", left: -9999, top: -9999, width: 1, height: 1, opacity: 0, border: 0, pointerEvents: "none" }}
    />
  );
}
