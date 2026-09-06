import "fake-indexeddb/auto";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import type { ClassicData } from "@/features/game/domain/classic-data";
import {
  classicTeams,
  rotateClassic,
  restoreClassic,
  nextClassicFixture,
} from "@/features/game/view/classic-session";
import { advanceClassic, classicFixtureSeed } from "@/features/game/view/classic-run";
import {
  clearClassic,
  saveClassic,
  loadClassicSave,
  type SavedClassic,
} from "@/features/game/storage/classic-slot";
import { idbGet, idbPut } from "@/features/game/storage/idb";
let data: ClassicData;
let initial: SavedClassic;
beforeAll(async () => {
  data = (await loadClassicData(2003))!;
  expect(data).not.toBeNull();
  const teams = classicTeams(data, 42, "4-4-2 Flat");
  initial = {
    version: 1,
    season: 2003,
    clubId: 42,
    formation: "4-4-2 Flat",
    archiveKey: data.archiveKey,
    seed: 12345,
    cardIds: teams[data.clubIds.indexOf(42)].players.map((p) => p.cardId),
    results: [],
  };
});
beforeEach(clearClassic);
it("round-trips an exact played season without touching Legacy or single-match slots", async () => {
  await idbPut("season", "current", { marker: "Legacy" });
  await idbPut("match", "current", { marker: "Single" });
  const { teams, run } = restoreClassic(data, initial);
  const results = [...advanceClassic(data.schedule, teams, run).results];
  await saveClassic({ ...initial, results });
  const loaded = (await loadClassicSave())!;
  expect(loaded.results).toEqual(results);
  expect(restoreClassic(data, loaded).teams).toEqual(teams);
  await clearClassic();
  expect(await loadClassicSave()).toBeNull();
  expect(await idbGet("season", "current")).toEqual({ marker: "Legacy" });
  expect(await idbGet("match", "current")).toEqual({ marker: "Single" });
});
it("blocks archive drift, duplicate players and foreign calendar results", () => {
  expect(() => restoreClassic({ ...data, archiveKey: "f".repeat(64) }, initial)).toThrow(
    "archive changed",
  );
  expect(() =>
    restoreClassic(data, { ...initial, cardIds: Array(11).fill(initial.cardIds[0]) }),
  ).toThrow("XI");
  expect(() =>
    restoreClassic(data, {
      ...initial,
      results: [{ fixtureId: "other", seed: 3, homeGoals: 0, awayGoals: 0 }],
    }),
  ).toThrow("calendar");
});
it("restores an away fixture with the coach's saved XI and bench", () => {
  const first = restoreClassic(data, initial);
  const saved = {
    ...initial,
    results: [...advanceClassic(data.schedule, first.teams, first.run).results],
  };
  const fixture = nextClassicFixture(data, saved)!;
  expect(fixture.coachSide).toBe("away");
  expect(fixture.setup.substitutions).toEqual({ maxSubs: 3 });
  expect(fixture.setup.away.teamId).toBe(42);
  expect(fixture.setup.away.players.map((p) => p.cardId)).toEqual(initial.cardIds);
  expect(fixture.setup.away.bench).toEqual(first.teams[data.clubIds.indexOf(42)].bench);
  expect(
    new Set([...fixture.setup.away.players, ...fixture.setup.away.bench!].map((p) => p.playerId))
      .size,
  ).toBe(11 + fixture.setup.away.bench!.length);
});
it("surfaces malformed storage instead of treating it as an empty slot", async () => {
  await idbPut("season", "classic-current", { ...initial, results: [{ homeGoals: -1 }] });
  await expect(loadClassicSave()).rejects.toThrow();
  expect(await idbGet("season", "classic-current")).not.toBeNull();
});

