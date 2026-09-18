// ── Music behind the sit ────────────────────────────────────────────────────
//
// Owner, 2026-09-18: "for contemplation a third pill before the split pill
// that says add music … it brings up a pop-up where you would check it and
// it'd select that one and then you hit close and then when you go back to the
// contemplation start screen it would just show that playlist … This is only
// if people have connected their Apple Music account. And it would play that
// playlist inside the contemplation. Use the Hildegard one as the first Test
// one."
//
// APPLE MUSIC ONLY, AND ONLY WHEN IT IS REALLY THERE. This plays through the
// listener's own subscription via PhoebeMusicPlugin (MusicKit), so it needs a
// native iOS build, iOS 16+, an authorized listener and a live subscription.
// Anything less and the pill does not appear at all — a control that offers
// music and then can't play it is worse than no control. lib/appleMusicNative
// answers that question positively-only (never "it didn't say no").
//
// Nothing here holds audio: a playlist is an Apple catalog id, and playing it
// is a request to the listener's own Music app.
//
// The registry is a LIST from the start, because "rows of options" is what was
// asked for and Hildegard is explicitly the first test one, not the only one.
// To add another: find its Apple Music catalog playlist id (the `pl.` in its
// music.apple.com URL) and add a row. Nothing else needs to change.

import { HILDEGARD_PLAYLIST } from "@/lib/hildegardCatalogue";

export type ContemplationPlaylist = {
  /** Apple Music catalog playlist id ("pl...."). */
  id: string;
  /** What the row and the start screen call it. */
  label: string;
  /** The one line under the label — who made it, and how long it runs. */
  sub: string;
  /** Opens the playlist on music.apple.com, for a look before choosing. */
  url: string;
};

export const CONTEMPLATION_PLAYLISTS: readonly ContemplationPlaylist[] = [
  {
    id: HILDEGARD_PLAYLIST.id,
    label: HILDEGARD_PLAYLIST.name,
    sub: "25 chants · 2 hr 13 min · Apple Music Medieval",
    url: HILDEGARD_PLAYLIST.url,
  },
];

const KEY = "phoebe:contemplation:music";

/** Fires on this tab when the choice changes (storage events only cross tabs). */
export const CONTEMPLATION_MUSIC_EVENT = "phoebe:contemplation-music-changed";

/**
 * The chosen playlist, or null for silence — which is the default and stays
 * the default. Contemplation is a silent practice; music is something a person
 * asks for, never something that starts because a setting drifted.
 */
export function getContemplationPlaylist(): ContemplationPlaylist | null {
  try {
    const id = localStorage.getItem(KEY);
    if (!id) return null;
    return CONTEMPLATION_PLAYLISTS.find((p) => p.id === id) ?? null;
  } catch {
    return null;
  }
}

/** Pass null to go back to silence. */
export function setContemplationPlaylist(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the choice just doesn't persist */ }
  try { window.dispatchEvent(new Event(CONTEMPLATION_MUSIC_EVENT)); } catch { /* SSR */ }
}
