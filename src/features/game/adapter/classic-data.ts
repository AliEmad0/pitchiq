import "server-only";
import { createHash } from "node:crypto";
import type { ClassicData } from "../domain/classic-data";
import { loadClassicSeason } from "./classic-season";
import { loadClassicSquads } from "./classic-squads";
export async function loadClassicData(season: number): Promise<ClassicData | null> {
  const [archive, squads] = await Promise.all([
    loadClassicSeason(season),
    loadClassicSquads(season),
  ]);
  if (
    !archive ||
    !squads ||
    squads.length !== archive.clubIds.length ||
    squads.some((s, i) => s.teamId !== archive.clubIds[i] || s.formations.length === 0)
  )
    return null;
  const payload = { ...archive, squads };
  // Build-time fingerprint covers schedule, club ordering, player ratings and supported shapes.
  // A changed archive must not silently rebuild a saved team under immutable results.
  return {
    ...payload,
    archiveKey: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}