it("persists rotation into the next away fixture without rewriting completed scores", async () => {
  const first = restoreClassic(data, initial);
  const saved = {
    ...initial,
    results: [...advanceClassic(data.schedule, first.teams, first.run).results],
  };
  const before = structuredClone(saved);
  const own = first.teams[first.run.coach];
  const { canPlay } = await import("@/features/game/domain/eligibility");
  const replacement = own.bench!.find((p) => canPlay(p, own.formation.slots[1].role));
  expect(replacement).toBeDefined();
  const cards = [...saved.cardIds];
  cards[1] = replacement!.cardId;
  const rotated = rotateClassic(data, saved, cards);
  expect(saved).toEqual(before);
  await saveClassic(rotated);
  const loaded = (await loadClassicSave())!;
  expect(loaded.results).toEqual(before.results);
  expect(loaded.seed).toBe(before.seed);
  const fixture = nextClassicFixture(data, loaded)!;
  expect(fixture.coachSide).toBe("away");
  expect(fixture.setup.away.players.map((p) => p.cardId)).toEqual(cards);
  expect(fixture.setup.away.bench!.some((p) => p.cardId === replacement!.cardId)).toBe(false);
  const current = restoreClassic(data, loaded);
  const advanced = advanceClassic(data.schedule, current.teams, current.run);
  expect(advanced.results.slice(0, before.results.length)).toEqual(before.results);
});
it("refuses illegal rotation and cannot edit a completed season", () => {
  for (const cardIds of [
    initial.cardIds.slice(1),
    Array(11).fill(initial.cardIds[0]),
    ["foreign", ...initial.cardIds.slice(1)],
    [initial.cardIds[1], initial.cardIds[0], ...initial.cardIds.slice(2)],
  ]) {
    expect(() => rotateClassic(data, initial, cardIds)).toThrow("XI");
  }
  const complete = {
    ...initial,
    results: data.schedule.fixtures.map((f) => ({
      fixtureId: f.id,
      seed: classicFixtureSeed(initial.seed, f.id),
      homeGoals: 0,
      awayGoals: 0,
    })),
  };
  expect(() => rotateClassic(data, complete, initial.cardIds)).toThrow("complete");
});

it("persists live injuries and advances recovery on coach fixtures only, including explicit forfeits", async () => {
  const first = restoreClassic(data, initial);
  const fixture = nextClassicFixture(data, initial)!;
  const player = first.teams[first.run.coach].players[0];
  // Arsenal 2003 has no spare eligible keeper, deliberately testing the shortage policy.
  const next = advanceClassic(data.schedule, first.teams, first.run, {
    fixtureId: fixture.id,
    homeGoals: 4,
    awayGoals: 1,
    events: [
      {
        kind: "injury",
        minute: 20,
        side: fixture.coachSide,
        playerId: player.playerId,
        injurySeverity: "severe",
      },
    ],
  });
  expect(next.injuries).toEqual([{ cardId: player.cardId, remaining: 3 }]);
  let saved: SavedClassic = { ...initial, results: [...next.results], injuries: next.injuries };
  await saveClassic(saved);
  saved = (await loadClassicSave())!;
  expect(nextClassicFixture(data, saved)).toBeNull();
  for (let remaining = 2; remaining >= 0; remaining--) {
    const current = restoreClassic(data, saved);
    expect(current.unavailable).toBe(true);
    expect(() => advanceClassic(data.schedule, current.teams, current.run)).toThrow("XI");
    const advanced = advanceClassic(data.schedule, current.teams, current.run, undefined, true);
    expect(advanced.results.slice(0, saved.results.length)).toEqual(saved.results);
    expect(advanced.injuries).toEqual(remaining ? [{ cardId: player.cardId, remaining }] : []);
    saved = { ...saved, results: [...advanced.results], injuries: advanced.injuries };
    await saveClassic(saved);
    saved = (await loadClassicSave())!;
  }
  expect(nextClassicFixture(data, saved)).not.toBeNull();
  expect(saved.results.slice(0, next.results.length)).toEqual(next.results);
});
it("rejects corrupt saved availability without clearing the Classic slot", async () => {
  await idbPut("season", "classic-current", {
    ...initial,
    injuries: [{ cardId: initial.cardIds[0], remaining: -1 }],
  });
  await expect(loadClassicSave()).rejects.toThrow();
  expect(await idbGet("season", "classic-current")).not.toBeNull();
  expect(() =>
    restoreClassic(data, { ...initial, injuries: [{ cardId: "foreign", remaining: 1 }] }),
  ).toThrow("injuries");
});

it("finishes a full Classic season with injury recovery without rewriting earlier results", () => {
  let saved: SavedClassic = initial;
  for (let fixture = 0; fixture < 38; fixture++) {
    const current = restoreClassic(data, saved);
    const next = advanceClassic(
      data.schedule,
      current.teams,
      current.run,
      undefined,
      current.unavailable,
    );
    expect(next.results.slice(0, saved.results.length)).toEqual(saved.results);
    saved = { ...saved, results: [...next.results], injuries: next.injuries };
  }
  expect(saved.results).toHaveLength(data.schedule.fixtures.length);
  expect(nextClassicFixture(data, saved)).toBeNull();
});
