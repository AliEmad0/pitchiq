import type { Page } from "@playwright/test";
/** Read/write only the test browser's season slot, awaiting transaction completion. */
export async function seasonSave<T>(page: Page, key: string, value?: T): Promise<T> {
  return page.evaluate(
    ({ key, value }) =>
      new Promise<T>((resolve, reject) => {
        const request = indexedDB.open("pitchiq-game", 3);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("season", value === undefined ? "readonly" : "readwrite");
          const operation =
            value === undefined
              ? tx.objectStore("season").get(key)
              : tx.objectStore("season").put(value, key);
          let result: T;
          operation.onsuccess = () => {
            result = operation.result;
          };
          tx.oncomplete = () => {
            db.close();
            resolve(result);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { key, value },
  );
}
