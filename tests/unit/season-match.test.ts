import { describe, expect, it } from "vitest";
import {
  buildFixtureSession,
  finishSeasonWeek,
  seasonFixture,
} from "@/features/game/view/season-match";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import { fixtureSeed, seasonFixtures } from "@/features/game/domain/season";
import { simulate } from "@/features/game/domain/simulate";
import { seasonSetup } from "./_helpers/season";

describe("played season fixtures", () => {
  it("preserves exact teams, bench, home advantage and seed for both coach sides", () => {
    const { teams, run: initial } = seasonSetup();
    let run = initial;
    const sides = new Set<string>();
    for (let week = 0; week < 2; week++) {
      const fixture = seasonFixture(run, teams)!;
      sides.add(fixture.coachSide);
      expect(fixture.setup[fixture.coachSide]).toBe(teams[0]);
      const session = buildFixtureSession(fixture);
      expect(session.home).toBe(fixture.setup.home);
      expect(session.away).toBe(fixture.setup.away);
      let step = session.stream.advance();
      let decisions = 0;
      while (step.kind !== "done") {
        expect(step.decision.side).toBe(fixture.coachSide);
        decisions++;
        step = session.stream.answer(defaultAnswer(step.decision));
      }
      expect(decisions).toBeGreaterThan(0);
      expect(step.result).toEqual(simulate(fixture.setup));
      run = finishSeasonWeek(run, teams, step.result);
    }
    expect([...sides].sort()).toEqual(["away", "home"]);
  });

  it("uses the played score and simulates every other fixture exactly once", () => {
    const { teams, run } = seasonSetup();
    const fixture = seasonFixture(run, teams)!;
    const played = { seed: fixture.setup.seed, score: { home: 7, away: 2 }, events: [] };
    const finished = finishSeasonWeek(run, teams, played);
    expect(run.results).toEqual([]);
    expect(finished.results).toHaveLength(2);
    const [h, a] = seasonFixtures(4)[0]![1]!;
    const other = simulate({
      home: teams[h]!,
      away: teams[a]!,
      seed: fixtureSeed(run.seed, 0, 1),
      targetGoalsPerMatch: 2.7,
    });
    expect(finished.results[0]).toMatchObject({ homeGoals: 7, awayGoals: 2, seed: played.seed });
    expect(finished.results[1]).toMatchObject({
      home: h,
      away: a,
      homeGoals: other.score.home,
      awayGoals: other.score.away,
    });
    expect(() => finishSeasonWeek(finished, teams, played)).toThrow("Result does not belong");
  });
});
