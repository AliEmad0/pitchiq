const DB_NAME = "pitchiq-game";
export const DB_VERSION = 9;

/**
 * Every object store in the database.
 *
 * ⚠️ Later tickets add their own — TASK-1813 achievements, TASK-1819 collections. Add the
 * name here and bump `DB_VERSION`; the upgrade handler creates stores idempotently by
 * name, so it never assumes a single fixed schema and an existing database gains the new
 * store rather than being rebuilt.
 *
 * TASK-1817 added `daily` exactly that way, taking the database to v2.
 * `game-daily-slot.test.ts` holds the test that proves an existing `match` record survived
 * the upgrade — the claim above was an assertion until then.
 *
 * TASK-1811 added `season` the same way, taking it to v3, and `season-slot.test.ts` proves the
 * survival claim again rather than inheriting it.
 *
 * TASK-1816 added `whatIf` (best result per scenario), taking it to v4. `what-if-slot.test.ts`
 * opens a REAL v3 database first and then upgrades it — the earlier tests wrote and read at
 * the current version, so they never exercised an upgrade at all.
 */
const STORES = [
  "match",
  "daily",
  "season",
  "whatIf",
  "album",
  "trophies",
  "trophyLog",
  "weekly",
  "profile",
  "badges",
  "market",
  // TASK-1812 — the career log behind the Records page (v9).
  "career",
] as const;
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

/**
 * Insert a value only if the key is new — true if it was inserted, false if it already
 * existed. Atomic: the store itself refuses the duplicate (TASK-1813's once-only writes).
 */
export async function idbAdd(store: StoreName, key: string, value: unknown): Promise<boolean> {
  if (!available()) return false;
  try {
    await run(store, "readwrite", (s) => s.add(value, key));
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "ConstraintError") return false;
    throw e;
  }
}

/**
 * Read-modify-write several keys in ONE readwrite transaction (TASK-1819).
 *
 * ⛔ Not a get-then-put across two transactions: readwrite transactions on one store run one
 * after another, so concurrent callers (a bulk sim fires one record per fixture without
 * awaiting) each see the previous caller's write instead of overwriting it with a stale read.
 */
export async function idbUpdateMany<T>(
  store: StoreName,
  updates: readonly { key: string; update: (old: T | undefined) => T }[],
): Promise<void> {
  if (!available() || updates.length === 0) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    for (const { key, update } of updates) {
      const req = s.get(key);
      req.onsuccess = () => {
        s.put(update(req.result as T | undefined), key);
      };
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function idbDel(store: StoreName, key: string): Promise<void> {
  if (!available()) return;
  await run(store, "readwrite", (s) => s.delete(key));
}

/**
 * Every value in a store.
 *
 * Used for the daily history, where streaks are DERIVED from the full record list rather
 * than read from a stored counter that could drift away from it.
 */
export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  if (!available()) return [];
  return (await run<T[] | undefined>(store, "readonly", (s) => s.getAll())) ?? [];
}

/**
 * TASK-1829 — spend from one store and write to another in ONE readwrite transaction.
 *
 * ⛔ Crafting must be atomic: spending duplicates in one transaction and minting the badge in a
 * second would let a crash or a double-click spend the cards and mint nothing, or mint twice.
 * `spend` returns the new value, or `null` to refuse — a refusal aborts the whole transaction, so
 * nothing is written. Resolves true when both writes landed.
 */
export async function idbSpendAndPut<T>(
  spend: { store: StoreName; key: string; update: (old: T | undefined) => T | null },
  put: { store: StoreName; key: string; value: unknown; ifAbsent?: boolean },
): Promise<boolean> {
  if (!available()) return false;
  const db = await open();
  return await new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction([spend.store, put.store], "readwrite");
    let refused = false;
    const from = tx.objectStore(spend.store);
    const to = tx.objectStore(put.store);
    const doSpend = () => {
      const req = from.get(spend.key);
      req.onsuccess = () => {
        const next = spend.update(req.result as T | undefined);
        if (next == null) {
          refused = true;
          tx.abort();
          return;
        }
        from.put(next, spend.key);
        to.put(put.value, put.key);
      };
    };
    if (put.ifAbsent === true) {
      const has = to.get(put.key);
      has.onsuccess = () => {
        if (has.result !== undefined) {
          refused = true;
          tx.abort();
        } else doSpend();
      };
    } else doSpend();
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onabort = () => {
      db.close();
      if (refused) resolve(false);
      else reject(tx.error);
    };
  });
}
