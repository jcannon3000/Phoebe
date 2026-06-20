// Your Sacred Library — a personal, curated collection of music for prayer.
// The heart of Audio Divina (sacred listening): the songs, albums, and
// playlists that draw *you* toward God, saved for one-tap access.
//
// Local-first (one small localStorage list), like the rest of Audio Divina —
// nothing about your music leaves the device. You add to it two ways:
//   • paste an Apple Music / Spotify share link (works today, both platforms)
//   • search the platform catalogue (Spotify Web API, once Spotify is wired;
//     Apple Music catalogue search needs native MusicKit — see searchCatalog).
// Tapping an item opens it in the music app (or plays in-app for the curated
// playlist), so your sacred music is always a tap away.

import { getValidAccessToken } from "@/lib/spotify";

export type SacredKind = "song" | "album" | "playlist";
export type SacredService = "apple" | "spotify" | "other";

export type SacredItem = {
  id: string; // synthetic, stable within this device
  kind: SacredKind;
  title: string;
  subtitle?: string; // artist / curator
  service: SacredService;
  url: string; // share / deep link, used to play
  artworkUrl?: string;
  addedAt: number;
};

const STORE_KEY = "phoebe:sacred-library";
export const SACRED_LIBRARY_EVENT = "phoebe:sacred-library-changed";

export const KIND_EMOJI: Record<SacredKind, string> = { song: "🎵", album: "💿", playlist: "📃" };
export const SERVICE_LABEL: Record<SacredService, string> = { apple: "Apple Music", spotify: "Spotify", other: "Music" };

function emit(): void {
  try { window.dispatchEvent(new Event(SACRED_LIBRARY_EVENT)); } catch { /* ignore */ }
}

export function getSacredLibrary(): SacredItem[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as SacredItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: SacredItem[]): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, 200))); } catch { /* quota / private */ }
  emit();
}

/** True if a link is already saved (dedupe by normalized url). */
export function inSacredLibrary(url: string): boolean {
  const norm = url.trim();
  return getSacredLibrary().some((i) => i.url === norm);
}

/** Save an item. Newest first; de-duped by url. Returns the saved item. */
export function addToSacredLibrary(item: Omit<SacredItem, "id" | "addedAt">): SacredItem {
  const items = getSacredLibrary();
  const existing = items.find((i) => i.url === item.url);
  if (existing) return existing;
  const saved: SacredItem = {
    ...item,
    title: item.title.trim().slice(0, 160) || SERVICE_LABEL[item.service],
    subtitle: item.subtitle?.trim().slice(0, 160) || undefined,
    id: `${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`,
    addedAt: Date.now(),
  };
  write([saved, ...items]);
  return saved;
}

export function removeFromSacredLibrary(id: string): void {
  write(getSacredLibrary().filter((i) => i.id !== id));
}

// ——— Parse a pasted Apple Music / Spotify link into a saveable item ———
function titleFromSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "";
  }
}

export type ParsedLink = { service: SacredService; kind: SacredKind; url: string; title: string };

/** Parse an Apple Music / Spotify share link (or spotify: uri). Null if it
 *  isn't a recognizable song/album/playlist link. */
export function parseMusicLink(raw: string): ParsedLink | null {
  const input = raw.trim();
  if (!input) return null;

  // spotify:track:ID style uri
  const uri = input.match(/^spotify:(track|album|playlist):([A-Za-z0-9]+)/);
  if (uri) {
    const kind: SacredKind = uri[1] === "track" ? "song" : (uri[1] as SacredKind);
    return { service: "spotify", kind, url: `https://open.spotify.com/${uri[1]}/${uri[2]}`, title: "" };
  }

  let u: URL;
  try { u = new URL(input); } catch { return null; }
  const parts = u.pathname.split("/").filter(Boolean);

  if (u.hostname.includes("music.apple.com")) {
    const ti = parts.findIndex((p) => p === "album" || p === "playlist" || p === "song");
    if (ti === -1) return null;
    const type = parts[ti];
    const slug = parts[ti + 1] ?? "";
    const kind: SacredKind = type === "playlist" ? "playlist" : (type === "song" || u.searchParams.has("i")) ? "song" : "album";
    return { service: "apple", kind, url: input, title: titleFromSlug(slug) };
  }

  if (u.hostname.includes("open.spotify.com")) {
    const type = parts[0];
    const kind: SacredKind | null = type === "playlist" ? "playlist" : type === "album" ? "album" : type === "track" ? "song" : null;
    if (!kind) return null;
    // Spotify share links carry no human slug — the user titles it.
    return { service: "spotify", kind, url: `https://open.spotify.com/${u.pathname.split("/").filter(Boolean).join("/")}`, title: "" };
  }

  return null;
}

// ——— Catalogue search ———
export type SearchResult = { kind: SacredKind; title: string; subtitle?: string; url: string; artworkUrl?: string; service: SacredService };

/** Whether live catalogue search is available right now (needs a Spotify token).
 *  Apple Music catalogue search needs native MusicKit (not yet wired). */
export async function catalogSearchAvailable(): Promise<boolean> {
  try { return !!(await getValidAccessToken()); } catch { return false; }
}

/** Search the Spotify catalogue (songs / albums / playlists). Returns [] when
 *  Spotify isn't connected. Apple Music search is a native-MusicKit TODO. */
export async function searchCatalog(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const token = await getValidAccessToken().catch(() => null);
  if (!token) return [];
  try {
    const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track,album,playlist&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const j = await res.json();
    const out: SearchResult[] = [];
    for (const t of j.tracks?.items ?? []) {
      if (!t?.external_urls?.spotify) continue;
      out.push({ kind: "song", title: t.name, subtitle: (t.artists ?? []).map((a: { name: string }) => a.name).join(", "), url: t.external_urls.spotify, artworkUrl: t.album?.images?.at(-1)?.url, service: "spotify" });
    }
    for (const a of j.albums?.items ?? []) {
      if (!a?.external_urls?.spotify) continue;
      out.push({ kind: "album", title: a.name, subtitle: (a.artists ?? []).map((x: { name: string }) => x.name).join(", "), url: a.external_urls.spotify, artworkUrl: a.images?.at(-1)?.url, service: "spotify" });
    }
    for (const p of j.playlists?.items ?? []) {
      if (!p?.external_urls?.spotify) continue;
      out.push({ kind: "playlist", title: p.name, subtitle: p.owner?.display_name, url: p.external_urls.spotify, artworkUrl: p.images?.at(-1)?.url, service: "spotify" });
    }
    return out;
  } catch {
    return [];
  }
}
