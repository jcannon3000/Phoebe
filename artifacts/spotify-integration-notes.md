# Music integration — readiness notes (Spotify + Apple Music)

For the **Listening** practice (audio divina, `pages/listening.tsx`). Goal: let a
person play sacred/contemplative music from **their** service while Phoebe holds
the four-movement prayer frame + timer. Privacy floor: **never read listening
history** — only the minimum to start playback.

## Architecture — one surface, two services, never a lying control

`lib/musicPlayback.ts` → `useMusicPlayback()` is the ONLY thing the Listening UI
talks to. It composes two providers and offers whichever are actually available
on this device/surface; if none is, the practice is bring-your-own-music.

- **Apple Music** — `lib/appleMusic.ts`, iOS only, via the native MusicKit plugin
  (`CobreatheMusic`, shared with Cobreathe; extended with `pause`/`resume` and a
  `shuffle` flag — Listening plays the playlist in order). No web Apple Music yet
  (needs MusicKit JS + a developer token — the heavier removed-integration path).
- **Spotify** — `lib/spotify.ts` + `lib/spotifyPlayer.ts`, iOS (native SDK) **and**
  web/PWA (Web Playback SDK). See the two-layer write-up below.

The chooser: if both are available the UI shows a segmented switch (Apple Music /
Spotify) and remembers the pick (`phoebe:music-source`); one service → no choice;
none → BYO. Every provider gates on real config (`appleMusicAvailable()` /
`spotifyInAppAvailable()`), so a control never appears that can't make sound.

### Apple Music — to make sound
1. Set `APPLE_MUSIC_PLAYLIST_ID` in `lib/appleMusic.ts` (catalog playlist id).
2. The shared `CobreatheMusic` plugin must be live — same manual steps as the
   Cobreathe Apple Music integration: add the plugin to the Xcode target,
   `registerPluginInstance` in MainViewController, enable **MusicKit** for the App
   ID in the Apple Developer portal. (`NSAppleMusicUsageDescription` already in
   Info.plist.)
3. Listener needs an **Apple Music subscription** (checked at play via `isAvailable`).

---

## Spotify — the two-layer build

The groundwork lives in `mymonastery/src/lib/spotify.ts`. Built in two layers so
the cheap win ships now and the rich version is teed up.

## Layer 1 — deep link (LIVE the moment a playlist id is set)

`openSpotifyPlaylist()` opens `https://open.spotify.com/playlist/<id>` via
`openExternal` — iOS/Android hand the universal link to the installed Spotify
app, desktop opens the web player. Playback happens *in Spotify*; Phoebe keeps
the prayer frame. No OAuth, no Premium-in-app requirement, no SDK.

**To turn it on:** set `CONTEMPLATIVE_PLAYLIST_ID` in `lib/spotify.ts` to a real
curated playlist id (Taizé, plainchant, choral, ambient worship). The "Open a
contemplative playlist on Spotify" button in the intro is gated on
`spotifyPlaylistReady()`, so it stays hidden until then (no lying control).

This is the recommended first ship — it's "bring your own playback" with a
one-tap shortcut, and it matches the privacy posture exactly.

## Layer 2 — in-app playback (groundwork done, dormant)

Real in-app playback (a player Phoebe controls, music *inside* the app) needs:

1. **Register the app** in the Spotify Developer Dashboard
   (https://developer.spotify.com/dashboard) → get a **Client ID**.
2. **Redirect URIs** in the dashboard:
   - Web: `https://<origin>/spotify-callback` (see `spotifyRedirectUri()`).
   - Native iOS: a custom scheme, e.g. `app.withphoebe.mobile://spotify`.
3. Set `SPOTIFY_CLIENT_ID` in `lib/spotify.ts`. That flips `spotifyConfigured()`.
4. **Auth** = Authorization Code + PKCE (no client secret on-device). The real
   helpers are already written: `generateCodeVerifier()`, `codeChallenge()`,
   `buildAuthUrl(verifier, state)`. Flow: stash the verifier (sessionStorage) →
   redirect to `buildAuthUrl(...)` → handle `/spotify-callback` → POST the code
   + verifier to `https://accounts.spotify.com/api/token` → access token.
   - **Token exchange should be a small server route** so refresh tokens aren't
     held in the browser. (Not built yet — see "TODO".)
5. **Playback engine:**
   - **Web:** the [Web Playback SDK] creates a player in the browser. Requires
     the token's `streaming` scope **and the listener has Spotify Premium**.
     ⚠️ The SDK uses EME/DRM — unreliable inside the iOS `WKWebView`, so on the
     native iOS build this path likely won't work.
   - **iOS native:** the Spotify iOS SDK (app-remote to the installed Spotify
     app) — a Capacitor plugin, mirroring `CobreatheMusicPlugin.swift`. Heavier;
     only worth it if in-app control on iPhone is a hard requirement. Otherwise
     Layer 1 (deep link) covers iOS well.

### Hard constraints to remember
- **Premium required** for SDK playback. Free users can only deep-link (Layer 1).
- **Never request history scopes** (`user-read-recently-played`, `*-top-*`).
  Scopes stay at `["streaming","user-read-email","user-read-private"]`.

## Status — Layer 2 is BUILT (dormant), both surfaces

Done (in the tree, inert until configured — gated on `spotifyInAppAvailable()`):
- [x] `lib/spotify.ts` — config, PKCE, client-side token exchange + refresh, platform gates.
- [x] `lib/spotifyPlayer.ts` — one controller over native(iOS)+web engines, `useSpotifyPlayback()` hook.
- [x] `pages/spotify-callback.tsx` + `/spotify-callback` route.
- [x] Web Playback SDK loader + player + `PUT /me/player/play` (playlist context).
- [x] `ios/.../SpotifyMusicPlugin.swift` (SPTAppRemote), `#if canImport(SpotifyiOS)`-guarded, not yet in target.
- [x] `Info.plist` `LSApplicationQueriesSchemes: [spotify]`.
- [x] Listening UI: gated connect/play/pause/resume control.

### Remaining = manual config (can't be done from code)
**Shared:** set `SPOTIFY_CLIENT_ID` + `CONTEMPLATIVE_PLAYLIST_ID` in `lib/spotify.ts`; listener needs **Premium**.
**Web/PWA:** add `https://<origin>/spotify-callback` as a Redirect URI in the Spotify dashboard → web player works.
**iOS native:** (1) add `SpotifyiOS.xcframework` + `SpotifyMusicPlugin.swift` to the App target; (2) `MainViewController.capacitorDidLoad()` → `bridge?.registerPluginInstance(SpotifyMusicPlugin())`; (3) add `CFBundleURLTypes` redirect scheme + register it in the dashboard; (4) `AppDelegate.application(_:open:options:)` → `SpotifyMusicPlugin.shared?.handleAuthURL(url)`.

### Still open
- [ ] Harden: move token exchange/refresh to a server route (keep refresh token off-device).
- [ ] Decide: Spotify *and/or* Apple Music ([[reference_cobreathe_apple_music]]) as the in-app source.

[Web Playback SDK]: https://developer.spotify.com/documentation/web-playback-sdk
