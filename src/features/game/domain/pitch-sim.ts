import type { PlayerRole } from "@/data/schemas";
import type { Side } from "./match-types";

// A lightweight, seeded AMBIENT possession model for the live pitch mini-map.
// It is *flavour*, layered over the authoritative engine: the real goals/cards
// come from `simulate()`; this only decides which player holds the ball and how
// the shape shifts between them (passing, pushing up, retreating, shots → saves).
// The ball is ALWAYS anchored to a real player — a pass moves it from one
// player to another; only a shot leaves a foot (toward goal) and a save returns
// it to the keeper. Seeded so a match replays identically. Coordinates are
// normalised [0,1]: x 0 = home goal … 1 = away goal; y 0 = top … 1 = bottom.

export type SimPhase = "kickoff" | "open" | "shot" | "save" | "goal" | "buildup" | "rest";

export interface SimState {
  possession: Side;
  holder: number; // index 0..10 into the team in possession (0 = GK)
  phase: SimPhase;
}

export interface SlotLike {
  row: number;
  col: number;
  role: PlayerRole;
}
export interface SimContext {
  home: readonly SlotLike[];
  away: readonly SlotLike[];
}

const other = (s: Side): Side => (s === "home" ? "away" : "home");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const slotsOf = (ctx: SimContext, side: Side) => (side === "home" ? ctx.home : ctx.away);
const outfield = (slots: readonly SlotLike[]) =>
  slots.map((_, i) => i).filter((i) => slots[i].role !== "GK");
const maxRow = (slots: readonly SlotLike[]) => Math.max(...slots.map((s) => s.row));

export function initSim(): SimState {
  return { possession: "home", holder: 6, phase: "kickoff" };
}

/** Neutral resting frame — both teams in formation, ball on the centre spot.
 * Used before kick-off under reduced motion and after full-time. */
export function restSim(): SimState {
  return { possession: "home", holder: -1, phase: "rest" };
}

/** Advance the ambient possession one beat. Pure given the rng draw + context. */
export function stepSim(s: SimState, ctx: SimContext, rng: () => number): SimState {
  // A shot from the previous beat → the keeper claims it (real goals are only
  // ever engine-injected, never invented here).
  if (s.phase === "shot") {
    return { possession: other(s.possession), holder: 0, phase: "save" };
  }
  // A goal restarts from the centre with the conceding side.
  if (s.phase === "goal") {
    return { possession: other(s.possession), holder: 6, phase: "kickoff" };
  }

  const slots = slotsOf(ctx, s.possession);
  const holderRow = slots[s.holder]?.row ?? 1;
  const roll = rng();

  // A forward in possession may shoot.
  if (holderRow >= maxRow(slots) && roll < 0.4) {
    return { possession: s.possession, holder: s.holder, phase: "shot" };
  }
  // Turnover — the other side wins it back through an outfielder.
  if (roll < 0.15) {
    const def = outfield(slotsOf(ctx, other(s.possession)));
    return {
      possession: other(s.possession),
      holder: def[Math.floor(rng() * def.length)],
      phase: "open",
    };
  }
  // Pass — to a NEARBY teammate (within one formation line) so the ball never
  // flies the length of the pitch to empty space; bias slightly forward.
  const mates = outfield(slots).filter((i) => i !== s.holder);
  const near = mates.filter((i) => Math.abs(slots[i].row - holderRow) <= 1);
  const nearFwd = near.filter((i) => slots[i].row >= holderRow);
  const pool = nearFwd.length && rng() < 0.6 ? nearFwd : near.length ? near : mates;
  const holder = pool.length ? pool[Math.floor(rng() * pool.length)] : s.holder;
  return { possession: s.possession, holder, phase: "open" };
}

/** Engine goal: the scorer celebrates by their goal, ball in the net. */
export function goalKick(scoringSide: Side, scorerSlot: number): SimState {
  return { possession: scoringSide, holder: scorerSlot, phase: "goal" };
}

/** The beat BEFORE an engine goal — the scoring side pushes into the opponent
 * half, ball at the eventual scorer's feet, so the goal reads as earned. */
export function buildUp(scoringSide: Side, scorerSlot: number): SimState {
  return { possession: scoringSide, holder: scorerSlot, phase: "buildup" };
}

export interface SimDot {
  x: number;
  y: number;
  scale: number;
  holder: boolean;
}
export interface Frame {
  home: SimDot[];
  away: SimDot[];
  ball: { x: number; y: number };
  /** When true the ball is at a player's feet (render it on the holder, never in
   * empty space); when false it is in flight to goal / in the net / on the spot. */
  ballOnHolder: boolean;
  holderSide: Side | null;
  holderIndex: number;
}

const MARGIN_Y = 0.1;
const HOME_X0 = 0.07;
const SPREAD_X = 0.39;
const HOLDER_PUSH = 0.09;
const ATTACK_PUSH = 0.12;
const ATTACK_PUSH_BUILDUP = 0.24;
const LANE_PULL_ATK = 0.3;
const RETREAT = 0.12;
const LANE_PULL_DEF = 0.26;
const PRESS = 0.5;
const HOLDER_SCALE = 1.18;

