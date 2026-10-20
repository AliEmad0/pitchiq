import { describe, expect, it } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import type { ClassicData } from "@/features/game/domain/classic-data";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import type { MatchState, Side } from "@/features/game/domain/match-types";
import { drive, runMatch } from "@/features/game/domain/simulate";
import { SCENARIOS } from "@/features/game/domain/what-if";
import { WHAT_IF_BOOST, WHAT_IF_TEMPO, whatIfBoost } from "@/features/game/domain/what-if-boost";
import { buildBoostedSession } from "@/features/game/view/what-if-session";

/**
 * TASK-1816 — difficulty, MEASURED. Owner: "1 in 4" rescues, with a What-If-only boost.
 *
 * Measured before the boost existed (300 runs, default coaching): every rescue succeeded
 * 0–3% of the time — honest, and unplayable. The engine fixes a match's total chances and
 * weights only split them, so an attacking lift alone stalls near a two-thirds share; the
 * boost therefore (1) doubles the match TEMPO and (2) lifts the trailing side's attack and
 * eases the leader's by the same amount, per goal of deficit, scaled by the time left.
 * One rule for every scenario — never a per-scenario fudge.
 */
const cache = new Map<number, ClassicData>();
async function data(season: number) {
  if (!cache.has(season)) cache.set(season, (await loadClassicData(season))!);
  return cache.get(season)!;
}
const play = (s: (typeof SCENARIOS)[number], d: ClassicData, seed: number) => {
  const { setup } = buildBoostedSession(s, d, seed)!;
  const r = drive(runMatch(setup), (q) => {
    const a = defaultAnswer(q);
    return a.kind === "sub-offer" ? { ...a, reason: undefined } : a;
  });
  const own = s.side === "home" ? r.score.home : r.score.away;
  const opp = s.side === "home" ? r.score.away : r.score.home;
  return own >= opp;
};

describe("What-If boost", () => {
  it("the constants are pinned (refit = re-measure every scenario)", () => {
    expect(WHAT_IF_TEMPO).toBe(2);
    expect(WHAT_IF_BOOST).toBe(21);
  });

  it("is inert when the trailing side is level or ahead", () => {
    const state = (home: number, away: number) =>
      ({ minute: 60, home: { score: home }, away: { score: away } }) as unknown as MatchState;
    const mod = whatIfBoost("home", 26);
    for (const side of ["home", "away"] as Side[]) {
      expect(mod({ state: state(2, 2), side })).toEqual({});
      expect(mod({ state: state(3, 1), side })).toEqual({});
    }
    expect(mod({ state: state(0, 2), side: "home" }).attack).toBeGreaterThan(0);
    expect(mod({ state: state(0, 2), side: "away" }).attack).toBeLessThan(0);
  });

  it("a boosted session carries exactly the one What-If modifier", async () => {
    const s = SCENARIOS[0]!;
    const d = await data(s.season);
    const boosted = buildBoostedSession(s, d, 1)!;
    expect(boosted.setup.modifiers).toHaveLength(1);
  });

  it("⭐ every shipped scenario lands in the 15–45% band; the mean is ~1 in 4", async () => {
    const N = 300;
    const rates: Record<string, number> = {};
    for (const s of SCENARIOS) {
      const d = await data(s.season);
      let ok = 0;
      for (let seed = 1; seed <= N; seed++) if (play(s, d, seed)) ok++;
      rates[s.id] = ok / N;
    }
    console.table(rates);
    for (const [id, rate] of Object.entries(rates)) {
      expect(rate, id).toBeGreaterThanOrEqual(0.15);
      expect(rate, id).toBeLessThanOrEqual(0.45);
    }
    const mean = Object.values(rates).reduce((a, b) => a + b, 0) / SCENARIOS.length;
    expect(mean).toBeGreaterThanOrEqual(0.22);
    expect(mean).toBeLessThanOrEqual(0.28);
  }, 120_000);
});
