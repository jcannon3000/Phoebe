// ── Apple Music, played inside Phoebe ───────────────────────────────────────
//
// Owner, 2026-09-18: "Could we build that apple music would be integrated to
// actually be able to play the music through the users account if they are
// logged in even though spotify is not as simple" … "we could just keep
// spotify link flow for spotify".
//
// The front door to PhoebeMusicPlugin.swift (phoebe-mobile/ios/App/App), which
// plays a hymn through the listener's OWN Apple Music subscription instead of
// leaving the app. Playback only — nothing here reads their library or history.
//
// STRICTLY ADDITIVE. Every function fails to `false`, and the hymns catalogue
// treats false as "open music.apple.com", which is what every listener gets
// today and what every listener keeps getting if any of these is true:
//   • on the web, or an iOS build older than this plugin  → no plugin
//   • the App ID lacks the MusicKit capability            → play rejects
//   • they have no Apple Music subscription               → "no-subscription"
//   • they decline the authorization prompt               → "not-authorized"
//   • iOS 15                                              → plugin rejects
// That ordering matters: the link-out is the floor, and in-app playback is a
// bonus on top of it. A wrong availability check here would REGRESS a feature
// that currently works for everyone, so the checks are positive-only — we act
// native only when the plugin says yes, never when it merely doesn't say no.

type MusicPlugin = {
  isAvailable?: () => Promise<{ available?: boolean; authorized?: boolean; subscribed?: boolean }>;
  authorize?: () => Promise<{ authorized?: boolean; subscribed?: boolean }>;
  playTrack?: (opts: { id: string }) => Promise<{ playing?: boolean; title?: string | null }>;
  playPlaylist?: (opts: { id: string; shuffle?: boolean; repeatAll?: boolean })
    => Promise<{ playing?: boolean; title?: string | null; count?: number }>;
  pause?: () => Promise<void>;
  resume?: () => Promise<void>;
  stop?: () => Promise<void>;
};

/**
 * NOTHING NATIVE MAY HANG THE FALLBACK.
 *
 * Every caller is shaped `play(...).then(ok => ok ? … : openExternal(url))`,
 * so a promise that never settles is worse than one that rejects: the music
 * does not play AND the link never opens — the tap does nothing at all, which
 * is exactly the regression the header above forbids.
 *
 * Two MusicKit suspension points can stall rather than throw. The permission
 * sheet does not resume if the person swipes away to the home screen instead
 * of answering it, and `MusicSubscription.current` is the first element of a
 * network-backed stream, so a captive portal can hold it indefinitely. `try?`
 * in the Swift absorbs a throw; it cannot absorb a stall.
 *
 * So every crossing of the bridge gets a deadline, and a missed deadline is
 * treated exactly like a "no": open the service instead.
 */
const NATIVE_DEADLINE_MS = 6000;
/** Longer, because this one is allowed to be waiting on a human. */
const AUTHORIZE_DEADLINE_MS = 60000;

function withDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (v: T) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => done(fallback), ms);
    work.then(
      (v) => { clearTimeout(timer); done(v); },
      () => { clearTimeout(timer); done(fallback); },
    );
  });
}

