/**
 * offlineStore — the device's copy of content that otherwise needs the network.
 *
 * Owner (2026-09-05): "audit what features can be offered offline by saving
 * content to their phone and build as much as possible … have oremus pages
 * saved for the future just like it saves the offices … make sure future
 * pictures are saved for the next 4 weeks, and future scriptures."
 *
 * The offices already have their own IndexedDB store (officeOfflineCache);
 * this one holds the OTHER two things a practice needs and a phone can carry:
 *   • passages — the scripture text the readers open on bible.oremus.org,
 *     keyed by the passage reference, fetched through /api/scripture/passage;
 *   • images  — the Visio Divina pictures, as blobs, keyed by their URL.
 *
 * IndexedDB, not the Cache API: the native shell deliberately deletes every
 * Cache-Storage bucket on launch (a stale service-worker cleanup in main.tsx),
 * and localStorage's ~5 MB could not hold a month of pictures. Every call is
 * best-effort and silent — no IndexedDB (private mode, an old WebView) means
 * "nothing saved", never an error.
 */

const DB_NAME = "phoebe-offline-content";
// v2 added `json` — whole day-payloads (a day's Lectio readings, a day's
// psalms), which are neither a passage nor a picture.
const DB_VERSION = 2;
export const PASSAGES = "passages";
export const IMAGES = "images";
export const JSON_DAYS = "json";

type Row<T> = { value: T; updatedAt: number };

let dbPromise: Promise<IDBDatabase | null> | null = null;
/**
 * The open is BOUNDED. It settled only on success, error or blocked — and if
 * none of the three fires (an upgrade behind another tab, a wedged store) the
 * memoised promise never resolves and every read after it awaits forever. On
 * the office's offline path that is a veil that never lifts, with no error to
 * show: exactly the symptom we spent today chasing for a different cause.
 */
const OPEN_TIMEOUT_MS = 4000;
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let settled = false;
    const done = (db: IDBDatabase | null) => { if (!settled) { settled = true; resolve(db); } };
    setTimeout(() => done(null), OPEN_TIMEOUT_MS);
    try {
      if (typeof indexedDB === "undefined") { done(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const s of [PASSAGES, IMAGES, JSON_DAYS]) {
          if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
        }
      };
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch { done(null); }
  });
  return dbPromise;
}

export async function storeGet<T>(store: string, key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, "readonly").objectStore(store).get(key);
      req.onsuccess = () => resolve(((req.result as Row<T> | undefined)?.value) ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/**
 * Returns whether the row is ACTUALLY stored.
 *
 * It resolved the same way on complete, error and abort — and a full device
 * aborts the transaction with QuotaExceededError. So every caller was told
 * "saved", the run stamped the day, and nothing was on the phone. A write
 * that did not land must say so.
 */
export async function storePut<T>(store: string, key: string, value: T): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put({ value, updatedAt: Date.now() } as Row<T>, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
}

export async function storeHas(store: string, key: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, "readonly").objectStore(store).getKey(key);
      req.onsuccess = () => resolve(req.result != null);
      req.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

export async function storeKeys(store: string): Promise<string[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, "readonly").objectStore(store).getAllKeys();
      req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

export async function storeDelete(store: string, key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}

/** Drop rows not touched in `maxAgeMs` — keeps a month of content a month. */
export async function storePrune(store: string, maxAgeMs: number): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      const cutoff = Date.now() - maxAgeMs;
      const req = os.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        const row = cur.value as Row<unknown>;
        if (typeof row?.updatedAt === "number" && row.updatedAt < cutoff) cur.delete();
        cur.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
