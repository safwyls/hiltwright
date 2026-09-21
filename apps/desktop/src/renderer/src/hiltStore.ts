// Custom hilts kept between sessions, in the browser's own database: models are too big for localStorage.

import type { StoredHilt } from './hiltModel';

const DB = 'hiltwright-demo'; const STORE = 'hilts';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'name' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => { const r = run(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  } finally { db.close(); }
}
export const listHilts = (): Promise<StoredHilt[]> => tx('readonly', (s) => s.getAll() as IDBRequest<StoredHilt[]>);
export const saveHilt = (h: StoredHilt): Promise<IDBValidKey> => tx('readwrite', (s) => s.put(h));
export const removeHilt = (name: string): Promise<undefined> => tx('readwrite', (s) => s.delete(name));
