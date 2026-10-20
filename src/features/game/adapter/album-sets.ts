import "server-only";
import type { AlbumSeason } from "@/features/game/domain/album";
import { loadClassicData } from "./classic-data";

/**
 * TASK-1819 — a season's album sets, built from the Classic pool at BUILD time and served as
 * one static JSON file per season (`/api/game/album/[season]`).
 *
 * ⚠️ Only what a sticker shows: id, name, role, OVR. The full pool cards carry bios and stats
 * the album never reads, and every byte here is a prerendered file per season.
 */
export async function albumSeason(season: number): Promise<AlbumSeason | null> {
  const data = await loadClassicData(season);
  if (data == null) return null;
  return {
    season,
    clubs: data.squads.map((club) => ({
      teamId: club.teamId,
      name: club.name,
      cards: club.pool
        .map((p) => ({ id: p.cardId, n: p.name, r: p.role ?? "", o: p.ratings?.overall ?? 0 }))
        .sort((a, b) => b.o - a.o || a.n.localeCompare(b.n)),
    })),
  };
}
