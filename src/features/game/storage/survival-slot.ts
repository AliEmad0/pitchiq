import { z } from "zod";
import { historicalSaveSchema } from "./historical-schema";
import { idbDel, idbGet, idbPut } from "./idb";
const key = "survival-current";
const schema = historicalSaveSchema.extend({
  scenario: z.object({
    coach: z.number().int().nonnegative(),
    start: z.number().int().positive(),
    targetPoints: z.number().int().positive(),
    relegated: z.number().int().positive(),
  }),
});
export type SavedSurvival = z.infer<typeof schema>;
function requireStorage() {
  if (typeof indexedDB === "undefined") throw new Error("Storage unavailable");
}
export async function loadSurvivalSave(): Promise<SavedSurvival | null> {
  requireStorage();
  const raw = await idbGet<unknown>("season", key);
  return raw == null ? null : schema.parse(raw);
}
export async function saveSurvival(value: SavedSurvival) {
  requireStorage();
  await idbPut("season", key, schema.parse(value));
}
export async function clearSurvival() {
  requireStorage();
  await idbDel("season", key);
}
