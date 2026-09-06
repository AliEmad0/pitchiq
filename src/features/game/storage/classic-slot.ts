import { z } from "zod";
import { historicalSaveSchema as schema } from "./historical-schema";
import { idbDel, idbGet, idbPut } from "./idb";
const key = "classic-current";
export type SavedClassic = z.infer<typeof schema>;
const requireStorage = () => {
  if (typeof indexedDB === "undefined") throw new Error("Storage unavailable");
};
export async function loadClassicSave(): Promise<SavedClassic | null> {
  requireStorage();
  const raw = await idbGet<unknown>("season", key);
  return raw == null ? null : schema.parse(raw);
}
export async function saveClassic(run: SavedClassic): Promise<void> {
  requireStorage();
  await idbPut("season", key, schema.parse(run));
}
export async function clearClassic(): Promise<void> {
  requireStorage();
  await idbDel("season", key);
}
