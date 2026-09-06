import { expect, it } from "vitest";
import {
  availableSeasonTeam,
  carryInjuries,
  reservePlayers,
  rotateSeasonTeam,
  validateInjuries,
} from "@/features/game/domain/season-availability";
import {
  finishSeasonWeek,
  seasonFixture,
  simulateSeasonWeek,
} from "@/features/game/view/season-match";
import { seasonSetup } from "./_helpers/season";
import type { MatchEvent } from "@/features/game/domain/match-types";
it("counts future coach fixtures, scopes matching player IDs by side, and never mutates prior injuries", () => {
  const { teams } = seasonSetup();
  const own = teams[0];
  const player = own.players[1];
  const event: MatchEvent = {
    kind: "injury",
    minute: 30,
    side: "home",
    playerId: player.playerId,
    injurySeverity: "severe",
  };
  expect(carryInjuries([], [event], "away", own)).toEqual([]);
  const injured = carryInjuries([], [event, event], "home", own);
  expect(injured).toEqual([{ cardId: player.cardId, remaining: 3 }]);
  const two = carryInjuries(injured, [], "home", own);
  expect(two[0].remaining).toBe(2);
  expect(injured[0].remaining).toBe(3);
  expect(carryInjuries(carryInjuries(two, [], "home", own), [], "home", own)).toEqual([]);
  expect(carryInjuries([], [{ ...event, injurySeverity: "knock" }], "home", own)).toEqual([]);
  expect(
    carryInjuries([], [{ ...event, injurySeverity: "moderate" }], "home", own)[0].remaining,
  ).toBe(1);
});
it("available cover excludes injuries from both XI and bench; rotation cannot smuggle an injured player back", () => {
  const { props, teams } = seasonSetup();
  const own = teams[0];
  const pool = props.pools[1];
  const covered = { ...own, bench: reservePlayers(pool, own.players) };
  const injured = [{ cardId: own.players[0].cardId, remaining: 1 }];
  const available = availableSeasonTeam(covered, injured)!;
  expect(available).not.toBeNull();
  expect(
    [...available.players, ...available.bench!].some((p) => p.cardId === injured[0].cardId),
  ).toBe(false);
  expect(() =>
    rotateSeasonTeam(
      covered,
      pool,
      own.players.map((p) => p.cardId),
      injured,
    ),
  ).toThrow("XI");
  expect(() => validateInjuries([{ cardId: "foreign", remaining: 1 }], pool)).toThrow();
  expect(() =>
    validateInjuries([{ cardId: own.players[0].cardId, remaining: -1 }], pool),
  ).toThrow();
});
it("captures live injury outcomes with scores and preserves completed weeks during recovery", () => {
  const { teams, run } = seasonSetup();
  const fixture = seasonFixture(run, teams)!;
  const own = fixture.setup[fixture.coachSide];
  const injured = finishSeasonWeek(run, teams, {
    seed: fixture.setup.seed,
    score: { home: 7, away: 2 },
    events: [
      {
        kind: "injury",
        minute: 40,
        side: fixture.coachSide,
        playerId: own.players[1].playerId,
        injurySeverity: "moderate",
      },
    ],
  });
  expect(injured.injuries).toEqual([{ cardId: own.players[1].cardId, remaining: 1 }]);
  expect(injured.results[0]).toMatchObject({ homeGoals: 7, awayGoals: 2 });
  expect(seasonFixture(injured, teams)).toBeNull(); // XI-only old roster has no cover.
  expect(() => simulateSeasonWeek(injured, teams)).toThrow("XI");
  const recovered = simulateSeasonWeek(injured, teams, true);
  expect(recovered.results.slice(0, injured.results.length)).toEqual(injured.results);
  expect(recovered.injuries).toEqual([]);
  const forfeited = recovered.results.find((r) => r.week === 1 && (r.home === 0 || r.away === 0))!;
  expect(
    forfeited.home === 0
      ? [forfeited.homeGoals, forfeited.awayGoals]
      : [forfeited.awayGoals, forfeited.homeGoals],
  ).toEqual([0, 3]);
  expect(seasonFixture(recovered, teams)).not.toBeNull();
});
it("auto simulation captures its own injury events rather than replaying historical results", async () => {
  const { simulate } = await import("@/features/game/domain/simulate");
  const { teams, run } = seasonSetup();
  let found = false;
  for (let seed = 0; seed < 100; seed++) {
    const current = { ...run, seed };
    const fixture = seasonFixture(current, teams)!;
    const result = simulate(fixture.setup);
    const expected = carryInjuries(
      [],
      result.events,
      fixture.coachSide,
      fixture.setup[fixture.coachSide],
    );
    if (!expected.length) continue;
    expect(simulateSeasonWeek(current, teams).injuries).toEqual(expected);
    found = true;
    break;
  }
  expect(found).toBe(true);
});

it("an all-time pool reserves only one goalkeeper and keeps outfield cover", () => {
  const { props, teams } = seasonSetup();
  const own = teams[0];
  const keeper = own.players[0];
  const extra = Array.from({ length: 10 }, (_, i) => ({
    ...keeper,
    playerId: 9000 + i,
    cardId: `${9000 + i}@2020` as const,
  }));
  const bench = reservePlayers([...props.pools[1], ...extra], own.players);
  expect(bench).toHaveLength(7);
  expect(bench.filter((p) => p.role === "GK")).toHaveLength(1);
  expect(bench.some((p) => p.role !== "GK")).toBe(true);
});
