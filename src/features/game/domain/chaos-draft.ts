import type { PlayerRole } from "@/data/schemas";
import { canPlay } from "./eligibility";
import type { Formation, FormationSlot } from "./formation";
import type { Opponent, TacticalStyle } from "./opponent";
import type { GamePlayer } from "./player";
import { mulberry32 } from "./rng";
import { type GameTeam, makeGameTeam } from "./team";

// TASK-1806 — Chaos Draft. A fully-randomised squad, drafted from a build-time
// card pool, seeded so a draft replays from its seed. Pure + client-safe.

/** A poolable card = a rated player-season plus its club (for the card face). */
export type PoolCard = GamePlayer & { club: string };

const slot = (row: number, col: number, role: PlayerRole): FormationSlot => ({ row, col, role });
const formation = (name: string, slots: FormationSlot[]): Formation => ({ name, season: 0, slots });

/** A few real-role formations (proper roles → meaningful `canPlay` eligibility). */
export const FORMATIONS: Formation[] = [
  formation("4-4-2", [
    slot(1, 1, "GK"),
    slot(2, 1, "LB"),
    slot(2, 2, "CB"),
    slot(2, 3, "CB"),
    slot(2, 4, "RB"),
    slot(3, 1, "LM"),
    slot(3, 2, "CM"),
    slot(3, 3, "CM"),
    slot(3, 4, "RM"),
    slot(4, 1, "CF"),
    slot(4, 2, "CF"),
  ]),
  formation("4-3-3", [
    slot(1, 1, "GK"),
    slot(2, 1, "LB"),
    slot(2, 2, "CB"),
    slot(2, 3, "CB"),
    slot(2, 4, "RB"),
    slot(3, 1, "CDM"),
    slot(3, 2, "CM"),
    slot(3, 3, "CM"),
    slot(4, 1, "LW"),
    slot(4, 2, "CF"),
    slot(4, 3, "RW"),
  ]),
  formation("3-5-2", [
    slot(1, 1, "GK"),
    slot(2, 1, "CB"),
    slot(2, 2, "CB"),
    slot(2, 3, "CB"),
    slot(3, 1, "LM"),
    slot(3, 2, "CM"),
    slot(3, 3, "CAM"),
    slot(3, 4, "CM"),
    slot(3, 5, "RM"),
    slot(4, 1, "CF"),
    slot(4, 2, "CF"),
  ]),
  formation("4-2-3-1", [
    slot(1, 1, "GK"),
    slot(2, 1, "LB"),
    slot(2, 2, "CB"),
    slot(2, 3, "CB"),
    slot(2, 4, "RB"),
    slot(3, 1, "CDM"),
    slot(3, 2, "CDM"),
    slot(4, 1, "LW"),
    slot(4, 2, "CAM"),
    slot(4, 3, "RW"),
    slot(5, 1, "CF"),
  ]),
];

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

/**
 * Draft a full XI from the pool: a random formation, then a random ELIGIBLE card
 * per slot (falling back to any unused card). Deterministic from `seed`.
 */
export function chaosDraft(pool: PoolCard[], seed: number, name = "Your XI"): GameTeam {
  const rng = mulberry32(seed);
  const shape = pick(FORMATIONS, rng);
  const used = new Set<number>();
  const chosen: PoolCard[] = [];
  for (const s of shape.slots) {
    const eligible = pool.filter((c) => !used.has(c.playerId) && canPlay(c, s.role));
    const anyFree = pool.filter((c) => !used.has(c.playerId));
    const from = eligible.length ? eligible : anyFree;
    if (from.length === 0) break;
    const card = pick(from, rng);
    used.add(card.playerId);
    chosen.push(card);
  }
  return makeGameTeam(-1, name, 0, shape, chosen);
}

const STYLES: TacticalStyle[] = [
  "balanced",
  "tiki-taka",
  "high-press",
  "low-block",
  "counter",
  "direct",
];

export interface ChaosMatchup {
  home: GameTeam;
  homeStyle: TacticalStyle;
  opponent: Opponent; // { kind: "squad" } — a second random XI, so the pitch fills
}

/** Draft your XI plus a distinct auto-drafted opponent, each with a seeded style. */
export function chaosMatchup(
  pool: PoolCard[],
  seed: number,
  names: { home: string; away: string } = { home: "Your XI", away: "Rivals" },
): ChaosMatchup {
  const home = chaosDraft(pool, seed, names.home);
  const away = chaosDraft(pool, seed ^ 0x9e3779b9, names.away);
  const sr = mulberry32(seed ^ 0x51ed270b);
  return {
    home,
    homeStyle: pick(STYLES, sr),
    opponent: { kind: "squad", team: away, style: pick(STYLES, sr) },
  };
}
