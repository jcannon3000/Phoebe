/**
 * imageCache — Visio Divina's pictures, saved on the device.
 *
 * Owner (2026-09-05): "make sure future pictures are saved for the next 4
 * weeks." The prefetch (officePrefetch) stores the scheduled artwork for the
 * coming weeks as blobs; the Visio page asks here for a local copy when the
 * device is offline (or the network copy failed) and gets an object URL.
 */
import { IMAGES, storeGet, storePut, storeHas, storePrune, storeKeys, storeDelete } from "@/lib/offlineStore";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
// A picture must not hold the walk open on a dead network.
const FETCH_TIMEOUT_MS = 20_000;
const objectUrls = new Map<string, string>();

/** JPEG, PNG, GIF, WebP — enough to tell a picture from a base64 string. */
function looksLikeImage(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const b = bytes;
  return (b[0] === 0xff && b[1] === 0xd8)                                        // JPEG
    || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)        // PNG
    || (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)                          // GIF
    || (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46);        // RIFF/WebP

}

export async function cacheImage(url: string): Promise<boolean> {
  if (!url) return false;
  if (await storeHas(IMAGES, url)) return true;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, { mode: "cors", ...(controller ? { signal: controller.signal } : {}) });
    if (!res.ok) return false;
    /**
     * arrayBuffer, NOT blob() — and then the bytes are CHECKED.
     *
     * CapacitorHttp patches fetch on the device and mangles a binary body read
     * through res.blob(); the app already works around it once, for the data
     * export (settings.tsx), by not touching the binary path. A picture cannot
     * avoid binary, so instead: read the bytes, and if they are not an image's
     * bytes, assume the bridge handed us base64 text and decode it. A blob
     * that is neither is refused rather than saved as a picture that will
     * never render.
     */
    const buf = new Uint8Array(await res.arrayBuffer());
    let bytes: Uint8Array | null = looksLikeImage(buf) ? buf : null;
    if (!bytes) {
      try {
        const text = new TextDecoder().decode(buf).trim();
        const base64 = text.startsWith("data:") ? text.slice(text.indexOf(",") + 1) : text;
        if (/^[A-Za-z0-9+/=\s]+$/.test(base64.slice(0, 64))) {
          const bin = atob(base64.replace(/\s/g, ""));
          const out = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
          if (looksLikeImage(out)) bytes = out;
        }
      } catch { /* not base64 either — fall through and refuse */ }
    }
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return false;
    const type = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    // `bytes.buffer` (not the view) — TypeScript's BlobPart doesn't accept a
    // generic Uint8Array, and the underlying buffer is what we mean anyway.
    return storePut(IMAGES, url, new Blob([bytes.buffer as ArrayBuffer], { type: type.startsWith("image/") ? type : "image/jpeg" }));
  } catch { return false; }
  finally { if (timeout) clearTimeout(timeout); }
}

export async function hasCachedImage(url: string): Promise<boolean> {
  return url ? storeHas(IMAGES, url) : false;
}

/** A local URL for a saved picture, or null. Object URLs are kept for the
 *  session — a picture the deck shows again reuses the same one. */
export async function cachedImageUrl(url: string): Promise<string | null> {
  if (!url) return null;
  const hit = objectUrls.get(url);
  if (hit) return hit;
  const blob = await storeGet<Blob>(IMAGES, url);
  if (!blob) return null;
  try {
    const local = URL.createObjectURL(blob);
    objectUrls.set(url, local);
    return local;
  } catch { return null; }
}

export function pruneImages(): Promise<void> {
  return storePrune(IMAGES, MAX_AGE_MS);
}

/**
 * KEEP ONLY THE WINDOW'S PICTURES. Age alone would hold a work for six weeks
 * after its week passed; the schedule says exactly which pictures the coming
 * month needs, so everything else can go the moment it is no longer one of
 * them (owner: delete the past, download the next 28 days).
 */
export async function pruneImagesExcept(keep: Set<string>): Promise<void> {
  const keys = await storeKeys(IMAGES);
  for (const key of keys) {
    if (!keep.has(key)) {
      objectUrls.delete(key);
      await storeDelete(IMAGES, key);
    }
  }
}