/** Resting normalised positions for a side's XI, ordered to slots. */
export function baseLayout(slots: readonly SlotLike[], side: Side): { x: number; y: number }[] {
  const byRow = new Map<number, number[]>();
  slots.forEach((sl, i) => {
    const arr = byRow.get(sl.row) ?? [];
    arr.push(i);
    byRow.set(sl.row, arr);
  });
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const out: { x: number; y: number }[] = new Array(slots.length);
  rows.forEach((row, r) => {
    const idxs = byRow.get(row)!.sort((a, b) => slots[a].col - slots[b].col);
    const frac = rows.length > 1 ? r / (rows.length - 1) : 0;
    const x = side === "home" ? HOME_X0 + frac * SPREAD_X : 1 - HOME_X0 - frac * SPREAD_X;
    idxs.forEach((idx, i) => {
      const yFrac = (i + 1) / (idxs.length + 1);
      out[idx] = { x, y: MARGIN_Y + yFrac * (1 - 2 * MARGIN_Y) };
    });
  });
  return out;
}

function nearestOutfield(
  base: { x: number; y: number }[],
  slots: readonly SlotLike[],
  ball: { x: number; y: number },
) {
  let idx = -1;
  let best = Infinity;
  base.forEach((b, i) => {
    if (slots[i].role === "GK") return;
    const d = (b.x - ball.x) ** 2 + (b.y - ball.y) ** 2;
    if (d < best) {
      best = d;
      idx = i;
    }
  });
  return idx;
}

/** Compute the render frame (all 22 targets + ball) for a sim state. Pure. The
 * ball is derived from the holder's position (or the goal, for a shot/goal). */
export function frameFromSim(
  home: readonly SlotLike[],
  away: readonly SlotLike[],
  s: SimState,
): Frame {
  if (s.phase === "rest") {
    const rest = (slots: readonly SlotLike[], side: Side): SimDot[] =>
      baseLayout(slots, side).map((p) => ({ x: p.x, y: p.y, scale: 1, holder: false }));
    return {
      home: rest(home, "home"),
      away: rest(away, "away"),
      ball: { x: 0.5, y: 0.5 },
      ballOnHolder: false,
      holderSide: null,
      holderIndex: -1,
    };
  }
  const atk = s.possession;
  const dir = atk === "home" ? 1 : -1;
  const atkSlots = atk === "home" ? home : away;
  const atkBase = baseLayout(atkSlots, atk);
  const defSide = other(atk);
  const defSlots = defSide === "home" ? home : away;
  const defBase = baseLayout(defSlots, defSide);

  // Where the player on the ball is standing.
  const hb = atkBase[s.holder] ?? { x: 0.5, y: 0.5 };
  const holderGk = atkSlots[s.holder]?.role === "GK";
  const holderX =
    s.phase === "goal"
      ? dir > 0
        ? 0.9
        : 0.1
      : holderGk
        ? hb.x
        : s.phase === "buildup"
          ? dir > 0
            ? Math.max(hb.x + 0.2, 0.62) // clearly inside the opponent half
            : Math.min(hb.x - 0.2, 0.38)
          : clamp(hb.x + dir * HOLDER_PUSH, 0.06, 0.94);
  const holderPos = { x: clamp(holderX, 0.04, 0.96), y: hb.y };
  const push = s.phase === "buildup" ? ATTACK_PUSH_BUILDUP : ATTACK_PUSH;

  const ball =
    s.phase === "shot"
      ? { x: dir > 0 ? 0.985 : 0.015, y: holderPos.y }
      : s.phase === "goal"
        ? { x: dir > 0 ? 0.996 : 0.004, y: 0.5 }
        : holderPos;

  const presser = nearestOutfield(defBase, defSlots, ball);
  const lunging = s.phase === "shot" || s.phase === "goal";

  const attackers: SimDot[] = atkSlots.map((sl, i) => {
    if (i === s.holder) return { ...holderPos, scale: HOLDER_SCALE, holder: true };
    if (sl.role === "GK") return { ...atkBase[i], scale: 1, holder: false };
    return {
      x: clamp(atkBase[i].x + dir * push, 0.05, 0.95),
      y: lerp(atkBase[i].y, holderPos.y, LANE_PULL_ATK),
      scale: 1,
      holder: false,
    };
  });

  const ownGoalX = defSide === "home" ? 0 : 1;
  const defenders: SimDot[] = defSlots.map((sl, i) => {
    if (sl.role === "GK") {
      const gx = ownGoalX === 0 ? 0.035 : 0.965;
      return {
        x: lunging ? lerp(gx, ball.x, 0.14) : gx,
        y: lerp(0.5, ball.y, lunging ? 0.75 : 0.45),
        scale: 1,
        holder: false,
      };
    }
    if (i === presser) {
      return {
        x: lerp(defBase[i].x, ball.x, PRESS),
        y: lerp(defBase[i].y, ball.y, PRESS),
        scale: 1,
        holder: false,
      };
    }
    return {
      x: lerp(defBase[i].x, ownGoalX, RETREAT),
      y: lerp(defBase[i].y, ball.y, LANE_PULL_DEF),
      scale: 1,
      holder: false,
    };
  });

  return {
    home: atk === "home" ? attackers : defenders,
    away: atk === "home" ? defenders : attackers,
    ball,
    ballOnHolder: s.phase !== "shot" && s.phase !== "goal",
    holderSide: atk,
    holderIndex: s.holder,
  };
}
