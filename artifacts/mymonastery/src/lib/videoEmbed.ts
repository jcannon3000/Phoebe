// ─── Where a YouTube video can actually play, and what to do where it can't ──
//
// THE RULE IS THE PAGE'S ORIGIN, not the platform. YouTube's player refuses to
// initialise unless the page hosting it has a real http(s) origin; from
// anything else it answers "Error 153 · Video player configuration error".
// That single fact explains every branch below, and it is why the cathedral
// pages used to hand their video to the browser instead of showing it.
//
//   Web            https://withphoebe.app    embeds
//   Android shell  https://localhost         embeds
//   iOS shell      capacitor://localhost     REFUSES — not an http(s) origin
//   Either shell's in-app reader             embeds (it loads real URLs)
//
// Measured on the Pixel 7 emulator (2026-09-18): inside the Android shell the
// IFrame API loads, the player reports ready with a real duration and title,
// and requestFullscreen() on the iframe succeeds from a tap — so on Android
// the video plays inline in our own page and goes full screen without leaving
// it.
//
// iOS can't do that in the app's own web view, so it opens THE SAME PAGE at
// withphoebe.app in the in-app reader, where the origin is real. The person
// gets Phoebe's framing, full screen over the app, with our own Done button —
// never YouTube's page, which is what "watch" used to mean there.
//
// One page, one set of formatting, two containers. Anything that wants to show
// a video asks canEmbedVideoHere() and, when the answer is no, hands the
// person openVideoInReader() for the route they are already on.

import { openExternal } from "@/lib/openExternal";

/** Phoebe on the web — the origin whose pages YouTube will embed from. */
export const WEB_ORIGIN = "https://withphoebe.app";

/**
 * A marker on the URL opened in the reader. The page reads it to drop its own
 * in-page chrome (a back link to a history that doesn't exist there), because
 * the reader supplies Done. Nothing else branches on it.
 */
export const NATIVE_WATCH_PARAM = "inapp";

/** Can a YouTube iframe initialise on THIS page? See the note above. */
export function canEmbedVideoHere(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.protocol;
  return p === "https:" || p === "http:";
}

/** Is this page itself the one we opened inside the reader? */
export function isInReaderWatch(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(NATIVE_WATCH_PARAM) === "1";
  } catch {
    return false;
  }
}

/** The withphoebe.app address of an in-app route, marked for the reader. */
export function readerWatchUrl(pathAndQuery: string): string {
  const [path, query = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  params.set(NATIVE_WATCH_PARAM, "1");
  return `${WEB_ORIGIN}${path}?${params.toString()}`;
}

/**
 * Open a route of ours in the in-app reader so its video can play. Defaults to
 * the page the caller is on, which is what every current caller wants.
 */
export function openVideoInReader(pathAndQuery?: string): boolean {
  if (typeof window === "undefined") return false;
  const here = `${window.location.pathname}${window.location.search}`;
  return openExternal(readerWatchUrl(pathAndQuery ?? here));
}

/** A video's poster frame, straight from YouTube's image host. */
export function youtubePoster(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
