import { describe, expect, it } from "vitest";
import { formationByName } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import { simulate } from "@/features/game/domain/simulate";
import { seasonTable } from "@/features/game/domain/season";
import { makeGameTeam, type GameTeam } from "@/features/game/domain/team";
import { LADDER_DAYS } from "@/features/game/domain/weekly";
import {
  closeLadderWeek,
  finishLadderDay,
  ladderComplete,
  ladderFixture,
  newLadderRun,
} from "@/features/game/view/weekly-run";
import { poolFixture } from "./_helpers/game-pool";

/** TASK-1828 — the ladder week as a run: a matchday at a time, stored, never re-derived. */
const pool = poolFixture();
const f = formationByName("4-4-2 Flat");
const xi = (offset: number) =>
  f.slots.map((s, i) => pool.filter((c) => c.role === s.role)[(offset + i) % 5]!);
const teams: GameTeam[] = Array.from({ length: 8 }, (_, i) =>
  makeGameTeam(i, `Club ${i}`, 0, f, xi(i)),
);
const RAIN = { weather: "heavy-rain" as const };

describe("a ladder matchday", () => {
  it("commits the whole day: the coach's played result plus three simulated fixtures", () => {
    const run = newLadderRun(99);
    const fx = ladderFixture(run, teams, RAIN)!;
    const played = simulate(fx.setup);
    const next = finishLadderDay(run, teams, RAIN, played);
    expect(next.results).toHaveLength(4);
    const mine = next.results.find((r) => r.home === 0 || r.away === 0)!;
    expect(fx.coachSide === "home" ? mine.homeGoals : mine.awayGoals).toBe(
      played.score[fx.coachSide],
    );
    // TASK-1826: one value line per coach fixture.
    expect(next.market).toHaveLength(1);
    expect(next.market![0]!.on.length).toBeGreaterThanOrEqual(11);
  });

  it("⛔ the week's conditions apply to EVERY fixture, the coach's included", () => {
    const run = newLadderRun(5);
    const fx = ladderFixture(run, teams, RAIN)!;
    expect(fx.setup.conditions).toEqual(RAIN);
    const events = simulate(fx.setup).events;
    expect(events.find((e) => e.kind === "weather")?.weather).toBe("heavy-rain");
  });

  it("refuses a result from a different fixture, and a day committed twice", () => {
    const run = newLadderRun(7);
    const fx = ladderFixture(run, teams, {})!;
    const wrong = simulate({ ...fx.setup, seed: fx.setup.seed + 1 });
    expect(() => finishLadderDay(run, teams, {}, wrong)).toThrow();
    const once = finishLadderDay(run, teams, {}, simulate(fx.setup));
    // The next fixture now belongs to day two, so day one's result no longer fits.
    expect(() => finishLadderDay(once, teams, {}, simulate(fx.setup))).toThrow();
  });

  it("a no-show is a 0–3 defeat, and nobody appeared", () => {
    const next = finishLadderDay(newLadderRun(11), teams, {}, null);
    const mine = next.results.find((r) => r.home === 0 || r.away === 0)!;
    expect(
      mine.home === 0 ? [mine.homeGoals, mine.awayGoals] : [mine.awayGoals, mine.homeGoals],
    ).toEqual([0, 3]);
    expect(next.market![0]).toMatchObject({ on: [], result: "l", conceded: 3 });
  });

  it("closing an unfinished week fills every matchday left as a no-show", () => {
    let run = newLadderRun(13);
    run = finishLadderDay(run, teams, {}, simulate(ladderFixture(run, teams, {})!.setup));
    const closed = closeLadderWeek(run, teams, {});
    expect(ladderComplete(closed)).toBe(true);
    expect(closed.results).toHaveLength(LADDER_DAYS * 4);
    expect(seasonTable(8, closed.results).every((r) => r.played === LADDER_DAYS)).toBe(true);
  });

  it("⛔ the same week replays the same league for everyone (seeded from the run)", () => {
    const a = closeLadderWeek(newLadderRun(21), teams, RAIN);
    const b = closeLadderWeek(newLadderRun(21), teams, RAIN);
    expect(b.results).toEqual(a.results);
  });

  it("a stance changes the coach's match only through tempo — same fixture, same seed", () => {
    const run = newLadderRun(31);
    const plain = ladderFixture(run, teams, {})!;
    const att = ladderFixture(run, teams, {}, "attacking")!;
    expect(att.setup.seed).toBe(plain.setup.seed);
    expect(att.setup.targetGoalsPerMatch).toBeGreaterThan(plain.setup.targetGoalsPerMatch);
    expect(att.setup.modifiers).toHaveLength(1);
    expect(ladderFixture(run, teams, {}, "balanced")!.setup).toEqual(plain.setup);
  });
});

describe("match conditions in the engine", () => {
  const setup = { home: teams[0]!, away: teams[1]!, targetGoalsPerMatch: 2.7 };

  it("⛔ forcing the value the match would have drawn anyway changes NOTHING downstream", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const plain = simulate({ ...setup, seed });
      const drawn = plain.events.find((e) => e.kind === "weather")!.weather!;
      const ref = plain.events.find((e) => e.kind === "referee")!.refStyle!;
      const forced = simulate({ ...setup, seed, conditions: { weather: drawn, referee: ref } });
      expect(hashEvents(forced.events)).toBe(hashEvents(plain.events));
    }
  });

  it("forced weather and referee appear at kick-off", () => {
    const r = simulate({ ...setup, seed: 3, conditions: { weather: "snow", referee: "strict" } });
    expect(r.events.find((e) => e.kind === "weather")?.weather).toBe("snow");
    expect(r.events.find((e) => e.kind === "referee")?.refStyle).toBe("strict");
  });

  it("VAR week reviews far more often", () => {
    const reviews = (varScale?: number) => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const conditions = varScale == null ? undefined : { varScale };
        n += simulate({ ...setup, seed, ...(conditions ? { conditions } : {}) }).events.filter(
          (e) =>
            e.kind === "var" && (e.varOutcome === "review-goal" || e.varOutcome === "review-red"),
        ).length;
      }
      return n;
    };
    expect(reviews(3)).toBeGreaterThan(reviews() * 2);
  });
});
