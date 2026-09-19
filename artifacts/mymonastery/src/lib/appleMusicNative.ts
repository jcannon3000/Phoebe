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
  playCollection?: (opts: { id: string; kind?: string; shuffle?: boolean; repeatAll?: boolean })
    => Promise<{ playing?: boolean; title?: string | null; count?: number }>;
  pause?: () => Promise<void>;
  resume?: () => Promise<void>;
  stop?: () => Promise<void>;
  next?: () => Promise<void>;
  previous?: () => Promise<void>;
  status?: () => Promise<Partial<AppleMusicStatus>>;
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
/**
 * SLOW IS NOT STUCK (owner, 2026-09-18: "The apple music integration is not
 * working anymore, its just linking not actually playing in app").
 *
 * Six seconds held for the calls that only read a flag, and was far too short
 * for the two that do real work. isAvailable asks Apple's servers whether the
 * subscription can play catalogue content; playTrack/playPlaylist/
 * playCollection resolve only after that same check, a catalogue request,
 * prepareToPlay() and play() — several network round trips plus buffering.
 * On a phone, and above all on the first play after launch, that ran past six
 * seconds, so every play "failed", the service opened instead, and the song
 * often started in the app a moment later behind it.
 *
 * So: generous limits for the calls that fetch and buffer, the short one kept
 * for the cheap ones, and a stall still ends — it just ends in half a minute
 * rather than six seconds.
 */
const CHECK_DEADLINE_MS = 15000;
const PLAY_DEADLINE_MS = 30000;

const TIMED_OUT = Symbol("timed-out");

type AvailableAnswer = { available?: boolean; authorized?: boolean; subscribed?: boolean };

/**
 * ONE AVAILABILITY CHECK, SHARED FOR HALF A MINUTE.
 *
 * isAvailable asks Apple's servers about the subscription, and a single tap
 * could pay for it twice: the page asking "can this play in the app?", then
 * the play call asking again for itself. On a cold phone that is two network
 * round trips before a note sounds.
 *
 * Neither caller trusts the other — every function here still asks for
 * itself and still fails to false — they just share the answer. Only a real
 * answer is kept: a timeout or a failure is dropped at once, so one slow
 * moment can't make the next tap link out. It is forgotten whenever
 * authorization is asked for (the answer just changed) and whenever the app
 * comes back to the front (a subscription can lapse, or be bought, while
 * Phoebe is in the background).
 */
const CHECK_TTL_MS = 30000;
let checkCache: { at: number; answer: Promise<AvailableAnswer> } | null = null;

function checkAvailable(p: MusicPlugin): Promise<AvailableAnswer> {
  if (!p.isAvailable) return Promise.resolve({});
  const now = Date.now();
  if (checkCache && now - checkCache.at < CHECK_TTL_MS) return checkCache.answer;
  const entry = { at: now, answer: withDeadline<AvailableAnswer>(p.isAvailable(), CHECK_DEADLINE_MS, {}) };
  checkCache = entry;
  void entry.answer.then((r) => {
    if (r?.available !== true && checkCache === entry) checkCache = null;
  });
  return entry.answer;
}

/** Forget the shared answer — authorization changed, or we're back in front. */
export function forgetAppleMusicCheck(): void {
  checkCache = null;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") forgetAppleMusicCheck();
  });
}

/** Ask for authorization; whatever the answer, the shared check is stale now. */
function authorizeFresh(p: MusicPlugin): Promise<{ authorized?: boolean; subscribed?: boolean }> {
  forgetAppleMusicCheck();
  if (!p.authorize) return Promise.resolve({});
  return withDeadline(p.authorize(), AUTHORIZE_DEADLINE_MS, {}).finally(forgetAppleMusicCheck);
}

/**
 * Start playback within PLAY_DEADLINE_MS, or report false so the caller opens
 * the service. If the deadline passes and the play then finishes after all,
 * it is STOPPED: by then the caller has opened the Music app (or a browser),
 * and music starting inside Phoebe behind it is the double-start nobody asked
 * for.
 */
