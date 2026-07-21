// ── idbCache — a second, LARGER offline layer (IndexedDB) ────────────────────
//
// The React Query persister (App.tsx) keeps a SMALL set of home-essential
// queries in localStorage so the home paints INSTANTLY on a cold boot — that
// path is deliberately synchronous and capped at ~5MB. This layer is additive
// and orthogonal: it caches the HEAVY content that would blow that budget
// (prayer feeds + the daily-office scripture/BCP text) in IndexedDB, where the
// quota is tens-to-hundreds of MB. It hydrates + persists asynchronously, which
// is fine because these aren't the instant-paint home — they're secondary
// screens where a few ms of restore is imperceptible.
//
// Failure is always silent: if IndexedDB is unavailable (private mode, old
// webview, quota error) every call no-ops and the app behaves exactly as it
// would with no offline cache — strictly no worse than before this layer.

import type { QueryClient } from "@tanstack/react-query";

const DB_NAME = "phoebe-offline";
const STORE = "queries";
const DB_VERSION = 1;
// Match the localStorage persister's maxAge so the two layers agree on "stale".
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const THROTTLE_MS = 1500;

// Query-key prefixes this layer owns. Kept OUT of PERSISTED_QUERY_KEYS (the
// localStorage set) so a key is never written to both stores.
//   /api/prayer-feeds — community / parish prayer feeds + their entries.
//   /api/office/      — the daily office (morning/evening) scripture, psalms,
//                       readings + collects. (The static BCP prayer library is
//                       bundled into the app, so it's already offline.)
const IDB_PREFIXES = ["/api/prayer-feeds", "/api/office/"];

function keyOwned(queryKey: readonly unknown[]): boolean {
  const head = String(queryKey?.[0] ?? "");
  return IDB_PREFIXES.some((p) => head.startsWith(p));
}

function keyId(queryKey: readonly unknown[]): string {
  try { return JSON.stringify(queryKey); } catch { return String(queryKey?.[0] ?? ""); }
}

type Entry = { key: readonly unknown[]; data: unknown; updatedAt: number };

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

function idbGetAll(): Promise<Entry[]> {
  return getDB().then((db) => {
    if (!db) return [];
    return new Promise<Entry[]>((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result as Entry[]) ?? []);
        req.onerror = () => resolve([]);
      } catch { resolve([]); }
    });
  });
}

function idbPut(id: string, entry: Entry): Promise<void> {
  return getDB().then((db) => {
    if (!db) return;
    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(entry, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  });
}

/** Wipe the heavy offline cache — called on logout so one account's feeds /
 *  office text never leak to the next person on a shared device. */
export function clearIdbCache(): Promise<void> {
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
  });
}

/** Restore cached heavy queries into the client once on app start. Skips entries
 *  older than MAX_AGE_MS (let them refetch), skips anything cached on an earlier
 *  LOCAL DAY, and never clobbers fresher data the current session already
 *  fetched. */
export function hydrateIdbCache(qc: QueryClient): Promise<void> {
  return idbGetAll().then((entries) => {
    const now = Date.now();
    // The cached keys are day-scoped but date-less — `/api/office/${side}` and
    // `/api/prayer-feeds/today` name no date — so within the 24h window an
    // entry written last night rehydrated this morning and served YESTERDAY's
    // psalms, lessons and collect as today's office. A refetch is queued behind
    // it, but it paints wrong first, and offline it stays wrong for the whole
    // office. Age alone can't express "same calendar day", so compare the day.
    // (2026-07-21 data audit.)
    const today = (() => {
      try { return new Date().toLocaleDateString("en-CA"); } catch { return ""; }
    })();
    for (const e of entries) {
      if (!e || !Array.isArray(e.key)) continue;
      const updatedAt = e.updatedAt ?? 0;
      if (now - updatedAt > MAX_AGE_MS) continue;
      if (today) {
        const cachedDay = (() => {
          try { return new Date(updatedAt).toLocaleDateString("en-CA"); } catch { return ""; }
        })();
        if (cachedDay && cachedDay !== today) continue;
      }
      const existing = qc.getQueryState(e.key);
      if (existing && existing.dataUpdatedAt >= updatedAt) continue;
      try { qc.setQueryData(e.key, e.data, { updatedAt }); } catch { /* ignore */ }
    }
  }).catch(() => { /* offline cache is best-effort */ });
}

/** Subscribe to the query cache and write owned heavy queries to IndexedDB,
 *  throttled. Returns an unsubscribe fn (the app keeps it for its whole life). */
export function attachIdbPersistence(qc: QueryClient): () => void {
  const pending = new Map<string, Entry>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const batch = Array.from(pending.entries());
    pending.clear();
    for (const [id, entry] of batch) void idbPut(id, entry);
  };
  return qc.getQueryCache().subscribe((event) => {
    const q = event.query;
    if (!q || !keyOwned(q.queryKey)) return;
    const state = q.state;
    if (state.status !== "success" || state.data === undefined) return;
    pending.set(keyId(q.queryKey), { key: q.queryKey, data: state.data, updatedAt: state.dataUpdatedAt });
    if (timer == null) timer = setTimeout(flush, THROTTLE_MS);
  });
}
