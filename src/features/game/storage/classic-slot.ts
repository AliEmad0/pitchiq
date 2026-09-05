import { z } from "zod";
import { idbDel, idbGet, idbPut } from "./idb";
const key = "classic-current";
const score = z.number().int().nonnegative();
const schema = z.object({
  version: z.literal(1),
  season: z.number().int().min(1992).max(2025),
  clubId: z.number().int().positive(),
  formation: z.string().min(1),
  cardIds: z.array(z.string()).length(11),
  seed: z.number().int().min(0).max(4294967295),
  archiveKey: z.string().regex(/^[a-f0-9]{64}$/),
  results: z
    .array(
      z.object({
        fixtureId: z.string().min(1),
        seed: z.number().int().min(0).max(4294967295),
        homeGoals: score,
        awayGoals: score,
      }),
    )
    .max(462),
});
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
