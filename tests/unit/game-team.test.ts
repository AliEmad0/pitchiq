import { describe, expect, it } from "vitest";
import type { Formation } from "@/features/game/domain/formation";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";

const formation: Formation = { name: "4-4-2", season: 2003, slots: [] };
const players: GamePlayer[] = [
  {
    cardId: "1@2003", playerId: 1, season: 2003, name: "P1",
    role: "CB", altRoles: [], foot: "right", height: 180,
    ratings: null, provenance: null,
  },
];

describe("makeGameTeam", () => {
  it("assembles a game team aggregate", () => {
    const team = makeGameTeam(63, "Leeds United", 2003, formation, players);
    expect(team.teamId).toBe(63);
    expect(team.name).toBe("Leeds United");
    expect(team.season).toBe(2003);
    expect(team.formation.name).toBe("4-4-2");
    expect(team.players).toHaveLength(1);
  });
});
