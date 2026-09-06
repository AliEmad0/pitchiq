import "fake-indexeddb/auto";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import type { ClassicData } from "@/features/game/domain/classic-data";
import { classicTeams } from "@/features/game/view/classic-session";
import {
  scenarioFor,
  survivalCandidates,
  restoreSurvival,
  nextSurvivalFixture,
  rotateSurvival,
} from "@/features/game/view/survival-session";
import { advanceSurvival } from "@/features/game/view/survival-run";
import { survivalProgress } from "@/features/game/domain/survival";
import {
  clearSurvival,
  saveSurvival,
  loadSurvivalSave,
  type SavedSurvival,
} from "@/features/game/storage/survival-slot";
import { idbGet, idbPut } from "@/features/game/storage/idb";
let data: ClassicData, initial: SavedSurvival;
beforeAll(async () => {
  data = (await loadClassicData(2003))!;
  const clubId = survivalCandidates(data)[0],
    club = data.squads.find((c) => c.teamId === clubId)!;
  const formation = club.formations[0],
    scenario = scenarioFor(data, clubId);
  const own = classicTeams(data, clubId, formation)[scenario.coach];
  initial = {
    version: 1,
    season: data.season,
    clubId,
    formation,
    scenario,
    archiveKey: data.archiveKey,
    seed: 1811,
    cardIds: own.players.map((p) => p.cardId),
    results: [],
  };
});
beforeEach(clearSurvival);
it("saves only the campaign suffix and leaves other campaigns intact", async () => {
  await idbPut("season", "classic-current", { marker: "Classic" });
  await idbPut("season", "current", { marker: "Legacy" });
  await idbPut("match", "current", { marker: "Match" });
  const p = restoreSurvival(data, initial),
    next = advanceSurvival(data.schedule, p.teams, p.run);
  await saveSurvival({ ...initial, results: [...next.results], injuries: next.injuries });
  const loaded = (await loadSurvivalSave())!;
  expect(loaded.results[0].fixtureId).toBe(data.schedule.fixtures[initial.scenario.start].id);
  expect(restoreSurvival(data, loaded).run).toEqual(next);
  expect(survivalProgress(data.schedule, initial.scenario, loaded.results).own.played).toBe(
    survivalProgress(data.schedule, initial.scenario, []).own.played + 1,
  );
  await clearSurvival();
  expect(await loadSurvivalSave()).toBeNull();
  for (const [store, key, marker] of [
    ["season", "classic-current", "Classic"],
    ["season", "current", "Legacy"],
    ["match", "current", "Match"],
  ] as const)
    expect(await idbGet(store, key)).toEqual({ marker });
});
it("rejects drift in objective, archive, seed, roster and calendar", () => {
  expect(() =>
    restoreSurvival(data, {
      ...initial,
      scenario: { ...initial.scenario, start: initial.scenario.start + 1 },
    }),
  ).toThrow("objective changed");
  expect(() => restoreSurvival({ ...data, archiveKey: "f".repeat(64) }, initial)).toThrow(
    "archive changed",
  );
  expect(() =>
    restoreSurvival(data, { ...initial, cardIds: Array(11).fill(initial.cardIds[0]) }),
  ).toThrow("XI");
  const p = restoreSurvival(data, initial),
    result = advanceSurvival(data.schedule, p.teams, p.run).results[0];
  expect(() =>
    restoreSurvival(data, { ...initial, results: [{ ...result, seed: (result.seed + 1) >>> 0 }] }),
  ).toThrow("calendar changed");
  expect(() =>
    restoreSurvival(data, {
      ...initial,
      results: [{ ...result, fixtureId: data.schedule.fixtures[0].id }],
    }),
  ).toThrow("prefix");
});
it("uses the saved XI in live play and carries coach injuries exactly once", () => {
  const fixture = nextSurvivalFixture(data, initial)!;
  expect(fixture).not.toBeNull();
  const side = fixture.coachSide,
    player = fixture.setup[side].players[1];
  const p = restoreSurvival(data, initial);
  const next = advanceSurvival(data.schedule, p.teams, p.run, {
    fixtureId: fixture.id,
    homeGoals: 2,
    awayGoals: 1,
    events: [
      { kind: "injury", minute: 30, side, playerId: player.playerId, injurySeverity: "severe" },
    ],
  });
  const saved = { ...initial, results: [...next.results], injuries: next.injuries };
  expect(saved.injuries).toContainEqual({ cardId: player.cardId, remaining: 3 });
  const restored = restoreSurvival(data, saved);
  expect(restored.teams[restored.run.coach].players.some((p) => p.cardId === player.cardId)).toBe(
    false,
  );
  expect(() => rotateSurvival(data, saved, initial.cardIds)).toThrow();
  expect(() =>
    advanceSurvival(data.schedule, p.teams, next, {
      fixtureId: fixture.id,
      homeGoals: 2,
      awayGoals: 1,
    }),
  ).toThrow();
  const recovered = advanceSurvival(data.schedule, restored.teams, restored.run);
  expect(recovered.injuries?.find((i) => i.cardId === player.cardId)?.remaining).toBe(2);
});
it("finishes a resumed campaign without rewriting the baseline", () => {
  const baseline = JSON.stringify(data.schedule.fixtures.slice(0, initial.scenario.start));
  let saved = initial;
  for (let i = 0; i < 45; i++) {
    const p = restoreSurvival(data, saved);
    if (survivalProgress(data.schedule, saved.scenario, saved.results).complete) break;
    const next = advanceSurvival(data.schedule, p.teams, p.run, undefined, p.unavailable);
    saved = JSON.parse(
      JSON.stringify({ ...saved, results: next.results, injuries: next.injuries }),
    );
  }
  expect(survivalProgress(data.schedule, saved.scenario, saved.results).complete).toBe(true);
  expect(nextSurvivalFixture(data, saved)).toBeNull();
  expect(() => rotateSurvival(data, saved, saved.cardIds)).toThrow("complete");
  expect(JSON.stringify(data.schedule.fixtures.slice(0, initial.scenario.start))).toBe(baseline);
});
it("does not invent deduction timing and handles the four relegation places of 1994/95", async () => {
  expect(
    survivalCandidates({
      ...data,
      table: data.table.map((r, i) => ({ ...r, pointsAdjustment: i === 0 ? -3 : 0 })),
    }),
  ).toEqual([]);
  const old = (await loadClassicData(1994))!;
  expect(scenarioFor(old, survivalCandidates(old)[0]).relegated).toBe(4);
});

