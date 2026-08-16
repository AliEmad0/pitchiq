import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GoalAttributionSchema } from "../../src/data/schemas";
import type { GoalAttribution, Player } from "../../src/data/schemas";
import { opponentSpreadRule } from "../../src/features/trivia/rules/opponent-spread";
import { favouriteOpponentRule } from "../../src/features/trivia/rules/favourite-opponent";
import { multiGoalGamesRule } from "../../src/features/trivia/rules/multi-goal-games";
import type { TriviaData } from "../../src/features/trivia/types";
import { TRIVIA_DEFAULTS } from "./_helpers/trivia";

async function committedMap(): Promise<GoalAttribution> {
  const raw = JSON.parse(
    await readFile(join(process.cwd(), "data", "player-goal-attribution.json"), "utf8"),
  );
  return GoalAttributionSchema.parse(raw);
}

// Validates the committed artifact + structural invariants. Range-based so a
// data re-sync doesn't break it (TASK-M26).
describe("player-goal-attribution.json (committed)", () => {
  it("is schema-valid with sane invariants", async () => {
    const map = await committedMap();

    const ids = Object.keys(map.players);
    expect(ids.length).toBeGreaterThan(500);

    let maxSpread = 0;
    for (const e of Object.values(map.players)) {
      // every opponent tally is positive
      for (const g of Object.values(e.opponents)) expect(g).toBeGreaterThan(0);
      // a hat-trick game is also a multi-goal game
      expect(e.multiGoalGames).toBeGreaterThanOrEqual(e.hatTricks);
      maxSpread = Math.max(maxSpread, Object.keys(e.opponents).length);
    }
    // 34 seasons of strikers guarantee at least one wide spread.
    expect(maxSpread).toBeGreaterThanOrEqual(20);
  });

  it("the R11/R12/R13 rules fire on the real map for a prolific striker (Drogba 1002187)", async () => {
    const map = await committedMap();
    // A minimal squad so playerName resolves; goalAttribution returns the real map.
    const players = [{ id: 1002187, name: "Didier Drogba" } as Player];
    const data: TriviaData = {
      ...TRIVIA_DEFAULTS,
      season: 2010,
      standings: async () => null,
      players: async () => players,
      fixtures: async () => null,
      leaderboards: async () => null,
      seasons: async () => [2010],
      goalAttribution: async () => map,
      managers: async () => null,
      fixtureExtras: async () => null,
    };
    const ctx = { scope: "player" as const, id: 1002187 };

    const spread = await opponentSpreadRule.run(data, ctx);
    expect(spread?.text).toMatch(/Didier Drogba has scored against \d+ different Premier League/);
    expect(await spread!.verify(data)).toBe(true);

    const fave = await favouriteOpponentRule.run(data, ctx);
    expect(fave?.text).toMatch(/Didier Drogba's favourite opponent is .+ — \d+ goals/);
    expect(await fave!.verify(data)).toBe(true);

    const multi = await multiGoalGamesRule.run(data, ctx);
    expect(multi?.text).toMatch(/Didier Drogba has scored \d+ Premier League hat-trick/);
    expect(await multi!.verify(data)).toBe(true);
  });
});
