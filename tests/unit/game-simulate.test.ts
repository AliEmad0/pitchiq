import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { MatchSetup } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";

function xi(base: Partial<PlayerRatings>): GamePlayer[] {
  const roles: PlayerRole[] = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "CF"];
  return roles.map((role, i) => ({
    cardId: `${i}@2020`, playerId: i, season: 2020, name: `P${i}`, role, altRoles: [],
    foot: null, height: null, provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50, ...base },
  }));
}
const team = (name: string, base: Partial<PlayerRatings>) =>
  makeGameTeam(1, name, 2020, { name: "", season: 2020, slots: [] }, xi(base));
const setup = (seed: number, over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: team("H", {}), away: team("A", {}), seed, targetGoalsPerMatch: 2.7, ...over,
});

describe("simulate", () => {
  it("is byte-reproducible for the same seed", () => {
    expect(simulate(setup(42))).toEqual(simulate(setup(42)));
  });

  it("diverges for different seeds", () => {
    expect(JSON.stringify(simulate(setup(1)))).not.toBe(JSON.stringify(simulate(setup(999))));
  });

  it("emits well-formed events (kickoff first, fulltime last, goals sum to score)", () => {
    const r = simulate(setup(7));
    expect(r.events[0].kind).toBe("kickoff");
    expect(r.events[r.events.length - 1].kind).toBe("fulltime");
    const homeGoals = r.events.filter((e) => e.kind === "goal" && e.side === "home").length;
    expect(homeGoals).toBe(r.score.home);
  });

  it("a far stronger team wins the majority of the time", () => {
    let strongWins = 0;
    for (let s = 0; s < 60; s++) {
      const r = simulate(
        setup(s, {
          home: team("Strong", { attack: 95, creation: 90, defense: 90, physical: 90 }),
          away: team("Weak", { attack: 20, creation: 20, defense: 20, physical: 20 }),
        }),
      );
      if (r.score.home > r.score.away) strongWins++;
    }
    expect(strongWins).toBeGreaterThan(40); // > 2/3
  });

  it("scores near the season-authentic target across many seeds", () => {
    let total = 0;
    const N = 300;
    for (let s = 0; s < N; s++) {
      const r = simulate(setup(s));
      total += r.score.home + r.score.away;
    }
    const mean = total / N;
    expect(mean).toBeGreaterThan(2.7 - 0.9);
    expect(mean).toBeLessThan(2.7 + 0.9);
  });

  it("simulates a full match in under 100ms", () => {
    const s = setup(3);
    const t0 = performance.now();
    simulate(s);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
