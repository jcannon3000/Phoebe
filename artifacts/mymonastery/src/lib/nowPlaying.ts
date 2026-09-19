// ── Handing the music to the player ─────────────────────────────────────────
//
// Owner, 2026-09-18: "Playing from a catalogue does NOT currently go to the
// playback slide — it must." /hymns and /hildegard start the music in-app, and
// Audio Divina's LISTEN beat is where the player lives, so a catalogue that
// has just started something leaves a note here and goes to /listening, which
// opens on the player.
//
// IN MEMORY ONLY, on purpose. It is a hand-off across one in-app navigation,
// not a fact about the day: after a relaunch nothing Phoebe started is playing
// any more, and a player slide for silence would be a lie. Taken once.
//
// Not the log. The catalogue still writes pendingListen (the log's prefill),
// and /listening consumes that on mount — so the player's "Log this listening"
// writes the entry once, and the prefill is already spent.

export type NowPlayingHandOff = {
  /** Catalog id of what started — a song, album or playlist. */
  id: string;
  /** Same string the log and the Lately row will read. */
  title: string;
  artworkUrl?: string;
  /** The shelf it came from, so Back on the player returns to it. */
  from?: string;
};

let pending: NowPlayingHandOff | null = null;

export function handOffNowPlaying(p: NowPlayingHandOff): void {
  pending = p.title.trim() ? p : null;
}

export function takeNowPlayingHandOff(): NowPlayingHandOff | null {
  const p = pending;
  pending = null;
  return p;
}
