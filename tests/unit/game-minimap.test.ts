import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/features/game/domain/rng";
import {
  PITCH_X,
  PITCH_Y,
  type MiniMapState,
  aim,
  anchorsFor,
  arcHeight,
  createState,
  goalOf,
  kick,
  len,
  lerp,
  passOn,
  penaltyScene,
  resetScene,
  shoot,
  step,
  sub,
  vec,
} from "@/features/game/domain/minimap";

/** 4-4-2-ish slots: a keeper line, a back four, a midfield four, two forwards. */
const SLOTS = [
  { row: 1, col: 1 },
  { row: 2, col: 1 },
  { row: 2, col: 2 },
  { row: 2, col: 3 },
  { row: 2, col: 4 },
  { row: 3, col: 1 },
  { row: 3, col: 2 },
  { row: 3, col: 3 },
  { row: 3, col: 4 },
  { row: 4, col: 1 },
  { row: 4, col: 2 },
];

const side = (base: number) => SLOTS.map((_, i) => ({ playerId: base + i, number: i + 1 }));

const fresh = (): MiniMapState =>
  createState({ slots: SLOTS, players: side(100) }, { slots: SLOTS, players: side(200) });

/** Run the sim forward at a steady 60 Hz, re-aiming each frame. */
function run(s: MiniMapState, seconds: number): void {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    aim(s);
    step(s, dt);
  }
}

describe("vector helpers", () => {
  it("lerps, and the arc peaks at the midpoint and is flat at both ends", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(arcHeight(0, 6)).toBe(0);
    expect(arcHeight(1, 6)).toBe(0);
    expect(arcHeight(0.5, 6)).toBe(6);
  });
});

describe("anchorsFor", () => {
  it("puts home in its own half and mirrors the away shape", () => {
    const home = anchorsFor(SLOTS, "home");
    const away = anchorsFor(SLOTS, "away");
    expect(Math.max(...home.map((p) => p.x))).toBeLessThanOrEqual(PITCH_X / 2);
    expect(Math.min(...away.map((p) => p.x))).toBeGreaterThanOrEqual(PITCH_X / 2);
    // The keeper is the deepest man on each side.
    expect(home[0]!.x).toBeLessThan(home[10]!.x);
    expect(away[0]!.x).toBeGreaterThan(away[10]!.x);
  });
});

