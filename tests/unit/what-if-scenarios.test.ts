import { describe, expect, it } from "vitest";
import { deriveScenario } from "@/features/game/adapter/what-if-derive";
import { SCENARIOS, verdictFor, type Scenario } from "@/features/game/domain/what-if";

/**
 * TASK-1816 — every What-If scenario is a REAL moment. Its start minute, score, history,
 * dismissals, substitutions and starting XIs are re-derived from the committed archive, so
 * a scenario can never start from a deficit that did not happen.
 */
describe("What-If scenarios — derived from the archive", () => {
  it("⛔ every frozen scenario re-derives exactly from the archive", async () => {
    for (const s of SCENARIOS) {
      const frozen: Partial<Scenario> = { ...s };
      delete frozen.id;
      expect(await deriveScenario(s.fixtureId, s.season), s.id).toEqual(frozen);
    }
  });

  it("⛔ GOLDEN: scenario ids and start states never change", () => {
    const table = Object.fromEntries(
      SCENARIOS.map((s) => [s.id, [s.side, s.startMinute, s.startScore.home, s.startScore.away]]),
    );
    expect(table).toEqual({
      "2001-tot-mun": ["away", 45, 3, 0],
      "2011-new-ars": ["home", 26, 0, 4],
      "2014-cry-liv": ["home", 55, 0, 3],
      "2013-wba-mun": ["home", 30, 0, 3],
      "1994-liv-mun": ["home", 24, 0, 3],
      "2000-sou-liv": ["home", 64, 0, 3],
      "1998-whu-wim": ["away", 27, 3, 0],
    });
  });

  it("every scenario is a real comeback: ≥2 down at its start, and the real side drew or won", () => {
    for (const s of SCENARIOS) {
      const own = (x: { home: number; away: number }) => (s.side === "home" ? x.home : x.away);
      const opp = (x: { home: number; away: number }) => (s.side === "home" ? x.away : x.home);
      expect(opp(s.startScore) - own(s.startScore), s.id).toBeGreaterThanOrEqual(2);
      expect(own(s.history) - opp(s.history), s.id).toBeGreaterThanOrEqual(0);
      expect(s.realXi.home, s.id).toHaveLength(11);
      expect(s.realXi.away, s.id).toHaveLength(11);
    }
  });

  it("refuses a fixture whose events do not add up to its score", async () => {
    // Villa 3–1 Man United (1995-08-19) carries only three goal events for four goals —
    // the derivation must say no rather than start from a deficit it cannot prove.
    expect(await deriveScenario("1995-08-19-AVL-MUN", 1995)).toBeNull();
    expect(await deriveScenario("does-not-exist", 1995)).toBeNull();
  });
});

describe("verdictFor — result first, then goal difference, from the coach's side", () => {
  const away = (history: [number, number]): Scenario =>
    ({
      ...SCENARIOS[0]!,
      side: "away",
      history: { home: history[0], away: history[1] },
    }) as Scenario;

  it("a 3–3 history (coach away)", () => {
    const s = away([3, 3]);
    expect(verdictFor(s, { home: 3, away: 4 })).toBe("rewrote");
    expect(verdictFor(s, { home: 3, away: 3 })).toBe("matched");
    expect(verdictFor(s, { home: 4, away: 3 })).toBe("repeated");
  });

  it("a 3–5 history the real side WON: rewritten only by a bigger margin", () => {
    const s = away([3, 5]);
    expect(verdictFor(s, { home: 3, away: 6 })).toBe("rewrote");
    expect(verdictFor(s, { home: 2, away: 4 })).toBe("matched");
    expect(verdictFor(s, { home: 3, away: 4 })).toBe("repeated");
  });

  it("reads the HOME side when the coach is home", () => {
    const s = { ...SCENARIOS[1]!, history: { home: 4, away: 4 } } as Scenario;
    expect(s.side).toBe("home");
    expect(verdictFor(s, { home: 5, away: 4 })).toBe("rewrote");
    expect(verdictFor(s, { home: 3, away: 4 })).toBe("repeated");
  });
});
