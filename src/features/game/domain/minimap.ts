import type { Side } from "./match-types";

/**
 * TASK-1810 — the FIFA-style mini-map, as a pure simulation.
 *
 * The owner rejected two earlier attempts: ambient random passing (unrelated to the match)
 * and a whole-team offset replay (the shape moved as one block). His requirement is the
 * FIFA mini-map read — **attackers pressing and mixing with defenders, defenders blocking
 * attackers, all tied to the events**: to score, the attacking side must be in the
 * opponent half with the ball, and the shot hitting the net is what records the goal.
 *
 * This module owns the MODEL only — coordinates, targets, velocities and the choreography
 * that turns a match event into motion. Rendering is `MiniMapCanvas`, which runs the
 * `requestAnimationFrame` loop and never touches React state per frame.
 *
 * ⛔ NO ENTROPY. Every random choice draws from a seeded `rng()` passed in by the caller,
 * exactly like the rest of `domain/`. `Math.random()` here would break the byte-for-byte
 * replay the whole Phase-18 arc rests on — and the prototype's use of it is precisely why
 * the spec says not to port that code.
 */

/** The pitch, in metres. Every coordinate in this module is in this space. */
export const PITCH_X = 105;
export const PITCH_Y = 68;

export interface Vec {
  x: number;
  y: number;
}

export type ActorState = "idle" | "running" | "pressing" | "carrying" | "shooting" | "keeper";

export interface Actor {
  playerId: number;
  side: Side;
  number: number;
  /** Formation anchor — where he stands when nothing is happening. */
  anchor: Vec;
  pos: Vec;
  target: Vec;
  /** Velocity, metres per second. Kept so the renderer can lean a dot into its run. */
  vel: Vec;
  state: ActorState;
  /**
   * ⚠️ Explicit, never "index 0 of the list".
   *
   * Filtering by side and reading `[0]` breaks the moment a keeper is sent off: the array
   * shifts and an outfielder inherits the goal line while the real goal stands empty.
   */
  keeper: boolean;
  /** Carrying a yellow. Drawn as a ring on his dot, not only listed in the feed. */
  booked: boolean;
  /** True once sent off — the renderer drops him and nothing marks him. */
  off: boolean;
}

export type FlightKind = "ground" | "lofted" | "shot";

export interface Flight {
  from: Vec;
  to: Vec;
  /** 0..1 through the flight. */
  t: number;
  /** Seconds the flight takes. */
  dur: number;
  /** Peak height in metres. Ground passes are 0. */
  height: number;
  kind: FlightKind;
}

export interface Ball {
  pos: Vec;
  /** Height above the turf. Drives the shadow offset and the dot's scale. */
  z: number;
  /** Whose feet it is at, or null while it is travelling. */
  carrier: number | null;
  flight: Flight | null;
}

export type Scene = "open" | "penalty" | "celebration";

export interface MiniMapState {
  actors: Actor[];
  ball: Ball;
  /** Which way each side attacks. Home always attacks +x. */
  possession: Side;
  scene: Scene;
  /** Seconds the current scene has been running. */
  sceneT: number;
}

/* ------------------------------------------------------------------ vectors */

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => vec(a.x + b.x, a.y + b.y);
export const sub = (a: Vec, b: Vec): Vec => vec(a.x - b.x, a.y - b.y);
export const scale = (a: Vec, k: number): Vec => vec(a.x * k, a.y * k);
export const len = (a: Vec): number => Math.hypot(a.x, a.y);

export function norm(a: Vec): Vec {
  const l = len(a);
  return l === 0 ? vec(0, 0) : vec(a.x / l, a.y / l);
}

/** Linear interpolation — the smoothing that keeps a dot from teleporting. */
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const lerpVec = (a: Vec, b: Vec, k: number): Vec =>
  vec(lerp(a.x, b.x, k), lerp(a.y, b.y, k));

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const inPitch = (p: Vec): Vec => vec(clamp(p.x, 1, PITCH_X - 1), clamp(p.y, 2, PITCH_Y - 2));