describe("aim — the thing two rejected attempts got wrong", () => {
  it("⭐ MIXES the two sides instead of moving each as a block", () => {
    /**
     * The owner rejected a whole-team offset: both shapes slid into one half and never
     * met. Real marking means that once an attack is on, the sorted-by-x order of the 22
     * dots must INTERLEAVE — home and away alternating — rather than being all of one
     * side and then all of the other.
     */
    const s = fresh();
    s.possession = "home";
    s.ball.carrier = 109; // a forward
    run(s, 4);

    const order = [...s.actors].sort((a, b) => a.pos.x - b.pos.x).map((a) => a.side);
    let changes = 0;
    for (let i = 1; i < order.length; i++) if (order[i] !== order[i - 1]) changes += 1;
    // Two clean blocks give exactly 1 change. Genuine mixing gives many.
    expect(changes).toBeGreaterThan(6);
  });

  it("⭐ puts a defender GOAL-SIDE of the man he ACTUALLY marks", () => {
    /**
     * "Defenders blocking attackers" — the marker must be between his man and the goal
     * that man is attacking, never trailing behind him.
     *
     * ⚠️ Asserted against the assignment `aim` returns, NOT against "the nearest
     * defender". Once marking is one-to-one those are different questions: the defender
     * closest to a given attacker is frequently somebody else's marker, and an earlier
     * version of this test failed for that reason while the behaviour was correct.
     */
    const s = fresh();
    s.possession = "home";
    s.ball.carrier = 109;
    run(s, 4);

    const goal = goalOf("home");
    const { marking } = aim(s);
    expect(marking.size).toBeGreaterThanOrEqual(8);

    let goalSide = 0;
    for (const [defId, attId] of marking) {
      const d = s.actors.find((a) => a.playerId === defId)!;
      const man = s.actors.find((a) => a.playerId === attId)!;
      if (len(sub(d.pos, goal)) < len(sub(man.pos, goal))) goalSide += 1;
    }
    // Every assigned marker should be goal-side of his man.
    expect(goalSide).toBe(marking.size);
  });

  it("⭐ marks ONE-TO-ONE — no two defenders pick up the same man", () => {
    // Independent "nearest attacker" marking let three defenders converge on one player
    // while others ran free, which is what made the dots read as two blocks.
    const s = fresh();
    s.possession = "home";
    s.ball.carrier = 109;
    run(s, 3);

    const { marking } = aim(s);
    const marked = [...marking.values()];
    expect(new Set(marked).size).toBe(marked.length);
  });

  it("⭐ sends the nearest defender to PRESS the carrier", () => {
    const s = fresh();
    s.possession = "home";
    s.ball.carrier = 105;
    run(s, 4);

    const carrier = s.actors.find((a) => a.playerId === 105)!;
    const pressing = s.actors.filter((a) => a.state === "pressing");
    expect(pressing).toHaveLength(1);
    // He gets right on top of him, not vaguely nearby.
    expect(len(sub(pressing[0]!.pos, carrier.pos))).toBeLessThan(4);
  });

  it("⛔ never sends a keeper out to press", () => {
    const s = fresh();
    s.possession = "home";
    s.ball.carrier = 109;
    run(s, 4);
    expect(s.actors.filter((a) => a.keeper && a.state === "pressing")).toHaveLength(0);
  });

  it("keeps both keepers on their own goal lines", () => {
    const s = fresh();
    run(s, 3);
    const keepers = s.actors.filter((a) => a.keeper);
    expect(keepers).toHaveLength(2);
    expect(keepers.find((k) => k.side === "home")!.pos.x).toBeLessThan(8);
    expect(keepers.find((k) => k.side === "away")!.pos.x).toBeGreaterThan(PITCH_X - 8);
  });
});

describe("possession travels", () => {
  it("⭐ a pass chain carries the ball INTO the opponent half", () => {
    /**
     * The owner's stated requirement: to score, the attacking side must be in the
     * opponent half WITH the ball. Random passing — the first rejected attempt — does not
     * satisfy that, so this asserts progress rather than mere motion.
     */
    const s = fresh();
    const rng = mulberry32(7);
    s.possession = "home";
    s.ball.carrier = 105;
    run(s, 1);
    const startX = s.ball.pos.x;

    for (let i = 0; i < 6; i++) {
      passOn(s, rng);
      run(s, 1.2);
    }
    expect(s.ball.pos.x).toBeGreaterThan(startX);
    expect(s.ball.pos.x).toBeGreaterThan(PITCH_X / 2);
  });

  it("never passes back to its own keeper", () => {
    const s = fresh();
    const rng = mulberry32(3);
    s.possession = "home";
    s.ball.carrier = 105;
    for (let i = 0; i < 12; i++) {
      passOn(s, rng);
      run(s, 0.8);
      expect(s.ball.carrier).not.toBe(100);
    }
  });

  it("is deterministic for a given seed", () => {
    // ⛔ The whole game replays byte-for-byte; a mini-map reading Math.random would break
    // that the moment its motion fed anything back.
    const trace = (seed: number) => {
      const s = fresh();
      const rng = mulberry32(seed);
      s.possession = "home";
      s.ball.carrier = 105;
      for (let i = 0; i < 5; i++) {
        passOn(s, rng);
        run(s, 0.5);
      }
      return s.ball.pos;
    };
    expect(trace(42)).toEqual(trace(42));
    expect(trace(42)).not.toEqual(trace(43));
  });
});

