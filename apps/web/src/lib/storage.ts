import type { Op } from '@hisaab/core';

/**
 * Durable on-device storage. IndexedDB holds the operation log (append-only,
 * idempotent puts) and a few settings. If IndexedDB is unavailable (some
 * private modes and embedded previews), the app still works for the session
 * and says so.
 */
export interface Meta {
  dev: string;
  code: string;            // the shop's secret sync code
  lang: 'hi' | 'en';
  onboarded: boolean;
  relay: string;           // sync server URL ('' = off)
  syncEnabled: boolean;
  lastSync: number;
  lastBackup: number;
}

export interface Storage {
  readonly durable: boolean;
  loadOps(): Promise<Op[]>;
  putOps(ops: Op[]): Promise<void>;
  loadMeta(): Promise<Partial<Meta>>;
  saveMeta(m: Partial<Meta>): Promise<void>;
}

const DB = 'hisaab', VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

class IdbStorage implements Storage {
  readonly durable = true;
  constructor(private db: IDBDatabase) {}
  static async open(): Promise<IdbStorage> {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('ops')) db.createObjectStore('ops', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    return new IdbStorage(await req(r));
  }
  async loadOps() { return req(this.db.transaction('ops').objectStore('ops').getAll()) as Promise<Op[]>; }
  putOps(ops: Op[]) {
    if (!ops.length) return Promise.resolve();
    return new Promise<void>((res, rej) => {
      const tx = this.db.transaction('ops', 'readwrite');
      const st = tx.objectStore('ops');
      for (const o of ops) st.put(o);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  async loadMeta() { return ((await req(this.db.transaction('meta').objectStore('meta').get('meta'))) ?? {}) as Partial<Meta>; }
  saveMeta(m: Partial<Meta>) {
    return new Promise<void>((res, rej) => {
      const tx = this.db.transaction('meta', 'readwrite');
      const st = tx.objectStore('meta');
      const g = st.get('meta');
      g.onsuccess = () => st.put({ ...(g.result ?? {}), ...m }, 'meta');
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
}

class MemoryStorage implements Storage {
  readonly durable = false;
  private ops = new Map<string, Op>();
  private meta: Partial<Meta> = {};
  async loadOps() { return [...this.ops.values()]; }
  async putOps(ops: Op[]) { for (const o of ops) this.ops.set(o.id, o); }
  async loadMeta() { return { ...this.meta }; }
  async saveMeta(m: Partial<Meta>) { Object.assign(this.meta, m); }
}

export async function openStorage(): Promise<Storage> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    const s = await IdbStorage.open();
    // ask the browser not to evict the khata under storage pressure
    navigator.storage?.persist?.().catch(() => {});
    return s;
  } catch { return new MemoryStorage(); }
}