async function playWithin(work: Promise<{ playing?: boolean } | null | undefined>): Promise<boolean> {
  const r = await withDeadline<unknown>(work, PLAY_DEADLINE_MS, TIMED_OUT);
  if (r === TIMED_OUT) {
    work.then(
      (late) => { if (late?.playing === true) void plugin()?.stop?.(); },
      () => { /* it failed late too — nothing to undo */ },
    );
    return false;
  }
  return (r as { playing?: boolean } | null | undefined)?.playing === true;
}

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
    const r = await checkAvailable(p);
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
    const status = await checkAvailable(p);
    if (status.available !== true) return false;
    if (status.authorized !== true) {
      // The sheet is allowed to wait on a person; it is not allowed to wait
      // forever, because a sheet swiped away never resumes.
      const asked = await authorizeFresh(p);
      if (asked.authorized !== true) return false;
      if (asked.subscribed !== true) return false;
    } else if (status.subscribed !== true) {
      return false;
    }
    return await playWithin(p.playTrack({ id: trackId }));
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
    const status = await checkAvailable(p);
    if (status.available !== true) return false;
    if (status.authorized !== true) {
      const asked = await authorizeFresh(p);
      if (asked.authorized !== true || asked.subscribed !== true) return false;
    } else if (status.subscribed !== true) {
      return false;
    }
    return await playWithin(p.playPlaylist({
      id: playlistId,
      shuffle: opts.shuffle === true,
      repeatAll: opts.repeatAll === true,
    }));
  } catch {
    return false;
  }
}

/** What a music option is, in Apple Music's own terms. */
export type CollectionKind = "playlist" | "album" | "artist";

/**
 * Play a whole album, playlist, or artist library in-app.
 *
 * The owner's music options are not all one shape — editorial playlists,
 * albums, and Loud Harp's entire library — so this is the one door for all
 * three. Same contract as everything else here: false for every failure, so
 * the caller opens music.apple.com instead.
 */
export async function playAppleMusicCollectionNative(
  kind: CollectionKind,
  id: string | null | undefined,
  opts: { shuffle?: boolean; repeatAll?: boolean } = {},
): Promise<boolean> {
  const p = plugin();
  if (!p?.playCollection || !id) return false;
  try {
    // The same limits as the other two paths — this one arrived after the
    // deadlines did and had none, so a stall here was a dead tap.
    const status = await checkAvailable(p);
    if (status.available !== true) return false;
    if (status.authorized !== true) {
      const asked = await authorizeFresh(p);
      if (asked.authorized !== true || asked.subscribed !== true) return false;
    } else if (status.subscribed !== true) {
      return false;
    }
    return await playWithin(p.playCollection({
      id, kind,
      shuffle: opts.shuffle === true,
      repeatAll: opts.repeatAll === true,
    }));
  } catch {
    return false;
  }
}

/** Is in-app collection playback available? False on any build older than it. */
export function hasAppleMusicCollectionNative(): boolean {
  return !!plugin()?.playCollection;
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
    const r = await authorizeFresh(p);
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

// ── The player's face ──────────────────────────────────────────────────────
//
// The clock, the queue and the skip buttons (owner, 2026-09-18: a progress bar,
// and back/next when an album or playlist is playing). These arrived in the
// Swift after the first music build, so an older binary has no `status` — the
// player then shows the cover and pause only, exactly as it did before.

export type AppleMusicStatus = {
  playing: boolean;
  /** Seconds into the current song. */
  time: number;
  /** Seconds long; 0 when MusicKit doesn't know. */
  duration: number;
  title: string;
  artist: string;
  /** The current song's album, or "". */
  album: string;
  /** https cover of the CURRENT song, or "". */
  artworkUrl: string;
  /** Songs in the queue — more than one means back/next mean something. */
  count: number;
  /** Where the current song sits in the queue (0-based), or -1. */
  index: number;
};

/** Does this build know where the music is? False on the web and older builds. */
export function hasAppleMusicStatusNative(): boolean {
  return !!plugin()?.status;
}

/** Where the music is now, or null when this build can't say. Never prompts. */
export async function appleMusicStatusNative(): Promise<AppleMusicStatus | null> {
  const p = plugin();
  if (!p?.status) return null;
  const s = await withDeadline(p.status().then((v) => v ?? null), NATIVE_DEADLINE_MS, null);
  if (!s) return null;
  return {
    playing: !!s.playing,
    time: Number(s.time) || 0,
    duration: Number(s.duration) || 0,
    title: String(s.title ?? ""),
    artist: String(s.artist ?? ""),
    album: String(s.album ?? ""),
    artworkUrl: String(s.artworkUrl ?? ""),
    count: Number(s.count) || 0,
    index: Number.isFinite(Number(s.index)) ? Number(s.index) : -1,
  };
}

/** The next song in the album or playlist. */
export async function nextAppleMusicNative(): Promise<void> {
  try { await withDeadline(plugin()?.next?.() ?? Promise.resolve(), NATIVE_DEADLINE_MS, undefined); } catch { /* end of queue */ }
}

/** Back: restarts the song past its first few seconds, else the one before. */
export async function previousAppleMusicNative(): Promise<void> {
  try { await withDeadline(plugin()?.previous?.() ?? Promise.resolve(), NATIVE_DEADLINE_MS, undefined); } catch { /* start of queue */ }
}
