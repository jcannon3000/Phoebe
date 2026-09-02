/**
 * The owner's curated Audio Divina library — see lib/db schema curated_audio.ts.
 *
 * Owner: build an admin tool to browse the Apple Music library and pick
 * albums for a curated library inside Audio Divina; catalogue the Apple
 * Music AND Spotify links for the album and every track, so a listener can
 * open either app from the track they tap.
 *
 * READ is public — the library is content every Audio Divina user (guest
 * included) should see, same as Visio's art library. WRITE is super-admin
 * only, via the admin audio-library tool.
 */
import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db, curatedAudioAlbumsTable, curatedAudioTracksTable } from "@workspace/db";
import { isSuperAdminUser } from "../lib/superAdmin";

const router: IRouter = Router();

type SessionUser = { id: number; email: string };
function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

type TrackInput = {
  trackNumber: number;
  title: string;
  durationMs?: number | null;
  appleSongId?: string | null;
  appleUrl?: string | null;
  spotifyTrackId?: string | null;
  spotifyUrl?: string | null;
};

// GET /api/curated-audio — every album with its tracklist, newest first.
router.get("/curated-audio", async (_req, res): Promise<void> => {
  try {
    const albums = await db.select().from(curatedAudioAlbumsTable).orderBy(desc(curatedAudioAlbumsTable.createdAt));
    const tracks = await db.select().from(curatedAudioTracksTable).orderBy(asc(curatedAudioTracksTable.trackNumber));
    const byAlbum = new Map<number, typeof tracks>();
    for (const t of tracks) {
      const list = byAlbum.get(t.albumId) ?? [];
      list.push(t);
      byAlbum.set(t.albumId, list);
    }
    res.json({
      albums: albums.map((a) => ({ ...a, tracks: byAlbum.get(a.id) ?? [] })),
    });
  } catch (err) {
    // A fresh env whose migration hasn't run yet — empty library is a valid
    // answer, not an error the client needs to handle.
    console.error("curated-audio: list failed:", err);
    res.json({ albums: [] });
  }
});

// POST /api/admin/curated-audio — add one album + its tracklist.
// Body: { title, artist, artworkUrl?, appleAlbumId?, appleUrl?,
//         spotifyAlbumId?, spotifyUrl?, note?, tracks: TrackInput[] }
// The admin tool has already fetched and (where possible) paired the Apple
// + Spotify data before calling this — this route just persists what it's
// given, so a track missing one service's link simply has that field null
// and the browse UI shows only the button for the service it has.
router.post("/admin/curated-audio", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "not_authenticated" }); return; }
  if (!(await isSuperAdminUser(session.id))) { res.status(403).json({ error: "forbidden" }); return; }

  const b = req.body ?? {};
  const title = String(b.title ?? "").trim();
  const artist = String(b.artist ?? "").trim();
  if (!title || !artist) { res.status(400).json({ error: "title_and_artist_required" }); return; }
  const tracksIn: TrackInput[] = Array.isArray(b.tracks) ? b.tracks : [];
  if (tracksIn.length === 0) { res.status(400).json({ error: "at_least_one_track_required" }); return; }

  try {
    const [album] = await db.insert(curatedAudioAlbumsTable).values({
      title,
      artist,
      artworkUrl: b.artworkUrl ? String(b.artworkUrl) : null,
      appleAlbumId: b.appleAlbumId ? String(b.appleAlbumId) : null,
      appleUrl: b.appleUrl ? String(b.appleUrl) : null,
      spotifyAlbumId: b.spotifyAlbumId ? String(b.spotifyAlbumId) : null,
      spotifyUrl: b.spotifyUrl ? String(b.spotifyUrl) : null,
      note: b.note ? String(b.note).trim().slice(0, 280) : null,
    }).returning();

    await db.insert(curatedAudioTracksTable).values(
      tracksIn.map((t) => ({
        albumId: album.id,
        trackNumber: Number(t.trackNumber) || 0,
        title: String(t.title ?? "").trim() || "Untitled",
        durationMs: t.durationMs ?? null,
        appleSongId: t.appleSongId ?? null,
        appleUrl: t.appleUrl ?? null,
        spotifyTrackId: t.spotifyTrackId ?? null,
        spotifyUrl: t.spotifyUrl ?? null,
      })),
    );

    const tracks = await db.select().from(curatedAudioTracksTable)
      .where(eq(curatedAudioTracksTable.albumId, album.id))
      .orderBy(asc(curatedAudioTracksTable.trackNumber));
    res.status(201).json({ album: { ...album, tracks } });
  } catch (err) {
    console.error("curated-audio: create failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// DELETE /api/admin/curated-audio/:id — remove an album (tracks cascade).
router.delete("/admin/curated-audio/:id", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "not_authenticated" }); return; }
  if (!(await isSuperAdminUser(session.id))) { res.status(403).json({ error: "forbidden" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "bad_id" }); return; }
  await db.delete(curatedAudioAlbumsTable).where(eq(curatedAudioAlbumsTable.id, id));
  res.json({ ok: true });
});

export default router;