function plugin(): MusicPlugin | null {
  if (typeof window === "undefined") return null;
  try {
    const p = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
      .Capacitor?.Plugins?.PhoebeMusic;
    return (p as MusicPlugin | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Is the native plugin present at all? Cheap and synchronous — no prompt. */
export function hasAppleMusicNative(): boolean {
  return !!plugin()?.playTrack;
}

/**
 * Can we actually play in-app right now? Asks the plugin, which checks
 * authorization AND `canPlayCatalogContent` — a lapsed subscriber can still be
 * "authorized", and starting a 30-second preview they didn't ask for would be
 * worse than opening the Music app. Never prompts.
 */
export async function appleMusicNativeReady(): Promise<boolean> {
  const p = plugin();
  if (!p?.isAvailable) return false;
  try {
    const r = await withDeadline(p.isAvailable(), NATIVE_DEADLINE_MS, {});
    return r?.available === true && r?.authorized === true && r?.subscribed === true;
  } catch {
    return false;
  }
}

/**
 * Play one Apple Music catalog track (hymnsCatalogue's `appleTrackId`).
 * Returns false for every failure, so the caller can open the web link
 * instead — including the first-run case where the listener declines the
 * prompt. Prompts at most once, and only when a play was actually asked for:
 * an authorization sheet on page load would be an ambush.
 */
export async function playAppleMusicNative(trackId: string | null | undefined): Promise<boolean> {
  const p = plugin();
  if (!p?.playTrack || !trackId) return false;
  try {
    const status = p.isAvailable ? await withDeadline(p.isAvailable(), NATIVE_DEADLINE_MS, {}) : {};
    if (status.available !== true) return false;
    if (status.authorized !== true) {
      // The sheet is allowed to wait on a person; it is not allowed to wait
      // forever, because a sheet swiped away never resumes.
      const asked = p.authorize ? await withDeadline(p.authorize(), AUTHORIZE_DEADLINE_MS, {}) : {};
      if (asked.authorized !== true) return false;
      if (asked.subscribed !== true) return false;
    } else if (status.subscribed !== true) {
      return false;
    }
    const played = await withDeadline(p.playTrack({ id: trackId }), NATIVE_DEADLINE_MS, {});
    return played?.playing === true;
  } catch {
    // "not-authorized", "no-subscription", "not-found", a MusicKit error, or
    // no capability on the App ID — all of them mean: open the link instead.
    return false;
  }
}

/**
 * Play a whole Apple Music PLAYLIST in-app — the Hildegard essentials behind a
 * sit, or "play the whole thing" on the catalogue page.
 *
 * Same contract as playAppleMusicNative: false for every failure, so the
 * caller opens music.apple.com instead. `shuffle` comes at the playlist in a
 * different order each time; `repeatAll` keeps a long sit from falling silent
 * when the music runs out.
 *
 * Note the plugin check is `playPlaylist`, not `playTrack`: an iOS build from
 * before this method existed has the plugin but not the method, and calling it
 * there would reject rather than fall back.
 */
export async function playAppleMusicPlaylistNative(
  playlistId: string | null | undefined,
  opts: { shuffle?: boolean; repeatAll?: boolean } = {},
): Promise<boolean> {
  const p = plugin();
  if (!p?.playPlaylist || !playlistId) return false;
  try {
    const status = p.isAvailable ? await withDeadline(p.isAvailable(), NATIVE_DEADLINE_MS, {}) : {};
    if (status.available !== true) return false;
    if (status.authorized !== true) {
      const asked = p.authorize ? await withDeadline(p.authorize(), AUTHORIZE_DEADLINE_MS, {}) : {};
      if (asked.authorized !== true || asked.subscribed !== true) return false;
    } else if (status.subscribed !== true) {
      return false;
    }
    const played = await withDeadline(p.playPlaylist({
      id: playlistId,
      shuffle: opts.shuffle === true,
      repeatAll: opts.repeatAll === true,
    }), NATIVE_DEADLINE_MS, {});
    return played?.playing === true;
  } catch {
    return false;
  }
}

/** Is in-app PLAYLIST playback available? False on any build older than it. */
export function hasAppleMusicPlaylistNative(): boolean {
  return !!plugin()?.playPlaylist;
}

/**
 * Ask for Apple Music access, on purpose and in the open.
 *
 * Owner, 2026-09-18: "the first time someone picks apple music, aks them for
 * permission". Choosing Apple Music IS the consent moment — it is a deliberate
 * act, so the sheet belongs there rather than ambushing the first play. iOS
 * only ever shows it once per install; after that this returns the standing
 * answer without showing anything, which is why it is safe to call on every
 * pick rather than tracking "have we asked yet" ourselves.
 *
 * Returns whether they can actually play: allowed AND subscribed.
 */
export async function requestAppleMusicNative(): Promise<{ authorized: boolean; subscribed: boolean }> {
  const p = plugin();
  if (!p?.authorize) return { authorized: false, subscribed: false };
  try {
    const r = await withDeadline(p.authorize(), AUTHORIZE_DEADLINE_MS, {});
    return { authorized: r?.authorized === true, subscribed: r?.subscribed === true };
  } catch {
    return { authorized: false, subscribed: false };
  }
}

/** Hold the music where it is — the player's pause button. */
export async function pauseAppleMusicNative(): Promise<void> {
  try { await plugin()?.pause?.(); } catch { /* nothing playing */ }
}

/** Pick it back up from where it was paused. */
export async function resumeAppleMusicNative(): Promise<void> {
  try { await plugin()?.resume?.(); } catch { /* nothing to resume */ }
}

/** Stop in-app playback (leaving the Music app's own state alone). */
export async function stopAppleMusicNative(): Promise<void> {
  try { await plugin()?.stop?.(); } catch { /* nothing playing */ }
}
