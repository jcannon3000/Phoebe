// Open an outbound link. On the iOS Capacitor shell the native bridge
// dispatches the URL through SFSafariViewController so the user stays
// inside Phoebe (back button returns to the slideshow). On the web
// build, fall back to a regular new-tab open.
//
// Usage in components: call openExternal(url) from an onClick handler
// AND prevent default on the underlying anchor (or render a button).
export function openExternal(url: string): void {
  if (!url) return;
  const isNative = !!(window as { PhoebeNative?: { isNative?: () => boolean } })
    .PhoebeNative?.isNative?.();
  if (isNative) {
    // The native shell listens for `phoebe:open-url` and calls
    // Browser.open(). See artifacts/phoebe-mobile/src/native-shell.ts.
    window.dispatchEvent(new CustomEvent("phoebe:open-url", { detail: { url } }));
    return;
  }
  // Web fallback. noopener for security; noreferrer to keep the
  // outbound URL out of the destination's referrer logs.
  window.open(url, "_blank", "noopener,noreferrer");
}
