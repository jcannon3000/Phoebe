import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// The owner's curated Audio Divina library — hand-picked albums (Coltrane,
// Taizé, ...) that show up as a browsable "library" inside the Audio Divina
// practice, alongside the existing free-text log. Populated by the admin
// audio-library tool: the admin searches Apple Music's catalogue, picks an
// album, and the server fetches its tracklist and attempts to match the
// same album on Spotify — so a listener can tap a track and open it in
// whichever app they use.
//
// Unlike the ACT art library (a generated catalogue + a small overrides
// table), there is no generated file here: the admin tool IS the source of
// truth, so albums/tracks are just rows an admin adds and removes directly.
export const curatedAudioAlbumsTable = pgTable("curated_audio_albums", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  artworkUrl: text("artwork_url"),
  appleAlbumId: text("apple_album_id"),
  appleUrl: text("apple_url"),
  spotifyAlbumId: text("spotify_album_id"),
  spotifyUrl: text("spotify_url"),
  // A short line the admin can add — why this album is here ("Coltrane's
  // late-period devotional suite"). Shown on the browse card. Optional.
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const curatedAudioTracksTable = pgTable("curated_audio_tracks", {
  id: serial("id").primaryKey(),
  albumId: integer("album_id")
    .notNull()
    .references(() => curatedAudioAlbumsTable.id, { onDelete: "cascade" }),
  trackNumber: integer("track_number").notNull(),
  title: text("title").notNull(),
  durationMs: integer("duration_ms"),
  appleSongId: text("apple_song_id"),
  appleUrl: text("apple_url"),
  spotifyTrackId: text("spotify_track_id"),
  spotifyUrl: text("spotify_url"),
});
