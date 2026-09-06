/**
 * dayContentCache — a day's own content, kept for the coming weeks.
 *
 * The offices carry their whole assembled deck (officeOfflineCache) and the
 * readers carry their passages (passageCache), but two practices ask the
 * server for the LIST that makes the day: Lectio Divina for the three lessons
 * you choose between, and the Psalms for the psalm appointed. Without them a
 * device with every passage saved still opened Lectio on an empty picker.
 *
 * One helper does both halves: `cachedDayGet` fetches and keeps a copy, and
 * falls back to that copy when the request can't be made. A page's queryFn
 * calls it instead of apiRequest and needs no other offline branch.
 */
import { JSON_DAYS, storeGet, storePut, storeHas, storePrune } from "@/lib/offlineStore";

const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;

/** The key a URL is remembered under — the path and its query, as asked. */
export function dayKey(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "");
}

/** Fetch and keep; on failure serve the kept copy (or null). */
export async function cachedDayGet<T>(url: string): Promise<T | null> {
  const key = dayKey(url);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = (await res.json()) as T;
      if (data) { await storePut(JSON_DAYS, key, data); return data; }
    }
  } catch { /* offline / blocked — fall through to the saved copy */ }
  return storeGet<T>(JSON_DAYS, key);
}

/** Save one day ahead of time, unless it is already here. */
export async function cacheDay(url: string): Promise<boolean> {
  const key = dayKey(url);
  if (await storeHas(JSON_DAYS, key)) return true;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data) return false;
    await storePut(JSON_DAYS, key, data);
    return true;
  } catch { return false; }
}

export function pruneDays(): Promise<void> {
  return storePrune(JSON_DAYS, MAX_AGE_MS);
}
