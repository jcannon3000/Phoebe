// ── Music behind a practice ─────────────────────────────────────────────────
//
// Owner, 2026-09-18, over four messages: "for contemplation a third pill
// before the split pill that says add music … it would play that playlist
// inside the contemplation" · "in slideshow settings like offices, have a new
// optioon that says turn on music, and they would select a playlist" · "at the
// beggining of the offices have an extra drop down button that says music,
// defualt is none, but then they could select one of these playlists" · "and
// defaults the most recent" · "but again this is only if a user has apple
// music turned on".
//
// APPLE MUSIC ONLY, AND ONLY WHEN IT CAN REALLY PLAY. Everything here is
// gated on lib/appleMusicFeatures — the Settings switch AND iOS still agreeing
// (authorized, subscribed, native build). On the web, for anyone who hasn't
// turned the switch on, and after a revoke or a lapse, none of these controls
// appear at all. A control that offers music and then can't play it is worse
// than no control.
//
// Nothing here holds audio: a playlist is an Apple catalog id, and playing it
// is a request to the listener's own Music app.
//
// ONE PREFERENCE PER SURFACE, and each is the only source for what that
// surface shows — the office's dropdown and the office's settings row read and
// write the SAME key, so they can never disagree (reference_second_renderer_drift).
//
// To add a playlist: find its Apple Music catalog id (the `pl.` in its
// music.apple.com URL) and add a row. Nothing else needs to change.

import { HILDEGARD_PLAYLIST } from "@/lib/hildegardCatalogue";
import type { CollectionKind } from "@/lib/appleMusicNative";

export type MusicPlaylist = {
  /** Apple Music catalog id — "pl...." for a playlist, digits otherwise. */
  id: string;
  /** Which kind of thing it is, so the plugin knows what to request. */
  kind: CollectionKind;
  /** What a row, a pill and a dropdown call it. */
  label: string;
  /** The one line under the label — who made it, and how long it runs. */
  sub: string;
  /** Opens the playlist on music.apple.com, for a look before choosing. */
  url: string;
};

export const MUSIC_PLAYLISTS: readonly MusicPlaylist[] = [
  {
    id: HILDEGARD_PLAYLIST.id,
    kind: "playlist",
    label: HILDEGARD_PLAYLIST.name,
    sub: "25 chants \u00b7 2 hr 13 min \u00b7 Apple Music Medieval",
    url: HILDEGARD_PLAYLIST.url,
  },
  {
    // Owner, 2026-09-18: "add this to the playlist with the Hildigard".
    // Long enough (12 hours) that no office or sit can ever run it out.
    id: "pl.bed492442a53481f98e98c6c4da9e01d",
    kind: "playlist",
    label: "Ambient Chill",
    sub: "250 tracks \u00b7 12 hr 13 min \u00b7 Apple Music Chill",
    url: "https://music.apple.com/us/playlist/ambient-chill/pl.bed492442a53481f98e98c6c4da9e01d",
  },
  {
    /**
     * THE OWNER'S OWN, and the description is theirs, to be used wherever this
     * option is described: in the monastery Jeremy listened to this album on
     * CD between Matins and Eucharist, on contemplative walks.
     */
    id: "1833109181",
    kind: "album",
    label: "Ryuichi Sakamoto \u00b7 Music For Film",
    sub: "Listened to on CD in the monastery, between Matins and Eucharist, on contemplative walks",
    url: "https://music.apple.com/us/album/ryuichi-sakamoto-music-for-film/1833109181",
  },
  {
    id: "192752238",
    kind: "album",
    label: "Freedom Highway",
    sub: "The Staple Singers \u00b7 18 tracks \u00b7 Gospel Spirit Series",
    url: "https://music.apple.com/us/album/freedom-highway-gospel-spirit-series/192752238",
  },
  {
    id: "272149140",
    kind: "album",
    label: "Classic African American Gospel",
    sub: "Various artists \u00b7 24 tracks \u00b7 Smithsonian Folkways",
    url: "https://music.apple.com/us/album/classic-african-american-gospel-from-smithsonian-folkways/272149140",
  },
  {
    // Spelled as the artist and Apple's own playlist title spell it; the
    // owner wrote "McMillian" in passing.
    id: "pl.217641d5a0b64782b3c4a15748df5609",
    kind: "playlist",
    label: "John Mark McMillan",
    sub: "18 songs \u00b7 1 hr 29 min \u00b7 Apple Music",
    url: "https://music.apple.com/us/playlist/john-mark-mcmillan-essentials/pl.217641d5a0b64782b3c4a15748df5609",
  },
  {
    id: "pl.c3153f44394b41b09d8cc23d929d1058",
    kind: "playlist",
    label: "John Coltrane",
    sub: "26 songs \u00b7 3 hr 26 min \u00b7 Apple Music Jazz",
    url: "https://music.apple.com/us/playlist/john-coltrane-essentials/pl.c3153f44394b41b09d8cc23d929d1058",
  },
  {
    // Owner asked for "the whole library", so this is the ARTIST, not one
    // album — the plugin walks their albums.
    id: "535498745",
    kind: "artist",
    label: "Loud Harp",
    sub: "Their whole library",
    url: "https://music.apple.com/us/artist/loud-harp/535498745",
  },
  {
    id: "160593555",
    kind: "album",
    label: "Mary Lou's Mass",
    sub: "Mary Lou Williams \u00b7 24 tracks",
    url: "https://music.apple.com/us/album/mary-lous-mass/160593555",
  },
  {
    id: "262208338",
    kind: "album",
    label: "Black Christ of the Andes",
    sub: "Mary Lou Williams \u00b7 14 tracks",
    url: "https://music.apple.com/us/album/mary-lou-williams-presents-black-christ-of-the-andes/262208338",
  },
];