it("requires an explicit forfeit when no healthy XI exists", () => {
  const injuries = data.squads
    .find((c) => c.teamId === initial.clubId)!
    .pool.map((p) => ({ cardId: p.cardId, remaining: 1 }));
  const saved = { ...initial, injuries },
    p = restoreSurvival(data, saved);
  expect(p.unavailable).toBe(true);
  expect(nextSurvivalFixture(data, saved)).toBeNull();
  expect(() => advanceSurvival(data.schedule, p.teams, p.run)).toThrow();
  const next = advanceSurvival(data.schedule, p.teams, p.run, undefined, true);
  const fixture = data.schedule.fixtures
    .slice(initial.scenario.start)
    .find((f) => f.home === p.run.coach || f.away === p.run.coach)!;
  const result = next.results.find((r) => r.fixtureId === fixture.id)!;
  expect([result.homeGoals, result.awayGoals]).toEqual(
    fixture.home === p.run.coach ? [0, 3] : [3, 0],
  );
  expect(next.injuries).toEqual([]);
});
it("records a played away score in the correct orientation", () => {
  let saved = initial;
  for (let i = 0; i < 20; i++) {
    const fixture = nextSurvivalFixture(data, saved),
      p = restoreSurvival(data, saved);
    if (fixture?.coachSide === "away") {
      const before = survivalProgress(data.schedule, saved.scenario, saved.results).own;
      const next = advanceSurvival(data.schedule, p.teams, p.run, {
        fixtureId: fixture.id,
        homeGoals: 7,
        awayGoals: 1,
      });
      const after = survivalProgress(data.schedule, saved.scenario, next.results).own;
      expect(after.goalsFor - before.goalsFor).toBe(1);
      expect(after.goalsAgainst - before.goalsAgainst).toBe(7);
      return;
    }
    const next = advanceSurvival(data.schedule, p.teams, p.run, undefined, p.unavailable);
    saved = { ...saved, results: [...next.results], injuries: next.injuries };
  }
  throw new Error("No away fixture exercised");
});
