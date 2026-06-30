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
  openReaderView?: (url: string) => Promise<void>;
  preloadInAppBrowser?: (url: string) => Promise<void>;
};

export function openExternal(url: string, opts?: { reader?: boolean }): void {
  if (!url) return;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative })
    .PhoebeNative;
  // Newsletters / reflections pass reader:true → open in Safari Reader view
  // (clean article text). Falls back to the normal in-app browser if the shell
  // doesn't expose a reader view, then to a web tab. Don't await — keeps the
  // call within the user-gesture context.
  if (opts?.reader && native?.openReaderView) {
    void native.openReaderView(url);
    return;
  }
  if (native?.openInAppBrowser) {
    void native.openInAppBrowser(url);
    return;
  }
  // Web fallback. noopener for security; noreferrer to keep the
  // outbound URL out of the destination's referrer logs. (Reader mode is a
  // native SFSafari affordance — a plain web tab can't be forced into it.)
  window.open(url, "_blank", "noopener,noreferrer");
}

// Open a reflection / newsletter, and mark it read only once the user CLOSES
// the in-app browser (native), not the instant they open it — so the "done"
// animation waits until they've actually X'd out. On web there's no close event
// (it opens a new tab), so we mark on open, which is the best we can do.
export function openExternalThenMarkRead(
  url: string,
  markRead: () => void,
  opts?: { reader?: boolean },
): void {
  if (!url) return;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative }).PhoebeNative;
  if (native?.isNative?.() && native.openInAppBrowser) {
    // Newsletters (reader:true) open in Safari reader view; everything else in
    // the normal in-app browser. Both emit phoebe:browserfinished on close.
    if (opts?.reader && native.openReaderView) void native.openReaderView(url);
    else void native.openInAppBrowser(url);
    const onDone = () => {
      window.removeEventListener("phoebe:browserfinished", onDone);
      markRead();
    };
    window.addEventListener("phoebe:browserfinished", onDone);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  markRead();
}

// Warm a URL in the native in-app browser's background so a later openExternal
// of the same URL opens instantly. No-op on web (there's nothing to preload)
// and best-effort everywhere — safe to call from a card's mount effect.
export function preloadExternal(url: string): void {
  if (!url) return;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative }).PhoebeNative;
  if (native?.preloadInAppBrowser) void native.preloadInAppBrowser(url);
}
