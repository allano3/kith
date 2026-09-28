import type { SealedVault } from './crypto';

/** Minimal IndexedDB wrapper. Only sealed (encrypted) vaults are ever written. */
const DB_NAME = 'kith';
const STORE = 'vault';
const KEY = 'main';

function open(): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
  return promise;
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    return await promise;
  } finally {
    db.close();
  }
}

export async function loadSealed(): Promise<SealedVault | null> {
  return (await run<SealedVault | undefined>('readonly', (s) => s.get(KEY))) ?? null;
}

export async function saveSealed(sealed: SealedVault): Promise<void> {
  await run('readwrite', (s) => s.put(sealed, KEY));
}

/** Irreversibly deletes the whole local database. */
export function destroyAll(): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const req = indexedDB.deleteDatabase(DB_NAME);
  req.onsuccess = () => resolve();
  req.onerror = () => reject(req.error);
  req.onblocked = () => resolve();
  return promise;
}
