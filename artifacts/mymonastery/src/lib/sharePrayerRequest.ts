// Share a public prayer-request URL through the best surface the
// runtime offers:
//
//   1. iOS native shell — dispatches `phoebe:share`, which the
//      Capacitor Share plugin opens as a real
//      UIActivityViewController (Messages, Mail, AirDrop, Copy,
//      Notes, every Share Extension the user has enabled).
//   2. Web browsers with the Web Share API — `navigator.share`.
//   3. Fallback — copy the link to the clipboard, with a one-shot
//      `window.prompt` if the clipboard write throws.
//
// The URL is hard-coded to `https://withphoebe.app` rather than read
// from `window.location.origin`. Inside the Capacitor WKWebView the
// origin resolves to `capacitor://localhost`, and the previous share
// implementation was sending that — recipients got a useless
// app-internal URL their phone couldn't open. The public domain is
// the only thing that opens for everyone (and lets iMessage render
// the link preview from our Open Graph tags).
//
// Returns `{ copied: true }` only on the clipboard-fallback path so
// the caller can flash a "Link copied ✓" affordance. The native and
// Web Share paths leave the affordance off because the OS sheet
// already gives the user clear acknowledgement.

import { isNativeShell } from "./isNativeShell";

const PUBLIC_BASE = "https://withphoebe.app";

export async function sharePrayerRequest({
  shareToken,
  ownerName,
}: {
  shareToken: string;
  ownerName: string;
}): Promise<{ copied: boolean }> {
  const url = `${PUBLIC_BASE}/p/${shareToken}`;
  const text =
    `${ownerName} is asking for prayer on Phoebe.` +
    `\n\nTap to read and pray:`;
  const shareDetail = { title: "Prayer request", text, url };

  // 1. Native iOS share sheet via the Capacitor Share plugin. We
  // dispatch and return — the native shell handles cancellation
  // silently, and we don't want to also fire the web Share API
  // underneath it.
  if (isNativeShell()) {
    window.dispatchEvent(new CustomEvent("phoebe:share", { detail: shareDetail }));
    return { copied: false };
  }

  // 2. Web Share API (mobile Safari, mobile Chrome, modern Android
  // browsers). Throws on user cancel — fall through to clipboard.
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share(shareDetail);
      return { copied: false };
    } catch {
      // User cancelled or the browser refused — try the clipboard.
    }
  }

  // 3. Clipboard fallback for desktop browsers and any environment
  // missing the Web Share API.
  try {
    await navigator.clipboard.writeText(url);
    return { copied: true };
  } catch {
    window.prompt("Copy this link", url);
    return { copied: false };
  }
}
