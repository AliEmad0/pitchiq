import { describe, expect, it } from "vitest";
import { loadClassicSquads } from "@/features/game/adapter/classic-squads";
import { classicLineup } from "@/features/game/domain/classic-lineup";
import { formationByName } from "@/features/game/domain/formation";
import { canPlay } from "@/features/game/domain/eligibility";

describe("Classic season squad coverage", () => {
  it.each(Array.from({ length: 34 }, (_, i) => 1992 + i))(
    "audits %i without cross-era or ineligible fills",
    async (season) => {
      const clubs = await loadClassicSquads(season);
      expect(clubs).not.toBeNull();
      expect(clubs).toHaveLength(season <= 1994 ? 22 : 20);
      const gaps: string[] = [];
      for (const club of clubs!) {
        expect(club.pool.length).toBeGreaterThanOrEqual(11);
        expect(club.pool.every((p) => p.season === season && p.teamId === club.teamId)).toBe(true);
        if (!club.formations.length) gaps.push(club.name);
        for (const name of club.formations) {
          const shape = formationByName(name);
          const xi = classicLineup(club.pool, shape)!;
          expect(xi).toHaveLength(11);
          expect(new Set(xi.map((p) => p.playerId)).size).toBe(11);
          expect(xi.every((p, i) => canPlay(p, shape.slots[i].role))).toBe(true);
        }
      }
      expect(gaps).toEqual([]);
      console.log(
        JSON.stringify({
          season,
          clubs: clubs!.length,
          gaps,
          bytes: Buffer.byteLength(JSON.stringify(clubs)),
          minFormations: Math.min(...clubs!.map((c) => c.formations.length)),
        }),
      );
    },
  );
});
