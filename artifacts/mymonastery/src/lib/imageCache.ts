/**
 * imageCache — Visio Divina's pictures, saved on the device.
 *
 * Owner (2026-09-05): "make sure future pictures are saved for the next 4
 * weeks." The prefetch (officePrefetch) stores the scheduled artwork for the
 * coming weeks as blobs; the Visio page asks here for a local copy when the
 * device is offline (or the network copy failed) and gets an object URL.
 */
import { IMAGES, storeGet, storePut, storeHas, storePrune } from "@/lib/offlineStore";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const objectUrls = new Map<string, string>();

export async function cacheImage(url: string): Promise<boolean> {
  if (!url) return false;
  if (await storeHas(IMAGES, url)) return true;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (blob.size === 0 || blob.size > MAX_BYTES) return false;
    await storePut(IMAGES, url, blob);
    return true;
  } catch { return false; }
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
