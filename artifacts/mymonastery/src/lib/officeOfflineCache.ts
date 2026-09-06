// ── officeOfflineCache — full assembled Daily Office days, cached for weeks
// ahead ─────────────────────────────────────────────────────────────────────
//
// A dedicated IndexedDB store, separate from lib/idbCache.ts on purpose: that
// layer's hydrate step deliberately DISCARDS anything not from the current
// LOCAL DAY (see its own comment — a same-key, date-less cache burned a user
// with yesterday's office rendering as today's). This store is the opposite
// shape: many entries, one per (mode, date), meant to live for weeks so the
// office can still open with no network at all. Written by lib/officePrefetch.ts
// (a background walk of the next 30 days while on Wi-Fi) and read by
// bcp-daily-office.tsx as a fallback when the live fetch fails.
//
// Failure is always silent: if IndexedDB is unavailable (private mode, old
// webview, quota error) every call no-ops — offline just doesn't work, same
// as before this layer existed.

import type { LiturgyMode } from "@/pages/bcp-daily-office";

const DB_NAME = "phoebe-office-offline";
const STORE = "days";
const DB_VERSION = 1;
// A prefetched day is only ever useful up to ~5 weeks out (the prefetch
// window is 30 days) — anything older than that is prune-eligible dead
// weight, not "still might be needed."
const MAX_AGE_MS = 35 * 24 * 60 * 60 * 1000;

export type OfficeCacheKey = {
  mode: LiturgyMode;
  date: string; // YYYY-MM-DD, the viewer's LOCAL date the office was requested for
  // Only meaningful for full Morning/Evening Prayer (getSideConfession) —
  // "" for every other mode. Baked into the key so a live load() and the
  // prefetcher agree on what they're both asking for; a confession toggle
  // mid-window just means future prefetches write a new key, not that old
  // entries "poison" the new setting (they're simply never read again).
  confession: "" | "0" | "1";
  /**
   * WHICH READINGS a Daily Scripture Reading deck holds ("psalms,ot,nt,gospel"
   * order, comma-joined), or undefined for every other mode AND for the
   * all-four default.
   *
   * In the key because the reader can now ask for fewer: without it a reader
   * who unchecked the Gospel would have been served the prefetched four-reading
   * deck from cache — keyId names the fields it hashes, so an extra property on
   * the object alone would have collided silently. Undefined keeps the id
   * byte-identical to what every existing entry was written under, so nothing
   * already cached is orphaned by this.
   */
  parts?: string;
  /** The Sunday readings deck: "1" | "2" — one cached deck per track. */
  track?: string;
};

function keyId(k: OfficeCacheKey): string {
  return `${k.mode}:${k.date}:${k.confession}${k.parts ? `:${k.parts}` : ""}`;
}

type Entry = { data: unknown; updatedAt: number };

let dbPromise: Promise<IDBDatabase | null> | null = null;
function getDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          try {
            if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
          } catch { /* ignore */ }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbPromise;
}

/** Read one cached office day. Returns null on any miss/failure. */
export function getOfficeCacheEntry(key: OfficeCacheKey): Promise<unknown | null> {
  return getDB().then((db) => {
    if (!db) return null;
    return new Promise<unknown | null>((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(keyId(key));
        req.onsuccess = () => {
          const e = req.result as Entry | undefined;
          if (!e) { resolve(null); return; }
          if (Date.now() - e.updatedAt > MAX_AGE_MS) { resolve(null); return; }
          resolve(e.data);
        };
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }).catch(() => null);
}

/** Write one office day's already-assembled slides into the cache. Best-effort. */
export function putOfficeCacheEntry(key: OfficeCacheKey, data: unknown): Promise<void> {
  return getDB().then((db) => {
    if (!db) return;
    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ data, updatedAt: Date.now() } as Entry, keyId(key));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  }).catch(() => { /* ignore */ });
}

/** Drop every entry keyed to a date before `todayYmd` — the prefetch window
 *  moves forward daily, so yesterday's cached office is dead weight, and
 *  once the day has passed there's no scenario where it's read again. */
export function pruneOfficeCacheBefore(todayYmd: string): Promise<void> {
  return getDB().then((db) => {
    if (!db) return;
    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const id = String(cursor.key);
          // id shape: "<mode>:<date>:<confession>" — date is always the
          // second colon-separated field regardless of mode's own dashes.
          const parts = id.split(":");
          const date = parts[1];
          if (date && date < todayYmd) cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  }).catch(() => { /* ignore */ });
}

/** Wipe the whole offline office cache — called on logout so one account's
 *  personalized office (it carries that user's own community intercessions)
 *  never leaks to the next person on a shared device. */
/** How many days are saved — what Admin Tools reports, so "is it working?"
 *  can be answered with a number instead of an Airplane Mode walk. */
export function countOfficeCacheEntries(): Promise<number> {
  return getDB().then((db) => {
    if (!db) return 0;
    return new Promise<number>((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).count();
        req.onsuccess = () => resolve(req.result ?? 0);
        req.onerror = () => resolve(0);
      } catch { resolve(0); }
    });
  }).catch(() => 0);
}

export function clearOfficeOfflineCache(): Promise<void> {
  return getDB().then((db) => {
    if (!db) {
      try { indexedDB.deleteDatabase(DB_NAME); } catch { /* ignore */ }
      return;
    }
    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  }).catch(() => { /* ignore */ });
}
