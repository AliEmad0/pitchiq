import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import { makeGameTeam } from "@/features/game/domain/team";
import { powerOf } from "@/features/game/domain/team-power";

function p(role: PlayerRole, r: Partial<PlayerRatings>): GamePlayer {
  return {
    cardId: "1@2020", playerId: 1, season: 2020, name: "P", role, altRoles: [],
    foot: null, height: null, provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50, ...r },
  };
}
const team = (players: GamePlayer[]) =>
  makeGameTeam(1, "T", 2020, { name: "", season: 2020, slots: [] }, players);

describe("powerOf", () => {
  it("a forward line yields high attack", () => {
    const power = powerOf(team([p("CF", { attack: 95, creation: 85 }), p("CF", { attack: 90, creation: 80 })]));
    expect(power.attack).toBeGreaterThan(75);
  });

  it("a back line yields high defense", () => {
    const power = powerOf(team([p("CB", { defense: 95, physical: 85 }), p("CB", { defense: 90, physical: 80 })]));
    expect(power.defense).toBeGreaterThan(75);
  });

  it("aggression is the inverse of mean discipline", () => {
    const power = powerOf(team([p("CM", { discipline: 20 }), p("CM", { discipline: 40 })]));
    expect(power.aggression).toBe(70); // 100 - mean(30)
  });

  it("skips players with null ratings without crashing", () => {
    const nullRated = { ...p("CF", {}), ratings: null } as GamePlayer;
    expect(() => powerOf(team([p("CF", { attack: 80 }), nullRated]))).not.toThrow();
  });

  it("returns neutral power for an empty XI", () => {
    expect(powerOf(team([]))).toEqual({ attack: 0, defense: 0, aggression: 50 });
  });
});
