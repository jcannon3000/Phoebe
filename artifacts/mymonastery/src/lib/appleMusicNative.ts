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
  pause?: () => Promise<void>;
  resume?: () => Promise<void>;
  stop?: () => Promise<void>;
};

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
    const r = await p.isAvailable();
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
    const status = (await p.isAvailable?.()) ?? {};
    if (status.available !== true) return false;
    if (status.authorized !== true) {
      const asked = (await p.authorize?.()) ?? {};
      if (asked.authorized !== true) return false;
      if (asked.subscribed !== true) return false;
    } else if (status.subscribed !== true) {
      return false;
    }
    const played = await p.playTrack({ id: trackId });
    return played?.playing === true;
  } catch {
    // "not-authorized", "no-subscription", "not-found", a MusicKit error, or
    // no capability on the App ID — all of them mean: open the link instead.
    return false;
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
