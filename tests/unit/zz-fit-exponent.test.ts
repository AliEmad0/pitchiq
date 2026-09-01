import { describe, expect, it } from "vitest";
import { loadStandings } from "@/data/loaders";
import { assembleGameTeam } from "@/features/game/adapter/lineup";
import { __setPowerExponent } from "@/features/game/domain/minute-model";
import { simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * TASK-1844 Task 3 — fit the exponent against REAL seasons played by their REAL squads, scored
 * on the tables that actually happened. THROWAWAY: deleted in Task 8.
 *
 * Targets from all 34 committed seasons:
 *   champion 87.6 | bottom 25.6 | gap 62.0 | points SD 16.2 | champion win rate 69.9%
 * Match-quality gates that must survive (game-match-harness.test.ts):
 *   draws .15-.35 | goals/match 2.0-3.4
 */
const SEASONS = [1994, 1997, 2000, 2003, 2006, 2009, 2012, 2015, 2018, 2021];
const EXPONENTS = [4, 5, 6, 7, 8, 9];
const SEEDS = 4;

function fixtures(n: number): Array<Array<[number, number]>> {
  const ids = [...Array(n).keys()];
  const weeks: Array<Array<[number, number]>> = [];
  const rot = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const week: Array<[number, number]> = [];
    const order = [ids[0]!, ...rot];
    for (let i = 0; i < n / 2; i++) {
      week.push(r % 2 === 0 ? [order[i]!, order[n - 1 - i]!] : [order[n - 1 - i]!, order[i]!]);
    }
    weeks.push(week);
    rot.unshift(rot.pop()!);
  }
  return [...weeks, ...weeks.map((w) => w.map(([a, b]) => [b, a] as [number, number]))];
}

function spearman(a: number[], b: number[]): number {
  const n = a.length;
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => [v, i] as const).sort((p, q) => q[0] - p[0]);
    const r = new Array(n).fill(0);
    idx.forEach(([, i], k) => (r[i] = k + 1));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  return 1 - (6 * ra.reduce((acc, v, i) => acc + (v - rb[i]!) ** 2, 0)) / (n * (n * n - 1));
}

describe("fit the exponent", () => {
  it("sweeps p against the tables that actually happened", async () => {
    const loaded: Array<{ season: number; teams: GameTeam[]; realPts: number[]; target: number }> =
      [];
    for (const season of SEASONS) {
      const rows = await loadStandings(season);
      if (rows == null || rows.length !== 20) continue;
      const teams: GameTeam[] = [];
      let ok = true;
      for (const r of rows) {
        const t = await assembleGameTeam(r.teamId, season);
        if (t == null) {
          ok = false;
          break;
        }
        teams.push(t);
      }
      if (!ok) continue;
      loaded.push({
        season,
        teams,
        realPts: rows.map((r) => r.points),
        target: rows.reduce((a, r) => a + r.goalsFor, 0) / (rows.length * (rows.length - 1)),
      });
    }
    console.log(`seasons: ${loaded.map((l) => l.season).join(", ")}`);
    expect(loaded.length).toBeGreaterThan(5);

    const sched = fixtures(20);

    for (const p of EXPONENTS) {
      __setPowerExponent(p);
      const rho: number[] = [];
      const sd: number[] = [];
      const champ: number[] = [];
      const gap: number[] = [];
      const champWin: number[] = [];
      let draws = 0;
      let played = 0;
      let goals = 0;
      let biggestWin = 0;
      let blowouts = 0;

      for (const { teams, realPts, target } of loaded) {
        for (let rep = 0; rep < SEEDS; rep++) {
          const pts = new Array(20).fill(0);
          const gd = new Array(20).fill(0);
          const won = new Array(20).fill(0);
          sched.forEach((week, w) => {
            for (const [h, a] of week) {
              const r = simulate({
                home: teams[h]!,
                away: teams[a]!,
                seed: w * 1009 + h * 17 + rep * 104729 + p * 7919,
                targetGoalsPerMatch: target,
              });
              played++;
              goals += r.score.home + r.score.away;
              const margin = Math.abs(r.score.home - r.score.away);
              if (margin > biggestWin) biggestWin = margin;
              if (margin >= 4) blowouts++;
              gd[h] += r.score.home - r.score.away;
              gd[a] += r.score.away - r.score.home;
              if (r.score.home > r.score.away) {
                pts[h] += 3;
                won[h]++;
              } else if (r.score.away > r.score.home) {
                pts[a] += 3;
                won[a]++;
              } else {
                pts[h] += 1;
                pts[a] += 1;
                draws++;
              }
            }
          });
          rho.push(spearman(pts, realPts));
          const mean = pts.reduce((x: number, y: number) => x + y, 0) / 20;
          sd.push(Math.sqrt(pts.reduce((x: number, y: number) => x + (y - mean) ** 2, 0) / 20));
          const order = [...Array(20).keys()].sort((x, y) => pts[y] - pts[x] || gd[y] - gd[x]);
          champ.push(pts[order[0]!]);
          gap.push(pts[order[0]!] - pts[order[19]!]);
          champWin.push((won[order[0]!] / 38) * 100);
        }
      }
      const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      console.log(
        `p=${String(p).padStart(2)}: rho=${avg(rho).toFixed(3)}` +
          ` champ=${avg(champ).toFixed(1)}/87.6` +
          ` gap=${avg(gap).toFixed(1)}/62.0` +
          ` SD=${avg(sd).toFixed(1)}/16.2` +
          ` champWin=${avg(champWin).toFixed(1)}%/69.9` +
          ` | draws=${(draws / played).toFixed(3)} goals=${(goals / played).toFixed(2)}` +
          ` blowout4+=${((blowouts / played) * 100).toFixed(1)}% max=${biggestWin}`,
      );
    }
    __setPowerExponent(1);
  }, 3_600_000);
});
