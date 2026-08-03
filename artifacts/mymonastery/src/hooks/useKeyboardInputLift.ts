import { useEffect } from "react";

// Keep a focused text input above the on-screen keyboard. Capacitor runs
// KeyboardResize.None (the webview does NOT shrink when the keyboard opens),
// so a field near the bottom of the screen — or on a page whose scrollable
// area is a fixed-height inner panel rather than the document itself — can
// end up hidden behind it with nothing to scroll. This measures the inset
// from visualViewport, finds whichever ancestor actually scrolls (an inner
// `overflow-y:auto` panel if one exists, otherwise the document/window),
// gives it that much scroll runway, and lifts the focused field above the
// keyboard once it has settled.
export function useKeyboardInputLift(): void {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return undefined;
    let raf = 0;
    let paddedEl: HTMLElement | null = null;
    const inset = () => Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const clearPadding = () => {
      if (paddedEl) { paddedEl.style.paddingBottom = ""; paddedEl = null; }
    };
    // Walk up from the focused field to the nearest ancestor that actually
    // scrolls (has overflow-y auto/scroll AND overflowing content). Falls
    // back to the document/window when nothing in between does — the normal
    // full-page-flow case most of the app's surfaces use.
    const nearestScrollable = (el: HTMLElement): HTMLElement | null => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== document.body) {
        const cs = window.getComputedStyle(node);
        if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
        node = node.parentElement;
      }
      return null;
    };
    const lift = () => {
      const kb = inset();
      const el = document.activeElement;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) { clearPadding(); return; }
      const panel = nearestScrollable(el);
      const container: HTMLElement = panel ?? document.body;
      if (paddedEl && paddedEl !== container) clearPadding();
      container.style.paddingBottom = kb > 0 ? `${kb}px` : "";
      paddedEl = kb > 0 ? container : null;
      if (kb <= 0) return;
      const r = el.getBoundingClientRect();
      const visibleBottom = window.innerHeight - kb - 24;
      if (r.bottom <= visibleBottom) return;
      const delta = r.bottom - visibleBottom + 8;
      if (panel) panel.scrollBy({ top: delta, behavior: "smooth" });
      else window.scrollBy({ top: delta, behavior: "smooth" });
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      // The keyboard animates in over ~300ms; lift once it has settled, then
      // again to catch the final viewport.
      window.setTimeout(lift, 280);
      window.setTimeout(lift, 520);
    };
    const onVV = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(lift); };
    window.addEventListener("focusin", onFocusIn);
    vv.addEventListener("resize", onVV);
    return () => {
      window.removeEventListener("focusin", onFocusIn);
      vv.removeEventListener("resize", onVV);
      cancelAnimationFrame(raf);
      clearPadding();
    };
  }, []);
}
