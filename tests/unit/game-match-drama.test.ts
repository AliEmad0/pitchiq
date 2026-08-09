import { describe, expect, it } from "vitest";
import type { MatchSetup } from "@/features/game/domain/match-types";
import { RESPONSE_WINDOW, simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * TASK-1822 Phase 1 — the event spine and the psychology.
 *
 * MEASURED BEFORE BUILDING: the owner reported "the first team to score always wins"
 * and "draws are rare". Over 4,000 real Chaos matches the engine actually produced a
 * 27.3% draw rate and a 69.2% first-scorer win rate — both realistic (the Premier
 * League runs ~22-25% and ~68-70%). The felt problem was that a match emitted about
 * FIVE events in ninety minutes, so nothing ever visibly contested the scoreline.
 *
 * So this phase adds events and reshapes the psychology WITHOUT moving the results
 * distribution, which `game-match-harness.test.ts` pins.
 */

const team = (name: string): GameTeam =>
  ({ teamId: 1, name, season: 2020, formation: null, players: [] }) as unknown as GameTeam;

const setup = (over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: team("H"),
  away: team("A"),
  seed: 7,
  targetGoalsPerMatch: 2.7,
  homePower: { attack: 70, defense: 70, aggression: 45 },
  awayPower: { attack: 70, defense: 70, aggression: 45 },
  ...over,
});

describe("chance resolution", () => {
  it("emits far more than the old five events per match", () => {
    // The whole point of the phase: a match must feel contested.
    const counts: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      counts.push(simulate(setup({ seed })).events.length);
    }
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(mean).toBeGreaterThan(15);
  });

  it("resolves chances into varied outcomes, not just goals", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const e of simulate(setup({ seed })).events) {
        if (e.kind === "chance" && e.outcome != null) seen.add(e.outcome);
      }
    }
    // Every branch must actually occur across a realistic sample.
    for (const outcome of ["saved", "blocked", "wide", "post", "crossbar"]) {
      expect(seen).toContain(outcome);
    }
  });

  it("keeps chances far more common than goals", () => {
    let chances = 0;
    let goals = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const e of simulate(setup({ seed })).events) {
        if (e.kind === "chance") chances++;
        if (e.kind === "goal") goals++;
      }
    }
    expect(chances / goals).toBeGreaterThan(4);
  });
});

describe("psychology — conceding provokes a response", () => {
  it("lifts the CONCEDING side's urgency, not the scorer's", () => {
    // The defect this replaces: `momentumModifier` gave the scorer +12 attack and the
    // conceding side a penalty, so scoring made you better and conceding made you
    // worse — a rich-get-richer loop, and the opposite of how football behaves.
    // Measured as an AGGREGATE SHARE, not a per-match majority: with only a couple of
    // attempts inside a fifteen-minute window, "strict majority" mostly measures the
    // threshold rather than the mechanism (a 1-1 window would count as a failure).
    let byConceder = 0;
    let total = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const r = simulate(setup({ seed }));
      const first = r.events.find((e) => e.kind === "goal");
      if (first?.side == null) continue;
      const conceder = first.side === "home" ? "away" : "home";
      for (const e of r.events) {
        if (e.minute <= first.minute || e.minute > first.minute + RESPONSE_WINDOW) continue;
        if (e.kind !== "chance" && e.kind !== "goal") continue;
        total++;
        if (e.side === conceder) byConceder++;
      }
    }
    expect(total).toBeGreaterThan(1000);
    expect(byConceder / total).toBeGreaterThan(0.5);
  });

  it("announces a late push when a side is trailing", () => {
    let pushes = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = simulate(setup({ seed }));
      const push = r.events.find((e) => e.kind === "push");
      if (push != null) {
        pushes++;
        expect(push.minute).toBeGreaterThanOrEqual(75);
      }
    }
    expect(pushes).toBeGreaterThan(50);
  });
});

describe("stoppage time", () => {
  it("plays beyond ninety minutes", () => {
    const lengths = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const r = simulate(setup({ seed }));
      const ft = r.events.find((e) => e.kind === "fulltime");
      lengths.add(ft?.minute ?? 0);
    }
    // Variable added time, always past 90.
    expect(Math.min(...lengths)).toBeGreaterThan(90);
    expect(lengths.size).toBeGreaterThan(1);
  });

  it("announces the added minutes", () => {
    const r = simulate(setup({ seed: 3 }));
    const stoppage = r.events.find((e) => e.kind === "stoppage");
    expect(stoppage).toBeDefined();
    expect(stoppage?.minute).toBe(90);
    expect(stoppage?.addedMinutes).toBeGreaterThanOrEqual(1);
  });

  it("can still produce a stoppage-time goal", () => {
    let late = 0;
    for (let seed = 1; seed <= 400; seed++) {
      if (simulate(setup({ seed })).events.some((e) => e.kind === "goal" && e.minute > 90)) late++;
    }
    expect(late).toBeGreaterThan(5);
  });
});

describe("determinism is preserved", () => {
  it("replays byte-identically from the same seed", () => {
    expect(simulate(setup({ seed: 42 }))).toEqual(simulate(setup({ seed: 42 })));
  });

  it("diverges for a different seed", () => {
    expect(simulate(setup({ seed: 42 }))).not.toEqual(simulate(setup({ seed: 43 })));
  });
});
