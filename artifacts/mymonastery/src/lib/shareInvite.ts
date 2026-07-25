// Share an invite to Phoebe through the best surface the runtime offers —
// same three-tier fallback as sharePrayerRequest.ts (native Share plugin →
// Web Share API → clipboard).
//
// The link points at /invite (not the bare public domain): visited from
// mobile Safari with the app NOT installed, that page immediately redirects
// to the App Store — someone can't already have the app open a Universal
// Link straight past Safari, so this only ever fires for a visitor who needs
// the install. Android/desktop just see the normal welcome page.

import { isNativeShell } from "./isNativeShell";

const PUBLIC_BASE = "https://withphoebe.app";

export async function shareInvite(): Promise<{ copied: boolean }> {
  const url = `${PUBLIC_BASE}/invite`;
  const text = "I've been using Phoebe to keep a daily prayer rhythm — thought you might like it too.";
  const shareDetail = { title: "Phoebe", text, url };

  if (isNativeShell()) {
    window.dispatchEvent(new CustomEvent("phoebe:share", { detail: shareDetail }));
    return { copied: false };
  }

  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share(shareDetail);
      return { copied: false };
    } catch {
      // User cancelled or the browser refused — try the clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return { copied: true };
  } catch {
    window.prompt("Copy this link", url);
    return { copied: false };
  }
}
