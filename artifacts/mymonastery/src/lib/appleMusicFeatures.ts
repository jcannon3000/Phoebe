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
// GRANTED MEANS ON (owner, 2026-09-18: "Once a user has granted permission,
// it should be on"). Three states, not two:
//   "1"  turned on here in Phoebe
//   "0"  turned OFF here — the only thing that keeps a granted phone off
//   none never chosen: follows iOS. If access is granted and the phone can
//        play catalogue music, the features are on, no switch needed.
// The iOS check never prompts, so "none" can't spring a permission sheet —
// it only notices a yes that was already given.
//
// Device-scoped on purpose, like lib/musicService: it describes the phone
// (which music app is signed in on it), not the person, so it is not synced
// and not wiped on logout. See reference_logout_wipe_and_local_stamps.

import {
  appleMusicNativeReady, requestAppleMusicNative, hasAppleMusicNative,
  hasAppleMusicCollectionNative,
} from "@/lib/appleMusicNative";

const KEY = "phoebe:apple-music:on";

/** Fires on this tab when the switch changes (storage events only cross tabs). */
export const APPLE_MUSIC_EVENT = "phoebe:apple-music-changed";

/** Turned on here explicitly? Cheap, synchronous, no prompt. The honest
 *  answer to "is it on" is async — appleMusicFeaturesReady(). */
export function appleMusicEnabled(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

/** Turned OFF here explicitly — the one state a granted phone stays off in. */
export function appleMusicTurnedOff(): boolean {
  try { return localStorage.getItem(KEY) === "0"; } catch { return false; }
}

/** "on" / "off" record a choice; "follow" forgets it and defers to iOS. */
function write(state: "on" | "off" | "follow"): void {
  try {
    if (state === "follow") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, state === "on" ? "1" : "0");
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
  // A no from iOS forgets the choice rather than recording "off": if they
  // later allow it in the iOS Settings app, it should simply be on.
  if (!r.authorized) { write("follow"); return { ok: false, reason: "denied" }; }
  if (!r.subscribed) { write("follow"); return { ok: false, reason: "no-subscription" }; }
  write("on");
  return { ok: true };
}

/** Turn them off. Nothing is revoked in iOS — that is the listener's to do in
 *  the Settings app — but Phoebe stops using it and the features disappear. */
export function disableAppleMusic(): void {
  write("off");
}

/**
 * THE GATE every feature uses: not turned off here AND iOS agrees (granted,
 * subscribed). Never prompts. False on the web, on an older build, after a
 * revoke, after a lapse, and after the Settings switch was turned off — in
 * each case the feature quietly goes back to opening music.apple.com.
 */
export async function appleMusicFeaturesReady(): Promise<boolean> {
  if (appleMusicTurnedOff()) return false;
  return appleMusicNativeReady();
}

/**
 * THE GATE FOR MUSIC BEHIND A PRACTICE — everything above, AND a build whose
 * plugin can actually play a PLAYLIST.
 *
 * Swift ships in the app binary, not in the web bundle: a phone updated from
 * the server has the new screens while its plugin is still the old one, with
 * playTrack but no playPlaylist. Gating those surfaces on
 * appleMusicFeaturesReady() alone would put "Add music" on the contemplation
 * screen and a Music row on the office, let someone choose a playlist, and
 * then play silence with nothing to explain it. So they ask for the method
 * itself, and simply aren't offered until the app is rebuilt.
 *
 * (Hymns is unaffected — one song is playTrack, which has been on devices for
 * a while, and /hildegard checks the method itself before offering to play the
 * whole thing, falling back to opening music.apple.com.)
 */
export async function appleMusicPlaylistsReady(): Promise<boolean> {
  if (!hasAppleMusicCollectionNative()) return false;
  return appleMusicFeaturesReady();
}
