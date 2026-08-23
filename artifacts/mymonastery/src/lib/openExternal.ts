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

/**
 * `reader` is accepted for the callers that still pass it, and deliberately
 * does nothing.
 *
 * It used to route newsletters to SFSafariViewController with Reader mode on.
 * Owner, twice: "undo the reader-mode automation for the CAC newsletter", then
 * "I want a similar animation on CAC and all the newsletters." Reader mode was
 * a different presentation entirely — a sheet that slides up from the bottom,
 * with Safari's own chrome and a toolbar that collapses as you scroll. Sending
 * everything through the one in-app browser gives newsletters the same cross-
 * fade, the same Done button and the same Options menu as the office, so
 * outbound reading is one surface rather than two that behave differently.
 *
 * Left as an accepted no-op rather than removed so the ~dozen call sites don't
 * all have to change to make one behavioural decision.
 */
type OpenOpts = { reader?: boolean };

export function openExternal(url: string, opts?: OpenOpts): void {
  if (!url) return;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative })
    .PhoebeNative;
  // `reader` is accepted and IGNORED — see the note on the type above.
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
  opts?: OpenOpts,
): void {
  if (!url) return;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative }).PhoebeNative;
  // Gate on the method that will ACTUALLY be called. A native build where the
  // gate and the call disagree falls through to the web branch below and marks
  // read the INSTANT the link opens rather than when the person comes back —
  // that was the "newsletter dot flips at tap time" bug.
  if (native?.isNative?.() && native?.openInAppBrowser) {
    void native.openInAppBrowser(url);
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
