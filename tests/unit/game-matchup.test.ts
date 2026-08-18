import { describe, expect, it } from "vitest";
import { decadeSpan, squadAverage, starOf, taleOfTheTape } from "@/features/game/domain/matchup";
import { makeTeam } from "./_helpers/match-setup";

/**
 * TASK-1810 — the pre-match programme's arithmetic.
 *
 * ⚠️ Every expected value below is tied to 4-4-2 Flat's slot ORDER:
 * GK, LB, CB, CB, RB | LM, CM, CM, RM | CF, CF. The defence bucket is five players
 * because the goalkeeper is one of them.
 */
describe("taleOfTheTape", () => {
  it("splits the XI into overall, attack, midfield and defence", () => {
    const team = makeTeam({ ratings: [80, 70, 70, 70, 70, 75, 75, 75, 75, 85, 85] });
    const tape = taleOfTheTape(team);
    expect(tape.defence).toBe(72); // (80+70+70+70+70)/5
    expect(tape.midfield).toBe(75);
    expect(tape.attack).toBe(85);
    expect(tape.overall).toBe(75); // 830/11 = 75.45
  });

  it("ignores players with no rating rather than counting them as zero", () => {
    const team = makeTeam({ ratings: [...Array<number>(10).fill(80), null] });
    expect(taleOfTheTape(team).overall).toBe(80);
  });

  it("reports 0 rather than NaN for a group with nobody rated", () => {
    // A real case — thin clubs carry cards the rating pipeline could not score — and NaN
    // would render as the string "NaN" inside the bar's own label.
    const team = makeTeam({ ratings: [...Array<number>(9).fill(80), null, null] });
    expect(taleOfTheTape(team).attack).toBe(0);
  });

  it("buckets by the SLOT's role, not the card's own", () => {
    // A striker fielded at left-back counts toward the defence, because that is where the
    // coach put him. The slot is never null; a card's own `role` can be.
    const team = makeTeam({ ratings: [50, 90, 50, 50, 50, 50, 50, 50, 50, 50, 50] });
    expect(taleOfTheTape(team).defence).toBe(58); // (50+90+50+50+50)/5
    expect(taleOfTheTape(team).attack).toBe(50);
  });
});

describe("starOf", () => {
  it("returns the highest-rated player", () => {
    const team = makeTeam({ ratings: [...Array<number>(10).fill(70), 91] });
    expect(starOf(team)?.ratings?.overall).toBe(91);
  });

  it("is null for a squad with no ratings at all", () => {
    expect(starOf(makeTeam({ ratings: Array<null>(11).fill(null) }))).toBeNull();
  });
});

describe("decadeSpan", () => {
  it("reports the first and last season the XI is drawn from", () => {
    const team = makeTeam({
      seasons: [1994, 2001, 2001, 2008, 2008, 2008, 2015, 2015, 2019, 2019, 2019],
    });
    expect(decadeSpan(team)).toEqual({ first: 1994, last: 2019 });
  });
});

describe("squadAverage", () => {
  it("rounds to a whole number", () => {
    expect(squadAverage(makeTeam({ ratings: [81, ...Array<number>(10).fill(80)] }))).toBe(80);
  });
});
