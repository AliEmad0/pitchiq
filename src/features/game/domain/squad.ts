import type { InjurySeverity, KeeperOutcome, SubReason } from "./match-types";
import type { GamePlayer } from "./player";

/**
 * TASK-1822 Phase 4 — substitutions, injuries and the sweeper keeper.
 *
 * The first phase that needs a BENCH. Everything before it only ever cared about the
 * eleven on the pitch, which is why `GameTeam.bench` arrives here rather than earlier.
 */

/** Modern maximum. A side that runs out simply plays on. */
export const MAX_SUBS = 5;

/** Managers make changes in the last half-hour, not the first. */
export const SUB_WINDOW_START = 55;
export const SUB_WINDOW_END = 85;

/** Planned changes per side per match, spread across the window. */
export const SUBS_PER_SIDE = 2.6;

/** Injuries per side per match, across all three severities. */
export const INJURY_PER_SIDE = 0.55;

const INJURY_BRANCHES: [InjurySeverity, number][] = [
  ["knock", 0.62],
  ["moderate", 0.28],
  ["severe", 0.1],
];

export function resolveInjury(r: number): InjurySeverity {
  let acc = 0;
  for (const [severity, weight] of INJURY_BRANCHES) {
    acc += weight;
    if (r < acc) return severity;
  }
  return "knock";
}

/** A knock keeps the player on but hurting, for a few minutes. */
export const KNOCK_MINUTES = 8;

/** Keeper sweeps outside his area this often per side per match. */
export const KEEPER_SWEEP_PER_SIDE = 0.35;

/**
 * Mostly heroic. The blunder branches are rare on purpose — a keeper sent off or
 * lobbed from the halfway line is a story precisely because it almost never happens.
 */
const KEEPER_BRANCHES: [KeeperOutcome, number][] = [
  ["clearance", 0.88],
  ["sent-off", 0.07],
  ["punished", 0.05],
];

export function resolveKeeper(r: number): KeeperOutcome {
  let acc = 0;
  for (const [outcome, weight] of KEEPER_BRANCHES) {
    acc += weight;
    if (r < acc) return outcome;
  }
  return "clearance";
}

/** Expected goals per match conceded to keeper blunders — see the calibration rule. */
export function keeperGoalRate(): number {
  const punished = KEEPER_BRANCHES.find(([o]) => o === "punished")?.[1] ?? 0;
  return KEEPER_SWEEP_PER_SIDE * 2 * punished;
}

/**
 * Who comes off.
 *
 * Priority order matches how a manager actually thinks: protect a booked player from a
 * second yellow first, then replace whoever is running on empty. `physical` is the best
 * proxy the rating model offers for staying power.
 */
export function pickPlayerOff(
  onPitch: GamePlayer[],
  bookedIds: ReadonlySet<number>,
  gameState: "trailing" | "leading" | "level",
): { player: GamePlayer; reason: SubReason } | null {
  const outfield = onPitch.filter((p) => p.role !== "GK");
  if (outfield.length === 0) return null;

  const atRisk = outfield.filter((p) => bookedIds.has(p.playerId));
  if (atRisk.length > 0) {
    // Hook the booked player with the worst discipline — the one most likely to go again.
    const worst = atRisk.reduce((a, b) =>
      (a.ratings?.discipline ?? 50) <= (b.ratings?.discipline ?? 50) ? a : b,
    );
    return { player: worst, reason: "discipline" };
  }

  const tiring = outfield.reduce((a, b) =>
    (a.ratings?.physical ?? 50) <= (b.ratings?.physical ?? 50) ? a : b,
  );
  // The REASON is the manager's, not the player's. With the game in the balance a
  // change is about legs; chasing or protecting a result, it is about shape.
  //
  // An earlier version labelled it from the tiring player's own `physical` rating —
  // but since this always picks the LOWEST-rated player on the pitch, that threshold
  // could never be cleared and "tactical" was unreachable.
  return { player: tiring, reason: gameState === "level" ? "stamina" : "tactical" };
}

/**
 * Who comes on: prefer a like-for-like replacement, then any outfielder, then anyone.
 *
 * ⚠️ The middle step exists because the bench is drafted in `BENCH_SHAPE` order, which
 * puts the spare keeper FIRST — so a plain `free[0]` fallback handed the goalkeeper to
 * any substitution whose matching role was already used, and the side finished with two
 * keepers on the pitch and one of them playing centre-back. Not a rare corner: it fired
 * whenever the like-for-like was taken.
 *
 * Worse than cosmetic, too — `powerOf` folds the substitute's ratings into an outfield
 * role, so the side was quietly weaker than its own teamsheet claimed.
 *
 * The exclusion is deliberately NOT unconditional: when a keeper is the one going off,
 * the backup is exactly who should come on, which is what the sweeper-keeper dismissal
 * path depends on. And a keeper is still better than refusing the change and playing a
 * man short, so he remains the last resort.
 */
export function pickPlayerOn(
  bench: GamePlayer[],
  available: ReadonlySet<number>,
  role: string | null,
): GamePlayer | null {
  const free = bench.filter((p) => available.has(p.playerId));
  if (free.length === 0) return null;
  const likeForLike = free.find((p) => p.role === role);
  if (likeForLike != null) return likeForLike;
  if (role === "GK") return free[0];
  return free.find((p) => p.role !== "GK") ?? free[0];
}
