// Open an outbound link. On the iOS Capacitor shell we call
// PhoebeNative.openInAppBrowser directly (synchronously, from the user's
// click handler), which calls Browser.open() under the hood and presents
// SFSafariViewController. Calling it inside the click context preserves
// the iOS user-gesture requirement that the popup blocker enforces;
// dispatching through a CustomEvent (the previous wiring) lost that
// context and got silently blocked.
//
// On the web build PhoebeNative is undefined, so we fall back to
// window.open — which iOS Safari blocks unless triggered by a click,
// but we ARE in a click handler here, so it opens a new tab.

type PhoebeNative = {
  isNative?: () => boolean;
  openInAppBrowser?: (url: string) => Promise<void>;
  preloadInAppBrowser?: (url: string) => Promise<void>;
};

export function openExternal(url: string): void {
  if (!url) return;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative })
    .PhoebeNative;
  if (native?.openInAppBrowser) {
    // Don't await — keeps the call within the user-gesture context.
    void native.openInAppBrowser(url);
    return;
  }
  // Web fallback. noopener for security; noreferrer to keep the
  // outbound URL out of the destination's referrer logs.
  window.open(url, "_blank", "noopener,noreferrer");
}

// Warm a URL in the native in-app browser's background so a later openExternal
// of the same URL opens instantly. No-op on web (there's nothing to preload)
// and best-effort everywhere — safe to call from a card's mount effect.
export function preloadExternal(url: string): void {
  if (!url) return;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative }).PhoebeNative;
  if (native?.preloadInAppBrowser) void native.preloadInAppBrowser(url);
}
