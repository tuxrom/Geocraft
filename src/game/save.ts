/** Sauvegarde dans IndexedDB : métadonnées du joueur + modifications du monde par chunk. */
const DB_NAME = 'geocraft';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(r ? (r.result as T) : undefined); };
    t.onerror = () => { db.close(); rej(t.error); };
    t.onabort = () => { db.close(); rej(t.error); };
  }));
}

export interface SaveMeta {
  version: number;
  seed: number;
  time: number;
  playTime: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; health: number };
  inventory: unknown;
  hotbar: number;
  creative: boolean;
  extra?: Record<string, unknown>;
  savedAt: number;
}

export async function loadMeta(): Promise<SaveMeta | null> {
  try { return ((await tx<SaveMeta>('readonly', (s) => s.get('meta'))) as SaveMeta | undefined) ?? null; }
  catch { return null; }
}

export async function loadMods(): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const t = db.transaction(STORE, 'readonly');
      const range = IDBKeyRange.bound('c:', 'c:\uffff');
      const req = t.objectStore(STORE).openCursor(range);
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) { out[String(cur.key).slice(2)] = Array.from(cur.value as Int32Array); cur.continue(); }
      };
      t.oncomplete = () => { db.close(); res(); };
      t.onerror = () => { db.close(); rej(t.error); };
    });
  } catch { /* ignore */ }
  return out;
}

export async function saveAll(meta: SaveMeta, chunkMods: Map<string, number[]>): Promise<void> {
  try {
    await tx('readwrite', (s) => {
      s.put(meta, 'meta');
      for (const [k, arr] of chunkMods) s.put(new Int32Array(arr), 'c:' + k);
    });
  } catch (e) { console.warn('Sauvegarde impossible', e); }
}

export async function clearSave(): Promise<void> {
  try { await tx('readwrite', (s) => s.clear()); } catch { /* ignore */ }
}