export function playlistById(id: string | null | undefined): MusicPlaylist | null {
  if (!id) return null;
  return MUSIC_PLAYLISTS.find((p) => p.id === id) ?? null;
}

const KEY_CONTEMPLATION = "phoebe:contemplation:music";
const KEY_OFFICE = "phoebe:office:music";
/** The last playlist chosen ANYWHERE — what a new surface defaults to. */
const KEY_RECENT = "phoebe:music:recent";

/** "None" has to be storable, or it could never be told from "never chose". */
const NONE = "none";

/** Fires on this tab when any music choice changes (storage only crosses tabs). */
export const PRACTICE_MUSIC_EVENT = "phoebe:practice-music-changed";

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, v: string | null): void {
  try {
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
  } catch { /* private mode: the choice just doesn't persist */ }
  try { window.dispatchEvent(new Event(PRACTICE_MUSIC_EVENT)); } catch { /* SSR */ }
}

/**
 * THE MOST RECENT CHOICE (owner: "and defaults the most recent"). Every
 * deliberate pick of a playlist records it here, so a surface being met for
 * the first time offers what this person actually listens to rather than
 * making them choose from scratch. Choosing silence does NOT overwrite it:
 * "none today" is not a taste, and forgetting the playlist because someone
 * wanted one quiet office would be a poor reading of the same tap.
 */
export function recentPlaylist(): MusicPlaylist | null {
  return playlistById(read(KEY_RECENT));
}

function remember(id: string | null): void {
  if (id && id !== NONE) write(KEY_RECENT, id);
}

/**
 * MUSIC BEHIND A SIT. Silence is the default and stays the default —
 * contemplation is a silent practice, and music is something a person asks
 * for, never something that starts because a setting drifted. So this one does
 * NOT fall back to the most recent.
 */
export function getContemplationPlaylist(): MusicPlaylist | null {
  return playlistById(read(KEY_CONTEMPLATION));
}

export function setContemplationPlaylist(id: string | null): void {
  write(KEY_CONTEMPLATION, id);
  remember(id);
}

/**
 * MUSIC BEHIND AN OFFICE. Unlike the sit, this one defaults to the most recent
 * playlist — the office dropdown was asked for as a convenience ("defaults the
 * most recent"), and an office is a read-along rather than silence kept on
 * purpose. Until anything has ever been chosen there is no recent, so it is
 * None, which is what a first-time reader sees.
 */
export function getOfficeMusic(): MusicPlaylist | null {
  const saved = read(KEY_OFFICE);
  if (saved === NONE) return null;
  if (saved) return playlistById(saved);
  return recentPlaylist();
}

/** Pass null for silence — stored explicitly, so it isn't re-defaulted. */
export function setOfficeMusic(id: string | null): void {
  write(KEY_OFFICE, id ?? NONE);
  remember(id);
}
