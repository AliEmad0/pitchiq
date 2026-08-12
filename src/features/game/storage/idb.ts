const DB_NAME = "pitchiq-game";
const DB_VERSION = 1;

/**
 * Every object store in the database.
 *
 * ⚠️ Later tickets add their own — TASK-1812 records, TASK-1813 achievements,
 * TASK-1817 collections. Add the name here and bump `DB_VERSION`; the upgrade handler
 * creates stores idempotently by name, so it never assumes a single fixed schema and an
 * existing database gains the new store rather than being rebuilt.
 */
const STORES = ["match"] as const;
export type StoreName = (typeof STORES)[number];

/**
 * ⚠️ All four `/game/*` routes are `force-static`. Storage must only ever be touched
 * AFTER mount: the prerender runs in an environment with no IndexedDB, and a read during
 * render would either fail the build or bake one visitor's state into the CDN copy. This
 * guard makes the failure mode "no persistence" rather than "broken page".
 */
const available = (): boolean => typeof indexedDB !== "undefined";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("indexeddb upgrade blocked"));
  });
}

/**
 * Run one request inside its own transaction.
 *
 * The transaction is awaited via `oncomplete`, not via the request's `onsuccess` — a
 * write that succeeded but whose transaction then aborted has not been persisted, and
 * resolving early would report a save that never happened.
 */
function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    void open().then((db) => {
      const tx = db.transaction(store, mode);
      const req = action(tx.objectStore(store));
      let value: T;
      req.onsuccess = () => {
        value = req.result as T;
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    }, reject);
  });
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  if (!available()) return null;
  return (await run<T | undefined>(store, "readonly", (s) => s.get(key))) ?? null;
}

export async function idbPut(store: StoreName, key: string, value: unknown): Promise<void> {
  if (!available()) return;
  await run(store, "readwrite", (s) => s.put(value, key));
}

export async function idbDel(store: StoreName, key: string): Promise<void> {
  if (!available()) return;
  await run(store, "readwrite", (s) => s.delete(key));
}
