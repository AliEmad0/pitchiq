import { describe, expect, it } from "vitest";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import { formationByName } from "@/features/game/domain/formation";
import {
  LIVES,
  MARKET_SHAPE,
  marketMatch,
  packFor,
  recordMatch,
  REWARDS,
  type RewardId,
  runOver,
  startRun,
  takeReward,
} from "@/features/game/domain/market";
import { mulberry32 } from "@/features/game/domain/rng";
import { simulate } from "@/features/game/domain/simulate";

/** TASK-1818 — the Mystery Market, measured on the REAL pool and engine. */
const NAMES = { coach: "You", opponent: "Them" };
const ovr = (c: PoolCard) => c.ratings?.overall ?? 0;

/** Play a whole run on autopilot, taking a seeded-random reward from each pack. */
function autoRun(pool: PoolCard[], seed: number) {
  let run = startRun(pool, seed);
  const pick = mulberry32(seed ^ 0xabcdef);
  for (let guard = 0; guard < 60 && !runOver(run); guard++) {
    const { setup, coachSide } = marketMatch(pool, run, NAMES);
    const r = simulate(setup);
    const gf = r.score[coachSide];
    const ga = r.score[coachSide === "home" ? "away" : "home"];
    run = recordMatch(run, gf, ga);
    if (run.pendingPack) {
      const pack = packFor(run);
      run = takeReward(pool, run, pack[Math.floor(pick() * pack.length)]!);
    }
  }
  return run;
}

describe("the Mystery Market", () => {
  it("⛔ REWARDS is frozen — packs are drawn from it by index", () => {
    expect(REWARDS).toEqual([
      "marquee",
      "wonderkid",
      "gegenpress",
      "ironCurtain",
      "talismanTonic",
      "physio",
    ]);
  });

  it("starts from the weakest legal XI, with three lives", async () => {
    const pool = await loadChaosPool();
    const run = startRun(pool, 1);
    expect(run.lives).toBe(LIVES);
    const shape = formationByName(MARKET_SHAPE);
    const ids = new Map<string, PoolCard>(pool.map((c) => [c.cardId, c]));
    run.xi.forEach((id, i) => expect(canPlay(ids.get(id)!, shape.slots[i]!.role)).toBe(true));
    const mean = run.xi.reduce((a, id) => a + ovr(ids.get(id)!), 0) / 11;
    const poolMean = pool.reduce((a, c) => a + ovr(c), 0) / pool.length;
    expect(mean).toBeLessThan(poolMean);
  }, 60_000);

  it("a win opens a pack of three distinct rewards; a draw opens nothing; three defeats end it", async () => {
    const pool = await loadChaosPool();
    let run = startRun(pool, 2);
    run = recordMatch(run, 1, 1);
    expect(run.pendingPack).toBe(false);
    run = recordMatch(run, 2, 0);
    expect(run.pendingPack).toBe(true);
    const pack = packFor(run);
    expect(new Set(pack).size).toBe(3);
    expect(pack).not.toContain("physio"); // a full set of lives
    expect(() => recordMatch(run, 1, 0)).toThrow(); // pay the pack out first
    expect(() => takeReward(pool, run, REWARDS.find((r) => !pack.includes(r))!)).toThrow();
    run = takeReward(pool, run, pack[0]!);
    for (let i = 0; i < LIVES; i++) run = recordMatch(run, 0, 1);
    expect(runOver(run)).toBe(true);
    expect(() => recordMatch(run, 1, 0)).toThrow();
  }, 60_000);

  it("every reward is a boon WITH a catch", async () => {
    const pool = await loadChaosPool();
    const ids = new Map<string, PoolCard>(pool.map((c) => [c.cardId, c]));
    const at = (id: RewardId) => {
      // Find a seed whose first pack offers this reward.
      for (let seed = 1; seed < 400; seed++) {
        let run = recordMatch({ ...startRun(pool, seed), lives: 2 }, 1, 0);
        if (!packFor(run).includes(id)) continue;
        const before = run;
        run = takeReward(pool, run, id);
        return { before, after: run };
      }
      throw new Error(`no pack offered ${id}`);
    };
    const m = at("marquee");
    const signed = m.after.xi.find((c) => !m.before.xi.includes(c))!;
    expect(ovr(ids.get(signed)!)).toBeGreaterThanOrEqual(85);
    expect(m.after.forced[signed]).toBe("hot-head");
    const w = at("wonderkid");
    expect(w.after.xi.filter((c) => !w.before.xi.includes(c)).length).toBeGreaterThanOrEqual(1);
    const g = at("gegenpress");
    expect(g.after.buffs).toEqual([{ id: "gegenpress", until: g.before.round + 2 }]);
    const ic = at("ironCurtain");
    expect(ic.after.buffs[0]).toEqual({ id: "ironCurtain", until: null });
    const tt = at("talismanTonic");
    expect(Object.values(tt.after.forced)).toContain("talisman");
    const p = at("physio");
    expect(p.after.lives).toBe(3);
    expect(p.after.tierBonus).toBe(1);
  }, 120_000);

  it("⛔ a run is reproducible from its seed", async () => {
    const pool = await loadChaosPool();
    expect(autoRun(pool, 77)).toEqual(autoRun(pool, 77));
  }, 120_000);

  it("⭐ difficulty: a typical autopilot run wins a handful of matches, and none run forever", async () => {
    const pool = await loadChaosPool();
    const wins: number[] = [];
    for (let seed = 1; seed <= 120; seed++) wins.push(autoRun(pool, seed).wins);
    wins.sort((a, b) => a - b);
    const median = wins[Math.floor(wins.length / 2)]!;
    console.log(JSON.stringify({ median, min: wins[0], max: wins.at(-1), wins }));
    // Measured 2026-10-21: an autopilot that never coaches and picks rewards at random wins a
    // median of 2 (the starting XI beats its own neighbourhood ~40% of the time). The band is for
    // THAT player; a coach using the team talks and choosing rewards on purpose goes further.
    expect(median).toBeGreaterThanOrEqual(2);
    expect(median).toBeLessThanOrEqual(6);
    expect(wins.at(-1)!).toBeGreaterThanOrEqual(6); // a hot run is possible
    expect(wins.at(-1)!).toBeLessThan(30);
  }, 400_000);
});
