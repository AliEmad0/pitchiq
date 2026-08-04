import { describe, expect, it } from "vitest";
import type { MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";

function team(name: string, ids: number[]) {
  const slots = ids.map((_, i) => ({ row: 1, col: i + 1, role: "CF" as const }));
  const players: GamePlayer[] = ids.map((id) => ({
    cardId: `${id}@2020`, playerId: id, season: 2020, name: `P${id}`, role: "CF", altRoles: [],
    foot: null, height: null, provenance: null,
    ratings: { attack: 60, creation: 50, defense: 40, physical: 50, discipline: 55, overall: 55 },
  }));
  return makeGameTeam(1, name, 2020, { name: "4-4-2", season: 2020, slots }, players);
}
const home = team("Arsenal", [10, 11]);
const away = team("United", [20, 21]);
const result: MatchResult = {
  seed: 5,
  score: { home: 1, away: 0 },
  events: [
    { minute: 0, kind: "kickoff" },
    { minute: 30, kind: "goal", side: "home", playerId: 11 },
    { minute: 90, kind: "fulltime" },
  ],
};

describe("buildMatchViewModel", () => {
  const vm = buildMatchViewModel(home, away, result);
  it("carries names, abbreviations and formation slots", () => {
    expect(vm.home.name).toBe("Arsenal");
    expect(vm.home.abbr).toBe("ARS");
    expect(vm.home.slots).toHaveLength(2);
  });
  it("attaches a commentary ref and the scorer slot to a goal event", () => {
    const goal = vm.events.find((e) => e.kind === "goal")!;
    expect(goal.commentary.key).toMatch(/^commentary\.goal\./);
    expect(goal.scorerSlot).toBe(1); // player 11 is slots index 1
  });
  it("exposes team power and the final score", () => {
    expect(vm.homePower.attack).toBeGreaterThan(0);
    expect(vm.finalScore).toEqual({ home: 1, away: 0 });
  });
});
