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
    id: "272149140",
    kind: "album",
    label: "Classic African American Gospel",
    sub: "Various artists \u00b7 24 tracks \u00b7 Smithsonian Folkways",
    url: "https://music.apple.com/us/album/classic-african-american-gospel-from-smithsonian-folkways/272149140",
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
];

export function playlistById(id: string | null | undefined): MusicPlaylist | null {
  if (!id) return null;
  return MUSIC_PLAYLISTS.find((p) => p.id === id) ?? null;
}

const KEY_CONTEMPLATION = "phoebe:contemplation:music";
const KEY_OFFICE = "phoebe:office:music";
const KEY_COBREATHE = "phoebe:cobreathe:music";
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

/**
 * WHAT ACTUALLY PLAYS UNDER AN OFFICE — an explicit choice only, never the
 * inherited recent.
 *
 * getOfficeMusic falls back to the most recent so the DROPDOWN opens on it,
 * which is what the owner asked for. But the dropdown lives on the office's
 * welcome slide, and Daily Prayer's outer picker (Time of day / Practice /
 * How → Begin) lands on slide 2 and skips that slide entirely. Playing the
 * fallback there meant music starting under an office from a playlist chosen
 * for something else — a sit, most likely — with no control ever shown
 * (found in a browser pass, 2026-09-18).
 *
 * So: the recent pre-fills the control, and only a choice made FOR the office
 * starts the music. Nothing plays that nobody picked.
 */
export function officeMusicToPlay(): MusicPlaylist | null {
  const saved = read(KEY_OFFICE);
  if (!saved || saved === NONE) return null;
  return playlistById(saved);
}

/** Pass null for silence — stored explicitly, so it isn't re-defaulted. */
export function setOfficeMusic(id: string | null): void {
  write(KEY_OFFICE, id ?? NONE);
  remember(id);
}

/**
 * MUSIC UNDER THE BREATH (owner, 2026-09-18: "a music dropdown when Apple
 * Music is on, defaulting to the last chosen or None").
 *
 * Same shape as the office: an explicit None sticks, and anything else falls
 * back to the last playlist chosen anywhere. Breathing together is a shared
 * practice with its own sound already — the swells — so music here is
 * something asked for, and the dropdown does not appear at all unless Apple
 * Music can really play it.
 */
export function getCobreatheMusic(): MusicPlaylist | null {
  const saved = read(KEY_COBREATHE);
  if (saved === NONE) return null;
  if (saved) return playlistById(saved);
  return recentPlaylist();
}

/**
 * WHAT ACTUALLY PLAYS UNDER THE BREATH — an explicit choice only, never the
 * inherited recent. Same rule as officeMusicToPlay, and for the same reason:
 * the dropdown lives on the "Before you begin" slide, and the quick-launch
 * paths (?start=1 from the contemplation timer, the sessions card, the about
 * page) go straight to "breathing" and never show it. Falling back to the
 * recent there started a playlist somebody picked for an OFFICE under a breath,
 * with no control on screen to see or stop it (audit, 2026-09-18).
 *
 * getCobreatheMusic still falls back, because that is what the CONTROL should
 * open on. Nothing plays that nobody picked for this practice.
 */
export function cobreatheMusicToPlay(): MusicPlaylist | null {
  const saved = read(KEY_COBREATHE);
  if (!saved || saved === NONE) return null;
  return playlistById(saved);
}

export function setCobreatheMusic(id: string | null): void {
  write(KEY_COBREATHE, id ?? NONE);
  remember(id);
}
