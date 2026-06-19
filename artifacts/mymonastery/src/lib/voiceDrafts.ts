/**
 * voiceDrafts — saved voice prayers waiting to be sent ("save it and send
 * later"). Stored ON-DEVICE only (IndexedDB), never on the server, so a draft
 * is as private as the phone. Each draft already holds the polished audio blob
 * + the recipient, so "send later" is just encrypt-and-POST when you choose to.
 */

export interface VoiceDraft {
  id: string;
  recipientId: number;
  recipientName: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  preset: string;
  createdAt: number;
}

const DB = "phoebe-voice-drafts";
const STORE = "drafts";
export const VOICE_DRAFTS_EVENT = "phoebe:voice-drafts";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no idb")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

function emit() { try { window.dispatchEvent(new CustomEvent(VOICE_DRAFTS_EVENT)); } catch { /* ignore */ } }

function newId(): string {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export async function saveVoiceDraft(d: Omit<VoiceDraft, "id" | "createdAt">): Promise<VoiceDraft> {
  const draft: VoiceDraft = { ...d, id: newId(), createdAt: Date.now() };
  await tx("readwrite", (s) => s.put(draft));
  emit();
  return draft;
}

export async function listVoiceDrafts(): Promise<VoiceDraft[]> {
  try {
    const all = await tx<VoiceDraft[]>("readonly", (s) => s.getAll() as IDBRequest<VoiceDraft[]>);
    return (all ?? []).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

export async function deleteVoiceDraft(id: string): Promise<void> {
  try { await tx("readwrite", (s) => s.delete(id)); emit(); } catch { /* ignore */ }
}