describe("shooting", () => {
  it("sends the ball at the goal being attacked and makes the keeper move", () => {
    const s = fresh();
    s.possession = "home";
    s.ball.carrier = 109;
    run(s, 2);
    const keeper = s.actors.find((a) => a.side === "away" && a.keeper)!;
    const before = keeper.target.y;

    shoot(s, mulberry32(11), true);
    expect(s.ball.flight).not.toBeNull();
    expect(s.ball.flight!.to.x).toBe(PITCH_X);
    expect(s.ball.flight!.kind).toBe("shot");
    expect(keeper.target.y).not.toBe(before);
  });

  it("the ball arrives at the net, and is airborne on the way", () => {
    const s = fresh();
    s.possession = "home";
    s.ball.carrier = 109;
    run(s, 1);
    shoot(s, mulberry32(5), true);

    step(s, 0.25);
    expect(s.ball.z).toBeGreaterThan(0); // in flight
    run(s, 1.5);
    expect(s.ball.flight).toBeNull();
    expect(s.ball.z).toBe(0);
    expect(s.ball.pos.x).toBeCloseTo(PITCH_X, 5);
  });
});

describe("the penalty scene", () => {
  it("⛔ clears everyone but the taker and the keeper out of the box", () => {
    const s = fresh();
    s.possession = "home";
    penaltyScene(s, 109);
    run(s, 3);

    // The box is the last 16.5m; home attacks +x.
    const inBox = s.actors.filter((a) => a.pos.x > PITCH_X - 16.5);
    const ids = inBox.map((a) => a.playerId).sort((x, y) => x - y);
    expect(ids).toEqual([109, 200]); // the taker, and the away keeper
  });

  it("puts the ball on the spot and the keeper on his line", () => {
    const s = fresh();
    s.possession = "home";
    penaltyScene(s, 109);
    expect(s.scene).toBe("penalty");
    expect(s.ball.pos.x).toBeCloseTo(PITCH_X - 11, 5);
    expect(s.ball.pos.y).toBeCloseTo(PITCH_Y / 2, 5);
    expect(s.ball.carrier).toBeNull();

    run(s, 3);
    expect(s.actors.find((a) => a.playerId === 200)!.pos.x).toBeGreaterThan(PITCH_X - 3);
  });
});

describe("step", () => {
  it("is dt-scaled, so a fast screen does not run the match faster", () => {
    const slow = fresh();
    const fast = fresh();
    for (const s of [slow, fast]) {
      s.actors[5]!.target = vec(60, 40);
    }
    // One second, at 30 Hz and at 120 Hz.
    for (let i = 0; i < 30; i++) step(slow, 1 / 30);
    for (let i = 0; i < 120; i++) step(fast, 1 / 120);

    expect(slow.actors[5]!.pos.x).toBeCloseTo(fast.actors[5]!.pos.x, 0);
    expect(slow.actors[5]!.pos.y).toBeCloseTo(fast.actors[5]!.pos.y, 0);
  });

  it("keeps a carried ball glued to its carrier", () => {
    const s = fresh();
    s.possession = "home";
    s.ball.carrier = 105;
    run(s, 2);
    const carrier = s.actors.find((a) => a.playerId === 105)!;
    expect(len(sub(s.ball.pos, carrier.pos))).toBeLessThan(2);
  });

  it("leaves a sent-off player where he is and stops marking him", () => {
    const s = fresh();
    s.actors[5]!.off = true;
    const where = { ...s.actors[5]!.pos };
    s.possession = "away";
    run(s, 3);
    expect(s.actors[5]!.pos).toEqual(where);
  });
});

describe("resetScene", () => {
  it("returns everyone to their anchor with the ball on the centre spot", () => {
    const s = fresh();
    s.possession = "home";
    s.ball.carrier = 109;
    run(s, 3);
    kick(s, vec(80, 10), "lofted", null, 0.5);

    resetScene(s, "away");
    expect(s.possession).toBe("away");
    expect(s.ball.pos).toEqual(vec(PITCH_X / 2, PITCH_Y / 2));
    expect(s.ball.flight).toBeNull();
    for (const a of s.actors) expect(a.target).toEqual(a.anchor);
  });
});
