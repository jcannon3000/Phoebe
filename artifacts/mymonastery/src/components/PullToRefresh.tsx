import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

// Lightweight pull-to-refresh for the dashboard. WKWebView gives us
// rubber-band overscroll for free, but no callback when the rubber
// band releases — so we layer our own gesture on top. Activates only
// when the page is scrolled to the very top and the gesture pulls
// downward; otherwise we no-op and let normal scroll happen.
//
// Gated to /dashboard and / because pulling down inside the prayer-
// mode slideshow or the letter composer would be jarring (and would
// fight their own gesture handlers).

const PULL_THRESHOLD = 80;     // px the user has to drag before we commit
const MAX_PULL = 120;          // px we visually travel before clamping
const RESISTANCE = 0.5;        // dampen the visual travel vs raw drag

export function PullToRefresh() {
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const enabled = location === "/" || location === "/dashboard";

  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (window.scrollY > 0) { startY.current = null; return; }
      const t = e.touches[0];
      if (!t) return;
      startY.current = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshing) return;
      if (startY.current == null) return;
      const t = e.touches[0];
      if (!t) return;
      const delta = t.clientY - startY.current;
      // Only react to a downward pull from the top of the page.
      if (delta <= 0 || window.scrollY > 0) {
        setPull(0);
        return;
      }
      const visual = Math.min(MAX_PULL, delta * RESISTANCE);
      setPull(visual);
    };

    const onTouchEnd = () => {
      if (refreshing) return;
      const committed = pull >= PULL_THRESHOLD;
      startY.current = null;
      if (committed) {
        setRefreshing(true);
        try {
          window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } }));
        } catch { /* ignore */ }
        Promise.resolve(queryClient.invalidateQueries()).finally(() => {
          // Hold the spinner briefly so the user perceives the refresh —
          // invalidate alone returns instantly, before the network round-
          // trip even starts. 600ms covers the LAN case; slow networks
          // just keep the spinner for the natural fetch duration.
          setTimeout(() => {
            setRefreshing(false);
            setPull(0);
          }, 600);
        });
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, pull, refreshing, queryClient]);

  if (!enabled) return null;

  const visible = refreshing || pull > 0;
  const offset = refreshing ? 60 : pull;
  const armed = pull >= PULL_THRESHOLD || refreshing;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        transform: `translateY(${offset - 40}px)`,
        transition: refreshing || pull === 0 ? "transform 0.2s ease" : undefined,
        opacity: visible ? 1 : 0,
        zIndex: 60,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "rgba(46,107,64,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        }}
      >
        <div
          className={refreshing ? "animate-spin" : undefined}
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid rgba(232,228,216,0.85)",
            borderTopColor: "transparent",
            transform: armed && !refreshing ? "rotate(180deg)" : undefined,
            transition: refreshing ? undefined : "transform 0.18s ease",
          }}
        />
      </div>
    </div>
  );
}
