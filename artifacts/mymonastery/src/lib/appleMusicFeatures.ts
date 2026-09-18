// ── The Apple Music switch ──────────────────────────────────────────────────
//
// Owner, 2026-09-18: "Lets have a field in settings that says turn on apple
// music features, they hit it it asks them for permissions, and then it would
// turn on all the features".
//
// ONE consent moment, in the open, in Settings — and then every Apple Music
// feature in the app is on: playing a hymn without leaving Phoebe, the
// Hildegard catalogue's play-the-whole-thing, and music behind a sit. Before
// this switch, each feature would have had to ask on its own, which means a
// permission sheet springing out of a play button someone pressed expecting
// sound (lib/appleMusicNative says why that ambush is the thing to avoid).
//
// THE SWITCH IS NOT THE PERMISSION. iOS holds the real answer, and it can
// change underneath us: the listener can revoke access in Settings, or let
// their subscription lapse, and this flag would still say "on". So the flag is
// necessary but never sufficient — `appleMusicFeaturesReady()` asks the plugin
// every time, and every feature gates on THAT. The flag's job is only to say
// "this person has opted in", so we know we may ask the plugin at all.
//
// Device-scoped on purpose, like lib/musicService: it describes the phone
// (which music app is signed in on it), not the person, so it is not synced
// and not wiped on logout. See reference_logout_wipe_and_local_stamps.

import {
  appleMusicNativeReady, requestAppleMusicNative, hasAppleMusicNative,
} from "@/lib/appleMusicNative";

const KEY = "phoebe:apple-music:on";

/** Fires on this tab when the switch changes (storage events only cross tabs). */
export const APPLE_MUSIC_EVENT = "phoebe:apple-music-changed";

/** Has this person turned the features on? Cheap, synchronous, no prompt. */
export function appleMusicEnabled(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

function write(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the choice just doesn't persist */ }
  try { window.dispatchEvent(new Event(APPLE_MUSIC_EVENT)); } catch { /* SSR */ }
}

/** Is the switch even offerable here? Native iOS build with the plugin. */
export function appleMusicOfferable(): boolean {
  return hasAppleMusicNative();
}

/**
 * Turn the features on: ask iOS for access, and only record the switch if the
 * answer is a real yes — authorized AND subscribed. A switch that flips on
 * while playback can't work would put "Add music" on the contemplation screen
 * and then fail silently at the sit.
 *
 * Returns why it failed, so Settings can say something true rather than just
 * snapping back to off.
 */
export async function enableAppleMusic(): Promise<
  { ok: true } | { ok: false; reason: "unavailable" | "denied" | "no-subscription" }
> {
  if (!hasAppleMusicNative()) return { ok: false, reason: "unavailable" };
  const r = await requestAppleMusicNative();
  if (!r.authorized) { write(false); return { ok: false, reason: "denied" }; }
  if (!r.subscribed) { write(false); return { ok: false, reason: "no-subscription" }; }
  write(true);
  return { ok: true };
}

/** Turn them off. Nothing is revoked in iOS — that is the listener's to do in
 *  the Settings app — but Phoebe stops using it and the features disappear. */
export function disableAppleMusic(): void {
  write(false);
}

/**
 * THE GATE every feature uses: opted in AND iOS still agrees. Never prompts.
 * False on the web, on an older build, after a revoke, and after a lapse — in
 * each case the feature quietly goes back to opening music.apple.com.
 */
export async function appleMusicFeaturesReady(): Promise<boolean> {
  if (!appleMusicEnabled()) return false;
  return appleMusicNativeReady();
}