/**
 * A ball's height at `t`, as a parabola peaking at `h`.
 *
 * `z(t) = 4h·t·(1−t)` — zero at both ends, `h` at the midpoint. Cheap, and it reads
 * correctly as an arc without needing real physics.
 */
export const arcHeight = (t: number, h: number): number => 4 * h * t * (1 - t);

/** Where a side is attacking. Home attacks +x, away attacks −x. */
export const goalOf = (side: Side): Vec =>
  side === "home" ? vec(PITCH_X, PITCH_Y / 2) : vec(0, PITCH_Y / 2);

/* ------------------------------------------------------------------- layout */

export interface SlotLike {
  row: number;
  col: number;
}

/**
 * Turn formation slots into pitch anchors.
 *
 * `row` runs from the goalkeeper line toward the opponent; `col` runs across. Home
 * occupies the left half at rest and away is mirrored, so the two shapes face each other.
 */
export function anchorsFor(slots: readonly SlotLike[], side: Side): Vec[] {
  const rows = Math.max(1, ...slots.map((s) => s.row));
  return slots.map((s) => {
    const perRow = slots.filter((x) => x.row === s.row).length;
    // Half the pitch each, with the keeper tucked near his own line.
    const depth = (s.row / (rows + 1)) * (PITCH_X / 2);
    const across = (s.col / (perRow + 1)) * PITCH_Y;
    return side === "home" ? vec(depth, across) : vec(PITCH_X - depth, PITCH_Y - across);
  });
}

/* -------------------------------------------------------------- construction */

export interface SideSpec {
  slots: readonly SlotLike[];
  players: readonly { playerId: number; number: number }[];
}

export function createState(home: SideSpec, away: SideSpec): MiniMapState {
  const build = (spec: SideSpec, side: Side): Actor[] => {
    const anchors = anchorsFor(spec.slots, side);
    return spec.players.map((p, i) => {
      const anchor = anchors[i] ?? vec(PITCH_X / 2, PITCH_Y / 2);
      return {
        playerId: p.playerId,
        side,
        number: p.number,
        anchor,
        pos: { ...anchor },
        target: { ...anchor },
        vel: vec(0, 0),
        state: i === 0 ? "keeper" : "idle",
        keeper: i === 0,
        booked: false,
        off: false,
      };
    });
  };
  return {
    actors: [...build(home, "home"), ...build(away, "away")],
    ball: { pos: vec(PITCH_X / 2, PITCH_Y / 2), z: 0, carrier: null, flight: null },
    possession: "home",
    scene: "open",
    sceneT: 0,
  };
}

/* ------------------------------------------------------------- choreography */

