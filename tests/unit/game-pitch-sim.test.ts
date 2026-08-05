import { describe, expect, it } from "vitest";
import {
  type SimContext,
  type SlotLike,
  baseLayout,
  buildUp,
  frameFromSim,
  goalKick,
  initSim,
  restSim,
  stepSim,
} from "@/features/game/domain/pitch-sim";
import { mulberry32 } from "@/features/game/domain/rng";

const XI: SlotLike[] = [
  { row: 1, col: 1, role: "GK" },
  { row: 2, col: 1, role: "LB" },
  { row: 2, col: 2, role: "CB" },
  { row: 2, col: 3, role: "CB" },
  { row: 2, col: 4, role: "RB" },
  { row: 3, col: 1, role: "LM" },
  { row: 3, col: 2, role: "CM" },
  { row: 3, col: 3, role: "CM" },
  { row: 3, col: 4, role: "RM" },
  { row: 4, col: 1, role: "CF" },
  { row: 4, col: 2, role: "CF" },
];
const CTX: SimContext = { home: XI, away: XI };

function run(seed: number, steps: number) {
  const rng = mulberry32(seed);
  let s = initSim();
  const trail = [s];
  for (let i = 0; i < steps; i++) {
    s = stepSim(s, CTX, rng);
    trail.push(s);
  }
  return trail;
}

describe("pitch-sim ambient model", () => {
  it("replays identically for the same seed", () => {
    expect(run(123, 60)).toEqual(run(123, 60));
  });
  it("always holds the ball with a valid player on the possessing side", () => {
    for (const s of run(7, 300)) {
      expect(s.holder).toBeGreaterThanOrEqual(0);
      expect(s.holder).toBeLessThan(11);
    }
  });
  it("a shot resolves to a save, turning the ball over to the keeper", () => {
    const saved = stepSim({ possession: "home", holder: 9, phase: "shot" }, CTX, mulberry32(1));
    expect(saved.phase).toBe("save");
    expect(saved.possession).toBe("away");
    expect(saved.holder).toBe(0); // the goalkeeper claims it
  });
  it("an injected goal celebrates then kicks off to the conceding side", () => {
    const g = goalKick("home", 10);
    expect(g.phase).toBe("goal");
    expect(g.holder).toBe(10);
    const next = stepSim(g, CTX, mulberry32(1));
    expect(next.phase).toBe("kickoff");
    expect(next.possession).toBe("away");
  });
});

describe("frameFromSim", () => {
  it("anchors the ball on the holder during open play (never in empty space)", () => {
    const s = { possession: "home" as const, holder: 6, phase: "open" as const };
    const frame = frameFromSim(XI, XI, s);
    const holderDot = frame.home[6];
    expect(frame.ballOnHolder).toBe(true);
    expect(frame.holderSide).toBe("home");
    expect(frame.holderIndex).toBe(6);
    expect(frame.ball.x).toBeCloseTo(holderDot.x, 5);
    expect(frame.ball.y).toBeCloseTo(holderDot.y, 5);
  });
  it("sends the ball to goal on a shot (in flight, not on a holder)", () => {
    const frame = frameFromSim(XI, XI, { possession: "home", holder: 10, phase: "shot" });
    expect(frame.ball.x).toBeGreaterThan(0.95); // home shoots at away's goal (x→1)
    expect(frame.ballOnHolder).toBe(false);
  });
  it("a build-up pushes the scoring side into the opponent half with the ball", () => {
    const frame = frameFromSim(XI, XI, buildUp("away", 9));
    expect(frame.away[9].holder).toBe(true);
    expect(frame.ballOnHolder).toBe(true);
    expect(frame.ball.x).toBeCloseTo(frame.away[9].x, 5);
    expect(frame.ball.x).toBeLessThan(0.4); // away attacks toward x=0 → into home's half
  });
  it("a rest frame settles both teams to formation with the ball on the centre spot", () => {
    const frame = frameFromSim(XI, XI, restSim());
    expect(frame.ball).toEqual({ x: 0.5, y: 0.5 });
    expect(frame.ballOnHolder).toBe(false);
    expect(frame.home.every((d) => !d.holder && d.scale === 1)).toBe(true);
    expect(baseLayout(XI, "home")).toEqual(frame.home.map((d) => ({ x: d.x, y: d.y })));
  });
  it("places 11 dots per side and keeps the halves", () => {
    const frame = frameFromSim(XI, XI, initSim());
    expect(frame.home).toHaveLength(11);
    expect(frame.away).toHaveLength(11);
    expect(baseLayout(XI, "home")[0].x).toBeLessThan(0.15);
    expect(baseLayout(XI, "away")[0].x).toBeGreaterThan(0.85);
  });
});
