import { useState, useRef, useEffect, useCallback } from "react";

// Apple Notes-style "keep the caret above the keyboard" behavior for a
// full-screen, auto-growing <textarea> that lives in normal document
// flow (the paper-composer pattern). iOS WKWebView only scrolls a
// focused textarea's *box* into view, never the caret line within it —
// so once the textarea is taller than the visible area, the caret slides
// behind the keyboard with every newline. This hook:
//   1. tracks the keyboard inset (window.innerHeight − visualViewport.height
//      under Capacitor's KeyboardResize.None),
//   2. auto-grows the textarea to its content on every change, and
//   3. mirrors the textarea into a hidden div to find the caret's exact
//      viewport Y and scrolls the window so the caret stays above the
//      keyboard.
//
// Returns the ref to attach to the textarea plus the live keyboard /
// viewport heights, which the caller uses to size a trailing spacer that
// gives the page enough scroll runway.
export function useComposerScroll(content: string) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [keyboardH, setKeyboardH] = useState(0);
  // Tracked so the trailing spacer can re-size on rotation / split-screen
  // instead of being frozen at first-render innerHeight.
  const [viewportH, setViewportH] = useState(
    typeof window !== "undefined" ? window.innerHeight : 800,
  );

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const ih = window.innerHeight;
      const vvh = vv?.height ?? ih;
      setKeyboardH(Math.max(0, ih - vvh));
      setViewportH(ih);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const ensureCaretVisible = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const style = window.getComputedStyle(ta);
    const mirror = document.createElement("div");
    const copyProps: Array<keyof CSSStyleDeclaration> = [
      "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
      "letterSpacing", "wordSpacing", "textTransform", "textIndent",
      "whiteSpace", "wordWrap", "overflowWrap",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "boxSizing",
    ];
    for (const p of copyProps) {
      (mirror.style as unknown as Record<string, string>)[p as string] =
        (style as unknown as Record<string, string>)[p as string];
    }
    mirror.style.position = "absolute";
    mirror.style.top = "-9999px";
    mirror.style.left = "-9999px";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.width = `${ta.clientWidth}px`;
    const pos = ta.selectionEnd ?? ta.value.length;
    mirror.textContent = ta.value.substring(0, pos);
    const marker = document.createElement("span");
    marker.textContent = ta.value.substring(pos) || ".";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const taRect = ta.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const caretY = taRect.top + (markerRect.top - mirrorRect.top);
    const lineH = parseFloat(style.lineHeight) || 27;
    document.body.removeChild(mirror);

    const visibleBottom = window.innerHeight - keyboardH;
    const safeBottom = visibleBottom - lineH - 24;
    const safeTop = 80;
    if (caretY + lineH > safeBottom) {
      window.scrollBy({ top: caretY + lineH - safeBottom, behavior: "auto" });
    } else if (caretY < safeTop) {
      window.scrollBy({ top: caretY - safeTop, behavior: "auto" });
    }
  }, [keyboardH]);

  // Auto-grow on every content change so the textarea lives in normal
  // flow, then re-anchor the caret above the keyboard.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
    requestAnimationFrame(ensureCaretVisible);
  }, [content, ensureCaretVisible]);

  // When the keyboard first appears, drag the caret up too — otherwise the
  // existing caret position is hidden under the keyboard until the next
  // keystroke.
  useEffect(() => {
    if (keyboardH > 0) requestAnimationFrame(ensureCaretVisible);
  }, [keyboardH, ensureCaretVisible]);

  return { textareaRef, keyboardH, viewportH };
}
