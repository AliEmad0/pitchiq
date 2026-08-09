import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { type PoolCard, chaosMatchup } from "@/features/game/domain/chaos-draft";
import { opponentSetup } from "@/features/game/domain/opponent";
import { mulberry32 } from "@/features/game/domain/rng";
import { simulate } from "@/features/game/domain/simulate";

/**
 * The MATCH ENGINE's hard gate — the sibling of the rating harness, and it exists for
 * the same reason.
 *
 * TASK-1822 was opened on a report that "the first team to score always wins and draws
 * are rare". Measured over 4,000 real Chaos matches, the engine was already producing a
 * 27.3% draw rate and a 69.2% first-scorer win rate — both close to the real Premier
 * League (~22-25% and ~68-70%). The felt problem was that a match emitted about FIVE
 * events in ninety minutes, so nothing visibly contested the scoreline.
 *
 * That makes this file's job precise: the phases of TASK-1822 add drama, and NONE of
 * them may move the results distribution while doing it. Every assertion runs through
 * the real Chaos path — draft, tactical styles, simulate — not a synthetic setup, so a
 * regression anywhere in that chain is caught.
 */

const ROLES: PlayerRole[] = [
  "GK",
  "GK",
  "CB",
  "CB",
  "CB",
  "LB",
  "RB",
  "CDM",
  "CM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "LW",
  "RW",
  "CF",
  "CF",
  "SS",
];

/** A pool shaped like the committed one: ~250 cards spread across the rating scale. */
function makePool(): PoolCard[] {
  const rng = mulberry32(12345);
  const out: PoolCard[] = [];
  for (let i = 0; i < 250; i++) {
    const role = ROLES[Math.floor(rng() * ROLES.length)];
    const base = 55 + Math.floor(rng() * 40);
    out.push({
      cardId: `${1000 + i}@2020`,
      playerId: 1000 + i,
      season: 2020,
      name: `P${i}`,
      role,
      altRoles: [],
      club: "C",
      ratings: {
        attack: base,
        creation: base,
        defense: base,
        physical: base,
        discipline: 50 + Math.floor(rng() * 40),
        overall: base,
      },
    } as unknown as PoolCard);
  }
  return out;
}

interface Summary {
  matches: number;
  drawRate: number;
  goalsPerMatch: number;
  eventsPerMatch: number;
  firstScorerWins: number;
  comebacks: number;
  latestGoal: number;
}

function sweep(n: number): Summary {
  const pool = makePool();
  let draws = 0;
  let goals = 0;
  let events = 0;
  let decided = 0;
  let firstWins = 0;
  let comebacks = 0;
  let latestGoal = 0;

  for (let seed = 1; seed <= n; seed++) {
    const m = chaosMatchup(pool, seed);
    const r = simulate(
      opponentSetup({
        home: m.home,
        homeStyle: m.homeStyle,
        opponent: m.opponent,
        season: 2020,
        seed,
        targetGoalsPerMatch: 2.7,
      }),
    );
    goals += r.score.home + r.score.away;
    events += r.events.length;
    if (r.score.home === r.score.away) draws++;
    for (const e of r.events) {
      if (e.kind === "goal" && e.minute > latestGoal) latestGoal = e.minute;
    }
    const first = r.events.find((e) => e.kind === "goal");
    if (first?.side != null) {
      decided++;
      const winner =
        r.score.home > r.score.away ? "home" : r.score.away > r.score.home ? "away" : null;
      if (winner === first.side) firstWins++;
      else if (winner != null) comebacks++;
    }
  }
  return {
    matches: n,
    drawRate: draws / n,
    goalsPerMatch: goals / n,
    eventsPerMatch: events / n,
    firstScorerWins: firstWins / decided,
    comebacks: comebacks / decided,
    latestGoal,
  };
}

const summary = sweep(3000);

describe("match harness — the results distribution stays realistic", () => {
  it("keeps draws in the real-football band", () => {
    // Real Premier League: ~22-25%. Band is deliberately wider than the target so a
    // legitimate tuning change does not fail, but a broken model does.
    expect(summary.drawRate).toBeGreaterThan(0.15);
    expect(summary.drawRate).toBeLessThan(0.35);
  });

  it("does not let the first goal decide the match", () => {
    // THE ORIGINAL COMPLAINT. Real football sits near 68-70%; anything approaching
    // certainty means the model has a rich-get-richer loop, which is exactly what the
    // old momentum modifier was (+12 attack to the scorer, a penalty to the conceder).
    expect(summary.firstScorerWins).toBeLessThan(0.78);
    expect(summary.firstScorerWins).toBeGreaterThan(0.55);
  });

  it("produces real comebacks", () => {
    expect(summary.comebacks).toBeGreaterThan(0.07);
  });

  it("stays on the season-authentic goal rate", () => {
    // The chance pipeline multiplies EVENTS, not goals. If this drifts, `CONVERSION`
    // and `chanceRate` have fallen out of step.
    expect(summary.goalsPerMatch).toBeGreaterThan(2.0);
    expect(summary.goalsPerMatch).toBeLessThan(3.4);
  });

  it("gives a match enough to watch", () => {
    // The felt problem, as a number. Before TASK-1822 this was ~8 events per match.
    expect(summary.eventsPerMatch).toBeGreaterThan(15);
  });

  it("plays into stoppage time", () => {
    expect(summary.latestGoal).toBeGreaterThan(90);
  });

  it("reports the distribution for a human to read", () => {
    // Not an assertion — the rating work proved that a defect nobody asserted on shows
    // up when a person reads real output. Keep printing it.
    console.log("\n=== MATCH ENGINE, 3000 chaos matches ===");
    console.log({
      drawRate: `${(100 * summary.drawRate).toFixed(1)}%`,
      firstScorerWins: `${(100 * summary.firstScorerWins).toFixed(1)}%`,
      comebacks: `${(100 * summary.comebacks).toFixed(1)}%`,
      goalsPerMatch: summary.goalsPerMatch.toFixed(2),
      eventsPerMatch: summary.eventsPerMatch.toFixed(1),
      latestGoal: summary.latestGoal,
    });
    expect(summary.matches).toBe(3000);
  });
});
