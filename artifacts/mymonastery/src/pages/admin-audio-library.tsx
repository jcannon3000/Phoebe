/**
 * /admin/audio-library — the owner's curation surface for the Audio Divina
 * curated library.
 *
 * Owner: "create an admin tool where they could browse the Apple Music
 * library and select albums to display in the Audio Divina curated
 * library. When they do that, catalog all the links for Apple Music and
 * Spotify" (John Coltrane, Taizé, etc.).
 *
 * Flow: search Apple Music's catalogue (already wired for the free-text
 * search inside Audio Divina) for an album → preview its full tracklist →
 * the server best-effort matches the same album on Spotify by title+artist
 * and pairs tracks by track number → the admin reviews/edits any link by
 * hand (a mismatch or an unconfigured Spotify app just leaves that field
 * blank to fill in) → Save writes one row per track. No generated file
 * backs this: the admin tool IS the source of truth, same reasoning as the
 * moderated prayer list, just for content instead of requests.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type AppleSearchResult = { id: string; kind: string; title: string; subtitle: string; artworkUrl: string; url: string };
type TrackDraft = {
  trackNumber: number;
  title: string;
  durationMs: number | null;
  appleSongId: string | null;
  appleUrl: string | null;
  spotifyTrackId: string | null;
  spotifyUrl: string | null;
};
type AlbumDraft = {
  title: string; artist: string; artworkUrl: string; note: string;
  appleAlbumId: string; appleUrl: string;
  spotifyAlbumId: string; spotifyUrl: string;
  tracks: TrackDraft[];
};
type SavedAlbum = AlbumDraft & { id: number };

function normTitle(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontSize: 14, padding: "10px 12px",
  borderRadius: 10, outline: "none", color: WARM, fontFamily: FONT,
  background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
};

export default function AdminAudioLibraryPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AppleSearchResult[]>([]);
  const [draft, setDraft] = useState<AlbumDraft | null>(null);
  const [loadingAlbum, setLoadingAlbum] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: who, isLoading: whoLoading } = useQuery<{ isSuperAdmin: boolean }>({
    queryKey: ["/api/admin/am-super"],
    queryFn: () => apiRequest("GET", "/api/admin/am-super") as Promise<{ isSuperAdmin: boolean }>,
  });

  const { data: libraryData } = useQuery<{ albums: SavedAlbum[] }>({
    queryKey: ["/api/curated-audio"],
    queryFn: () => apiRequest("GET", "/api/curated-audio") as Promise<{ albums: SavedAlbum[] }>,
    enabled: !!who?.isSuperAdmin,
  });
  const savedAlbums = libraryData?.albums ?? [];

  const runSearch = async () => {
    const term = query.trim();
    if (!term) return;
    setSearching(true); setError("");
    try {
      const r = await apiRequest("GET", `/api/apple-music/search?term=${encodeURIComponent(term)}`) as { results?: AppleSearchResult[]; reason?: string };
      const albums = (r.results ?? []).filter((x) => x.kind === "album");
      setSearchResults(albums);
      if (albums.length === 0 && r.reason === "not-configured") {
        setError("Apple Music search isn't configured on the server (APPLE_MUSIC_KEY_ID / TEAM_ID / PRIVATE_KEY).");
      }
    } catch {
      setError("Search failed — check the connection and try again.");
    } finally {
      setSearching(false);
    }
  };

  const pickAlbum = async (a: AppleSearchResult) => {
    setLoadingAlbum(true); setError(""); setDraft(null);
    try {
      const ar = await apiRequest("GET", `/api/apple-music/album/${encodeURIComponent(a.id)}`) as {
        album: { appleAlbumId: string; title: string; artist: string; artworkUrl: string; appleUrl: string; tracks: TrackDraft[] } | null;
        reason?: string;
      };
      if (!ar.album) {
        setError(ar.reason === "not-configured"
          ? "Apple Music isn't configured on the server."
          : "Couldn't load that album's tracklist — try another.");
        return;
      }
      const tracks: TrackDraft[] = ar.album.tracks.map((t) => ({ ...t, spotifyTrackId: null, spotifyUrl: null }));

      // Best-effort Spotify match — a convenience, never required to save.
      let spotifyAlbumId = "";
      let spotifyUrl = "";
      try {
        const sr = await apiRequest(
          "GET",
          `/api/spotify-catalog/match-album?title=${encodeURIComponent(ar.album.title)}&artist=${encodeURIComponent(ar.album.artist)}`,
        ) as { album: { spotifyAlbumId: string; spotifyUrl: string; tracks: { trackNumber: number; title: string; spotifyTrackId: string; spotifyUrl: string }[] } | null };
        if (sr.album) {
          spotifyAlbumId = sr.album.spotifyAlbumId;
          spotifyUrl = sr.album.spotifyUrl;
          // Pair by track number first (the common case for a standard
          // reissue), falling back to a normalized title match — an admin
          // can still fix any pairing by hand before saving either way.
          for (const t of tracks) {
            const byNumber = sr.album.tracks.find((s) => s.trackNumber === t.trackNumber);
            const match = byNumber ?? sr.album.tracks.find((s) => normTitle(s.title) === normTitle(t.title));
            if (match) { t.spotifyTrackId = match.spotifyTrackId; t.spotifyUrl = match.spotifyUrl; }
          }
        }
      } catch { /* Spotify match is optional — silently proceed without it */ }

      setDraft({
        title: ar.album.title,
        artist: ar.album.artist,
        artworkUrl: ar.album.artworkUrl,
        note: "",
        appleAlbumId: ar.album.appleAlbumId,
        appleUrl: ar.album.appleUrl,
        spotifyAlbumId,
        spotifyUrl,
        tracks,
      });
      setSearchResults([]);
      setQuery("");
    } finally {
      setLoadingAlbum(false);
    }
  };

  const updateTrack = (i: number, patch: Partial<TrackDraft>) => {
    setDraft((d) => d ? { ...d, tracks: d.tracks.map((t, idx) => idx === i ? { ...t, ...patch } : t) } : d);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true); setError("");
    try {
      await apiRequest("POST", "/api/admin/curated-audio", draft);
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["/api/curated-audio"] });
    } catch {
      setError("Save failed — check the connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const removeAlbum = async (id: number) => {
    if (!confirm("Remove this album from the curated library?")) return;
    await apiRequest("DELETE", `/api/admin/curated-audio/${id}`);
    await qc.invalidateQueries({ queryKey: ["/api/curated-audio"] });
  };

  if (whoLoading) return <div style={{ minHeight: "100dvh", background: BG }} />;
  if (!who?.isSuperAdmin) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15 }}>This page is for app administrators.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, padding: "calc(env(safe-area-inset-top) + 14px) 16px calc(env(safe-area-inset-bottom) + 24px)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
          <button type="button" onClick={() => setLocation("/admin/tools")}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer", padding: 6 }}>
            ← Admin
          </button>
          <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>Audio library</span>
          <span style={{ width: 60 }} />
        </div>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 16px" }}>
          Search Apple Music, pick an album, review its tracklist (Spotify links are matched automatically where possible — fill in any that are missing), then save it into the Audio Divina library.
        </p>

        {error && (
          <p style={{ color: "#e8a87c", fontFamily: FONT, fontSize: 13, margin: "0 0 12px", padding: "10px 12px", borderRadius: 10, background: "rgba(232,168,124,0.08)", border: "1px solid rgba(232,168,124,0.3)" }}>
            {error}
          </p>
        )}

        {!draft && (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
                placeholder="Search Apple Music for an album — e.g. “A Love Supreme”"
                style={inputStyle}
              />
              <button type="button" onClick={() => void runSearch()} disabled={searching}
                style={{ padding: "10px 18px", borderRadius: 10, fontFamily: FONT, fontSize: 14, fontWeight: 600, color: WARM, background: "rgba(46,107,64,0.6)", border: "1px solid rgba(143,175,150,0.65)", cursor: "pointer", opacity: searching ? 0.6 : 1, whiteSpace: "nowrap" }}>
                {searching ? "…" : "Search"}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {searchResults.map((a) => (
                  <button key={a.id} type="button" onClick={() => void pickAlbum(a)} disabled={loadingAlbum}
                    style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: 10, borderRadius: 12, background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`, cursor: "pointer" }}>
                    {a.artworkUrl
                      ? <img src={a.artworkUrl} alt="" width={44} height={44} style={{ borderRadius: 6, flexShrink: 0 }} />
                      : <div style={{ width: 44, height: 44, borderRadius: 6, background: "rgba(240,237,230,0.08)", flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</p>
                      <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, margin: "2px 0 0" }}>{a.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {loadingAlbum && <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, marginTop: 14 }}>Loading tracklist…</p>}

            <div style={{ marginTop: 28 }}>
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 10px" }}>
                In the library ({savedAlbums.length})
              </p>
              {savedAlbums.length === 0 && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13 }}>Nothing curated yet.</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {savedAlbums.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 12, background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}` }}>
                    {a.artworkUrl
                      ? <img src={a.artworkUrl} alt="" width={44} height={44} style={{ borderRadius: 6, flexShrink: 0 }} />
                      : <div style={{ width: 44, height: 44, borderRadius: 6, background: "rgba(240,237,230,0.08)", flexShrink: 0 }} />}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</p>
                      <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, margin: "2px 0 0" }}>
                        {a.artist} · {a.tracks.length} track{a.tracks.length === 1 ? "" : "s"}
                        {a.spotifyUrl ? " · Apple + Spotify" : " · Apple only"}
                      </p>
                    </div>
                    <button type="button" onClick={() => void removeAlbum(a.id)}
                      style={{ background: "none", border: "none", color: "rgba(232,168,124,0.85)", fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 6 }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {draft && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              {draft.artworkUrl
                ? <img src={draft.artworkUrl} alt="" width={64} height={64} style={{ borderRadius: 8 }} />
                : <div style={{ width: 64, height: 64, borderRadius: 8, background: "rgba(240,237,230,0.08)" }} />}
              <div>
                <p style={{ color: WARM, fontFamily: FONT, fontSize: 17, fontWeight: 700, margin: 0 }}>{draft.title}</p>
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, margin: "2px 0 0" }}>{draft.artist}</p>
              </div>
            </div>

            <label style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>Note (optional)</label>
            <textarea
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value.slice(0, 280) })}
              placeholder="Why this album is here — shown on the browse card."
              rows={2}
              style={{ ...inputStyle, marginTop: 6, marginBottom: 14, resize: "vertical" }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>Apple Music link</label>
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12.5, margin: "6px 0 0", overflowWrap: "anywhere" }}>{draft.appleUrl || "—"}</p>
              </div>
              <div>
                <label style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>Spotify link (album)</label>
                <input
                  value={draft.spotifyUrl}
                  onChange={(e) => setDraft({ ...draft, spotifyUrl: e.target.value.trim() })}
                  placeholder="Paste if not matched automatically"
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              </div>
            </div>

            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 8px" }}>
              Tracks ({draft.tracks.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {draft.tracks.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(240,237,230,0.04)", border: `1px solid ${BORDER}` }}>
                  <span style={{ color: FAINT, fontFamily: FONT, fontSize: 12, width: 22, textAlign: "right", flexShrink: 0 }}>{t.trackNumber}</span>
                  <span style={{ color: WARM, fontFamily: FONT, fontSize: 13, flex: "1 1 40%", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  <span style={{ color: t.appleUrl ? SAGE : FAINT, fontFamily: FONT, fontSize: 11.5, flexShrink: 0 }}>{t.appleUrl ? "Apple ✓" : "Apple —"}</span>
                  <input
                    value={t.spotifyUrl ?? ""}
                    onChange={(e) => updateTrack(i, { spotifyUrl: e.target.value.trim() || null })}
                    placeholder="Spotify link"
                    style={{ ...inputStyle, padding: "6px 8px", fontSize: 12, flex: "1 1 35%", minWidth: 0 }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setDraft(null)}
                style={{ flex: 1, padding: "12px 0", borderRadius: 12, fontFamily: FONT, fontSize: 14, fontWeight: 600, color: SAGE, background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`, cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={() => void save()} disabled={saving}
                style={{ flex: 2, padding: "12px 0", borderRadius: 12, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: WARM, background: "rgba(46,107,64,0.6)", border: "1px solid rgba(143,175,150,0.65)", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Save to library"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