/** The outfielder of `side` nearest a point. Used for pressing and for pass targets. */
export function nearest(actors: Actor[], side: Side, p: Vec, exclude?: number): Actor | null {
  let best: Actor | null = null;
  let bestD = Infinity;
  for (const a of actors) {
    if (a.side !== side || a.off || a.playerId === exclude) continue;
    const d = len(sub(a.pos, p));
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/**
 * Re-aim every actor for the current situation.
 *
 * ⭐ This is the part the owner's two rejected attempts got wrong. It is NOT a whole-team
 * offset: each actor gets his own target.
 *
 * - The attacking side pushes toward the goal it is attacking, fanning as it advances.
 * - **Every defender MARKS a specific opponent** — goal-side of him, between his man and
 *   his own goal. That is what makes the two sets of dots mix instead of sitting in
 *   separate blocks.
 * - **The nearest defender PRESSES the carrier** rather than marking.
 * - Keepers hold their line and shuffle across with the ball.
 *
 * Returns the marking assignment (defender playerId -> the attacker he is picking up) so
 * the renderer can draw it and a test can assert the pairing it actually made.
 */
export interface AimResult {
  marking: Map<number, number>;
  presser: number | null;
}

export function aim(state: MiniMapState): AimResult {
  // ⛔ A set-piece scene OWNS its targets. `penaltyScene` clears twenty players out of the
  // box and puts the keeper on his line; re-aiming them the next frame drags everybody
  // straight back and the penalty reads as an ordinary shot. Only open play is aimed.
  if (state.scene !== "open") return { marking: new Map(), presser: null };

  const { actors, ball, possession } = state;
  const attackers = actors.filter((a) => a.side === possession && !a.off);
  const defenders = actors.filter((a) => a.side !== possession && !a.off);
  const attackGoal = goalOf(possession);
  const ownGoal = goalOf(possession === "home" ? "away" : "home");

  // How far up the pitch the move has progressed, 0..1.
  const progress = clamp(
    possession === "home" ? ball.pos.x / PITCH_X : 1 - ball.pos.x / PITCH_X,
    0,
    1,
  );

  attackers.forEach((a) => {
    if (a.keeper) {
      // Keeper: stay on his line, drift across with the ball.
      a.state = "keeper";
      a.target = vec(ownGoal.x === 0 ? 4 : PITCH_X - 4, lerp(PITCH_Y / 2, ball.pos.y, 0.35));
      return;
    }
    if (a.playerId === ball.carrier) {
      a.state = "carrying";
      // Carry toward goal, but not through it.
      a.target = inPitch(add(a.pos, scale(norm(sub(attackGoal, a.pos)), 6)));
      return;
    }
    a.state = "running";
    // Push up with the move; the further on it is, the higher the line.
    const push = (attackGoal.x - a.anchor.x) * 0.6 * progress;
    // Fan out toward the ball's side of the pitch so the shape breathes.
    const drift = (ball.pos.y - a.anchor.y) * 0.18;
    a.target = inPitch(vec(a.anchor.x + push, a.anchor.y + drift));
  });

  const carrier = actors.find((a) => a.playerId === ball.carrier) ?? null;
  const defendingSide: Side = possession === "home" ? "away" : "home";
  // Only an outfielder presses — a keeper leaving his line to chase the ball reads as a bug.
  const presser =
    carrier != null
      ? nearest(
          defenders.filter((d) => !d.keeper),
          defendingSide,
          carrier.pos,
        )
      : null;

  // ⭐ ONE-TO-ONE marking, assigned greedily by distance.
  //
  // Marking "the nearest attacker" independently let three defenders converge on one man
  // while others ran free — the dots clustered into two blocks, which is exactly the read
  // the owner rejected twice. Assigning each attacker at most one marker is what makes the
  // two sets interleave.
  const markable = attackers.filter((a) => !a.keeper && a.playerId !== ball.carrier);
  const markers = defenders.filter(
    (d) => !d.keeper && (presser == null || d.playerId !== presser.playerId),
  );
  const pairs: Array<{ d: Actor; a: Actor; dist: number }> = [];
  for (const d of markers) {
    for (const a of markable) pairs.push({ d, a, dist: len(sub(d.pos, a.pos)) });
  }
  pairs.sort((p, q) => p.dist - q.dist);
  const takenD = new Set<number>();
  const takenA = new Set<number>();
  const assignment = new Map<number, Actor>();
  for (const { d, a } of pairs) {
    if (takenD.has(d.playerId) || takenA.has(a.playerId)) continue;
    takenD.add(d.playerId);
    takenA.add(a.playerId);
    assignment.set(d.playerId, a);
  }

  defenders.forEach((d) => {
    if (d.keeper) {
      d.state = "keeper";
      d.target = vec(attackGoal.x === 0 ? 4 : PITCH_X - 4, lerp(PITCH_Y / 2, ball.pos.y, 0.45));
      return;
    }
    if (presser != null && d.playerId === presser.playerId && carrier != null) {
      // ⚠️ LEADS the carrier rather than chasing where he is.
      //
      // The carrier moves goalward every frame, so a presser aimed at his current position
      // lerps toward a receding target and settles ~4.6m behind — the defence never makes
      // contact and the map reads as two shapes passing through each other. Aiming at
      // where he WILL be closes the gap.
      d.state = "pressing";
      const lead = add(carrier.pos, scale(carrier.vel, 0.35));
      d.target = inPitch(add(lead, scale(norm(sub(attackGoal, lead)), 0.6)));
      return;
    }
    const man = assignment.get(d.playerId);
    d.state = "running";
    if (man == null) {
      d.target = { ...d.anchor };
      return;
    }
    // Goal-side: between his man and the goal that man is attacking.
    //
    // ⚠️ LEADS him, for the same reason the press does. Aimed at where the man stands, a
    // marker lerps toward a receding target and settles BEHIND him — the opposite of
    // goal-side, and the defence stops looking like it is defending anything.
    const ahead = add(man.pos, scale(man.vel, 0.35));
    const goalSide = norm(sub(attackGoal, ahead));
    d.target = inPitch(add(ahead, scale(goalSide, 1.9)));
  });

  return {
    marking: new Map([...assignment].map(([dId, a]) => [dId, a.playerId])),
    presser: presser?.playerId ?? null,
  };
}

/* ------------------------------------------------------------------ stepping */

/** How quickly a dot closes on its target. Higher is snappier. */
const SMOOTH = 2.6;

/**
 * Advance the simulation by `dt` seconds.
 *
 * ⚠️ `dt`-scaled, never per-frame-constant: a 144 Hz screen must not run the match faster
 * than a 60 Hz one.
 */
export function step(state: MiniMapState, dt: number): void {
  state.sceneT += dt;
  const k = clamp(SMOOTH * dt, 0, 1);

  for (const a of state.actors) {
    if (a.off) continue;
    // A player sprinting to close down covers ground faster than one holding shape.
    const eager = a.state === "pressing" ? 1.7 : 1;
    const next = lerpVec(a.pos, a.target, clamp(k * eager, 0, 1));
    a.vel = scale(sub(next, a.pos), dt === 0 ? 0 : 1 / dt);
    a.pos = next;
  }

  const { ball } = state;
  if (ball.flight != null) {
    const f = ball.flight;
    f.t = clamp(f.t + dt / f.dur, 0, 1);
    ball.pos = lerpVec(f.from, f.to, f.t);
    ball.z = arcHeight(f.t, f.height);
    if (f.t >= 1) {
      ball.flight = null;
      ball.z = 0;
    }
  } else if (ball.carrier != null) {
    // Glued just ahead of the carrier's feet.
    const c = state.actors.find((a) => a.playerId === ball.carrier);
    if (c != null) {
      ball.pos = add(c.pos, scale(norm(c.vel), 1.1));
      ball.z = 0;
    }
  }
}

/* -------------------------------------------------------------------- events */

/** Send the ball from its carrier to `to`, and hand possession over on arrival. */
export function kick(
  state: MiniMapState,
  to: Vec,
  kind: FlightKind,
  receiver: number | null,
  dur: number,
): void {
  const from = { ...state.ball.pos };
  state.ball.flight = {
    from,
    to,
    t: 0,
    dur,
    height: kind === "ground" ? 0 : kind === "lofted" ? 6 : 2.2,
    kind,
  };
  state.ball.carrier = receiver;
}

/**
 * A pass inside the possessing side, chosen with the SEEDED rng.
 *
 * ⚠️ Deliberately biased FORWARD. The owner's first rejection was random passing that
 * went nowhere; a pass here always prefers a team-mate closer to the goal being attacked,
 * so possession visibly travels up the pitch and arrives in the opponent half before a
 * shot is taken.
 */
export function passOn(state: MiniMapState, rng: () => number): void {
  const mates = state.actors.filter(
    (a) => a.side === state.possession && !a.off && a.playerId !== state.ball.carrier,
  );
  if (mates.length === 0) return;
  const goal = goalOf(state.possession);
  const ahead = mates
    .filter((m) => !m.keeper) // never back to the keeper
    .sort((a, b) => len(sub(a.pos, goal)) - len(sub(b.pos, goal)));
  if (ahead.length === 0) return;
  // Pick from the three most advanced, so it is forward but not identical every time.
  const pick = ahead[Math.floor(rng() * Math.min(3, ahead.length))] ?? ahead[0]!;
  const lofted = rng() < 0.25;
  kick(state, { ...pick.pos }, lofted ? "lofted" : "ground", pick.playerId, lofted ? 0.9 : 0.55);
}

/**
 * Take a shot at the goal being attacked.
 *
 * `onTarget` decides whether it beats the keeper. The keeper dives toward the placement
 * either way — a save that never moves reads as a bug.
 */
export function shoot(state: MiniMapState, rng: () => number, scores: boolean): void {
  const goal = goalOf(state.possession);
  const spread = (rng() - 0.5) * 14;
  const to = vec(goal.x, clamp(PITCH_Y / 2 + spread, PITCH_Y / 2 - 7, PITCH_Y / 2 + 7));
  kick(state, to, "shot", null, 0.55);

  const keeper = state.actors.find((a) => a.side !== state.possession && a.keeper && !a.off);
  if (keeper != null) {
    // Dive toward the ball — short of it when it goes in, onto it when it is saved.
    keeper.target = vec(keeper.pos.x, lerp(keeper.pos.y, to.y, scores ? 0.55 : 1));
  }
  const carrier = state.actors.find((a) => a.playerId === state.ball.carrier);
  if (carrier != null) carrier.state = "shooting";
}

/**
 * The penalty scene (spec §3, and the owner's plan).
 *
 * ⛔ Everyone except the taker and the keeper is cleared OUTSIDE the box, which is what
 * makes it legible as a penalty rather than as an ordinary shot.
 */
export function penaltyScene(state: MiniMapState, taker: number): void {
  state.scene = "penalty";
  state.sceneT = 0;
  const attacking = state.possession;
  const goal = goalOf(attacking);
  const spotX = attacking === "home" ? PITCH_X - 11 : 11;
  state.ball.carrier = null;
  state.ball.flight = null;
  state.ball.pos = vec(spotX, PITCH_Y / 2);
  state.ball.z = 0;

  let cleared = 0;
  for (const a of state.actors) {
    if (a.off) continue;
    if (a.playerId === taker) {
      a.state = "carrying";
      a.target = vec(attacking === "home" ? spotX - 4 : spotX + 4, PITCH_Y / 2);
      continue;
    }
    if (a.keeper && a.side !== attacking) {
      a.target = vec(goal.x === 0 ? 1.5 : PITCH_X - 1.5, PITCH_Y / 2);
      continue;
    }
    // Everyone else waits outside the arc, spread along the pitch.
    const lane = (cleared % 10) / 10;
    cleared += 1;
    a.state = "idle";
    a.target = vec(
      attacking === "home" ? spotX - 22 - (cleared % 3) * 4 : spotX + 22 + (cleared % 3) * 4,
      4 + lane * (PITCH_Y - 8),
    );
  }
}

/** Kick-off / restart: everyone back to their anchor, ball on the centre spot. */
export function resetScene(state: MiniMapState, possession: Side): void {
  state.scene = "open";
  state.sceneT = 0;
  state.possession = possession;
  state.ball.carrier = null;
  state.ball.flight = null;
  state.ball.pos = vec(PITCH_X / 2, PITCH_Y / 2);
  state.ball.z = 0;
  for (const a of state.actors) {
    a.target = { ...a.anchor };
    a.state = a.keeper ? "keeper" : "idle";
  }
}
