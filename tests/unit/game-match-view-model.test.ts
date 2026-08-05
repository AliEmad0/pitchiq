import { describe, expect, it } from "vitest";
import type { MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";

function team(name: string, ids: number[]) {
  const slots = ids.map((_, i) => ({ row: 1, col: i + 1, role: "CF" as const }));
  const players: GamePlayer[] = ids.map((id) => ({
    cardId: `${id}@2020`,
    playerId: id,
    season: 2020,
    name: `First P${id}`,
    role: "CF",
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 60, creation: 50, defense: 40, physical: 50, discipline: 55, overall: 55 },
  }));
  return makeGameTeam(1, name, 2020, { name: "4-4-2", season: 2020, slots }, players);
}
const home = team("Arsenal", [10, 11]);
const away = team("Manchester United", [20, 21]);
const result: MatchResult = {
  seed: 5,
  score: { home: 1, away: 0 },
  events: [
    { minute: 0, kind: "kickoff" },
    { minute: 30, kind: "goal", side: "home", playerId: 11 },
    { minute: 60, kind: "card", side: "away", playerId: 20, card: "red" },
    { minute: 90, kind: "fulltime" },
  ],
};

describe("buildMatchViewModel", () => {
  const vm = buildMatchViewModel(home, away, result);
  it("carries names and a placed XI", () => {
    expect(vm.home.name).toBe("Arsenal");
    expect(vm.home.abbr).toBe("ARS");
    expect(vm.home.players).toHaveLength(2);
  });
  it("uses a real club abbreviation over the naive first-three", () => {
    expect(vm.away.abbr).toBe("MUN");
  });
  it("enriches each placed player with name, number and rating", () => {
    const p = vm.home.players[0];
    expect(p.name).toBe("First P10");
    expect(p.number).toBeGreaterThan(0);
    expect(p.rating).toBe(55);
    expect(p.row).toBe(1);
  });
  it("attaches a commentary ref, scorer slot and attack zone to a goal", () => {
    const goal = vm.events.find((e) => e.kind === "goal")!;
    expect(goal.commentary.key).toMatch(/^commentary\.goal\./);
    expect(goal.scorerSlot).toBe(1); // player 11 is slots index 1
    expect(goal.zone).toEqual({ side: "home", lane: expect.any(String) });
  });
  it("attaches the booked slot to a card event", () => {
    const card = vm.events.find((e) => e.kind === "card")!;
    expect(card.bookedSlot).toBe(0); // away player 20 is slots index 0
    expect(card.zone).toBeUndefined();
  });
  it("exposes team power and the final score", () => {
    expect(vm.homePower.attack).toBeGreaterThan(0);
    expect(vm.finalScore).toEqual({ home: 1, away: 0 });
  });
});
