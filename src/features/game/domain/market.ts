import { chaosDraft, type PoolCard } from "./chaos-draft";
import { canPlay } from "./eligibility";
import { formationByName } from "./formation";
import type { MatchSetup, Modifier, Side } from "./match-types";
import { mulberry32 } from "./rng";
import { fixtureSeed } from "./season";
import { reservePlayers } from "./season-availability";
import { makeGameTeam, type GameTeam } from "./team";
import { type CraftedTraits, personalityModifier, type TraitId } from "./traits";

/**
 * TASK-1818 — the Mystery Market: a roguelike run (owner, 2026-10-21: "opening a high-stakes loot
 * pack — suspenseful, rewarding, full of tactical potential … a huge boost with a risky catch").
 *
 * Start with the weakest legal XI in the pool. Every match is harder than the last. A win opens a
 * pack of three face-down rewards and you keep ONE; a draw is neither; three defeats end the run.
 *
 * ⛔ PURE and seeded: the opponent, the pack and every signing are derived from `(seed, round)`,
 * so a run is reproducible from what it stores. Results are STORED, never replayed — the season
 * rule — which is also why traits and crafted badges may play here without a share-code flag.
 */

export const LIVES = 3;
/** The shape every run starts in. A run is about rewards, not tactics boards. */
export const MARKET_SHAPE = "4-4-2 Flat";

export type RewardId =
  | "marquee"
  | "wonderkid"
  | "gegenpress"
  | "ironCurtain"
  | "talismanTonic"
  | "physio";

/**
 * The rewards. ⛔ FROZEN like `DAILY_SHAPES`: a pack is `seed`-drawn from this list by index, so
 * reordering or appending re-deals every stored run's packs. Every reward is a boon WITH a catch.
 */
export const REWARDS: readonly RewardId[] = [
  "marquee",
  "wonderkid",
  "gegenpress",
  "ironCurtain",
  "talismanTonic",
  "physio",
];

/** Engine-unit sizes of the buffs (measured by `market.test.ts` for run length). */
export const REWARD_EFFECT = {
  /** Gegenpress: attack all match for this many matches… */
  gegenpress: { matches: 2, attack: 9, fadeFrom: 70, fade: -14 },
  /** Iron Curtain: for the rest of the run. */
  ironCurtain: { defense: 6, attack: -5 },
  /** Talisman Tonic: the pressure of carrying a talisman. */
  talismanTonic: { card: 8, foul: 6 },
  /** Marquee Signing: at least this good. */
  marqueeMin: 85,
  /** Wonderkid: this far above the squad average. */
  wonderkid: { above: 4 },
} as const;

/** How far up the pool each win moves the opponent (in pool ranks, of ~250). */
export const TIER_STEP = 12;
/** The first opponent is drawn from the weakest `BASE` cards — your own neighbourhood. */
const BASE = 30;
const WINDOW = 40;

export interface MarketResult {
  round: number;
  side: Side;
  gf: number;
  ga: number;
}

export interface MarketRun {
  seed: number;
  /** Matches played so far — also the next round's index. */
  round: number;
  lives: number;
  wins: number;
  /** Extra opponent tiers (Physio's catch). */
  tierBonus: number;
  /** The XI, in `MARKET_SHAPE` slot order. */
  xi: string[];
  /** Traits FORCED by rewards (Marquee's Hot-Head, Talisman Tonic's talisman), by cardId. */
  forced: Record<string, TraitId>;
  /** Active buffs: `until` is the round index they expire BEFORE (null = the rest of the run). */
  buffs: { id: RewardId; until: number | null }[];
  results: MarketResult[];
  /** A won match whose pack has not been opened yet. */
  pendingPack: boolean;
}

const ovr = (c: { ratings: { overall: number } | null }) => c.ratings?.overall ?? 0;
const byId = (pool: readonly PoolCard[]) =>
  new Map<string, PoolCard>(pool.map((c) => [c.cardId, c]));

/** The weakest legal XI: for each slot in turn, the lowest-rated eligible card not yet used. */
export function weakestXi(pool: readonly PoolCard[]): string[] {
  const shape = formationByName(MARKET_SHAPE);
  const asc = [...pool].sort((a, b) => ovr(a) - ovr(b) || a.playerId - b.playerId);
  const used = new Set<number>();
  return shape.slots.map((slot) => {
    const c = asc.find((p) => !used.has(p.playerId) && canPlay(p, slot.role))!;
    used.add(c.playerId);
    return c.cardId;
  });
}

export function startRun(pool: readonly PoolCard[], seed: number): MarketRun {
  return {
    seed,
    round: 0,
    lives: LIVES,
    wins: 0,
    tierBonus: 0,
    xi: weakestXi(pool),
    forced: {},
    buffs: [],
    results: [],
    pendingPack: false,
  };
}

export const runOver = (run: MarketRun) => run.lives <= 0;

/** The coach's side: his XI in the run's shape, with a bench of the best men he has not used. */
export function coachTeam(pool: readonly PoolCard[], run: MarketRun, name: string): GameTeam {
  const ids = byId(pool);
  const xi = run.xi.map((id) => ids.get(id)!);
  const shape = formationByName(MARKET_SHAPE);
  // ⚠️ The bench comes from the WEAK half of the pool, so a run cannot be won from the bench.
  const asc = [...pool].sort((a, b) => ovr(a) - ovr(b));
  const bench = reservePlayers(asc.slice(0, Math.ceil(asc.length / 2)), xi);
  return makeGameTeam(-1, name, 0, shape, xi, bench);
}

/** This round's opponent: a seeded draft from a window that climbs the pool with every win. */
export function opponentFor(pool: readonly PoolCard[], run: MarketRun, name: string): GameTeam {
  const asc = [...pool].sort((a, b) => ovr(a) - ovr(b) || a.playerId - b.playerId);
  const tier = run.wins + run.tierBonus;
  const hi = Math.min(asc.length, BASE + tier * TIER_STEP);
  const window = asc.slice(Math.max(0, hi - WINDOW), hi);
  return chaosDraft(window, fixtureSeed(run.seed, run.round, 1), name, { policy: "random" });
}

/** Home and away alternate by round, so a run is not decided by home advantage. */
export const sideFor = (round: number): Side => (round % 2 === 0 ? "home" : "away");

/** The buffs as one modifier on the coach's side. */
function buffModifier(run: MarketRun, coach: Side): Modifier {
  const live = run.buffs.filter((b) => b.until == null || run.round < b.until).map((b) => b.id);
  return ({ state, side }) => {
    if (side !== coach) return {};
    let attack = 0;
    let defense = 0;
    let foul = 0;
    let card = 0;
    if (live.includes("gegenpress")) {
      const g = REWARD_EFFECT.gegenpress;
      attack += state.minute >= g.fadeFrom ? g.fade : g.attack;
    }
    if (live.includes("ironCurtain")) {
      defense += REWARD_EFFECT.ironCurtain.defense;
      attack += REWARD_EFFECT.ironCurtain.attack;
    }
    if (live.includes("talismanTonic")) {
      card += REWARD_EFFECT.talismanTonic.card;
      foul += REWARD_EFFECT.talismanTonic.foul;
    }
    const out: { attack?: number; defense?: number; foul?: number; card?: number } = {};
    if (attack !== 0) out.attack = attack;
    if (defense !== 0) out.defense = defense;
    if (foul !== 0) out.foul = foul;
    if (card !== 0) out.card = card;
    return out;
  };
}

/**
 * The next match's setup. Forced traits join the coach's crafted badges (a forced trait wins a
 * clash — the reward's catch must bite), and both play through `personalityModifier`.
 */
export function marketMatch(
  pool: readonly PoolCard[],
  run: MarketRun,
  names: { coach: string; opponent: string },
  crafted?: CraftedTraits,
): { setup: MatchSetup; coachSide: Side } {
  const coachSide = sideFor(run.round);
  const me = coachTeam(pool, run, names.coach);
  const them = opponentFor(pool, run, names.opponent);
  const home = coachSide === "home" ? me : them;
  const away = coachSide === "home" ? them : me;
  const traits = new Map(crafted ?? []);
  for (const [id, t] of Object.entries(run.forced)) traits.set(id, t);
  return {
    coachSide,
    setup: {
      home,
      away,
      seed: fixtureSeed(run.seed, run.round, 0),
      targetGoalsPerMatch: 2.7,
      crisis: true,
      modifiers: [
        personalityModifier(home, away, { side: coachSide, traits }),
        buffModifier(run, coachSide),
      ],
    },
  };
}

/** Record a finished match. ⛔ Refuses while a pack is unopened — a win must be paid out first. */
export function recordMatch(run: MarketRun, gf: number, ga: number): MarketRun {
  if (runOver(run)) throw new Error("the run is over");
  if (run.pendingPack) throw new Error("open the pack before the next match");
  const won = gf > ga;
  const lost = gf < ga;
  return {
    ...run,
    round: run.round + 1,
    wins: run.wins + (won ? 1 : 0),
    lives: run.lives - (lost ? 1 : 0),
    results: [...run.results, { round: run.round, side: sideFor(run.round), gf, ga }],
    pendingPack: won,
  };
}

/** The three rewards in the pack after round `run.round − 1`. Physio only when a life is missing. */
export function packFor(run: MarketRun): RewardId[] {
  const rng = mulberry32(fixtureSeed(run.seed, run.round, 2));
  const bag = REWARDS.filter((r) => r !== "physio" || run.lives < LIVES);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  return bag.slice(0, 3);
}

/** The slot index of the weakest man who could be replaced by `card`, or -1. */
function weakestSlotFor(pool: readonly PoolCard[], run: MarketRun, card: PoolCard): number {
  const ids = byId(pool);
  const shape = formationByName(MARKET_SHAPE);
  let at = -1;
  for (let i = 0; i < run.xi.length; i++) {
    if (!canPlay(card, shape.slots[i]!.role)) continue;
    if (at < 0 || ovr(ids.get(run.xi[i]!)!) < ovr(ids.get(run.xi[at]!)!)) at = i;
  }
  return at;
}

/**
 * A seeded signing from `candidates`, slotted where he replaces the weakest man he can play for.
 * Never someone already in the XI (the same PLAYER in another season counts as already there).
 */
function sign(
  pool: readonly PoolCard[],
  run: MarketRun,
  candidates: readonly PoolCard[],
  salt: number,
): { xi: string[]; card: PoolCard } | null {
  const ids = byId(pool);
  const inXi = new Set(run.xi.map((id) => ids.get(id)!.playerId));
  const open = candidates
    .filter((c) => !inXi.has(c.playerId))
    .filter((c) => weakestSlotFor(pool, run, c) >= 0)
    .sort((a, b) => a.playerId - b.playerId || (a.cardId < b.cardId ? -1 : 1));
  if (open.length === 0) return null;
  const card =
    open[Math.floor(mulberry32(fixtureSeed(run.seed, run.round, salt))() * open.length)]!;
  const xi = [...run.xi];
  xi[weakestSlotFor(pool, run, card)] = card.cardId;
  return { xi, card };
}

/**
 * Open the pack: apply the chosen reward, boon AND catch. ⛔ Only a reward that was in this pack
 * may be taken. A signing that finds nobody degrades to a no-op rather than throwing — the coach
 * already earned the pack.
 */
export function takeReward(pool: readonly PoolCard[], run: MarketRun, id: RewardId): MarketRun {
  if (!run.pendingPack) throw new Error("no pack to open");
  if (!packFor(run).includes(id)) throw new Error("that reward was not in the pack");
  const next: MarketRun = { ...run, pendingPack: false };
  const ids = byId(pool);
  switch (id) {
    case "marquee": {
      // Boon: a star for your weakest slot. Catch: he is a Hot-Head.
      const stars = pool.filter((c) => ovr(c) >= REWARD_EFFECT.marqueeMin && c.role !== "GK");
      const s = sign(pool, run, stars, 3);
      if (s == null) return next;
      return { ...next, xi: s.xi, forced: { ...run.forced, [s.card.cardId]: "hot-head" } };
    }
    case "wonderkid": {
      // Boon: a player well above your average. Catch: your best outfielder is sold.
      const mean = run.xi.reduce((a, cid) => a + ovr(ids.get(cid)!), 0) / run.xi.length;
      const good = pool.filter(
        (c) => ovr(c) >= mean + REWARD_EFFECT.wonderkid.above && c.role !== "GK",
      );
      const s = sign(pool, run, good, 4);
      if (s == null) return next;
      const shape = formationByName(MARKET_SHAPE);
      const best = s.xi
        .map((cid, i) => ({ i, c: ids.get(cid)! }))
        .filter(({ c }) => c.role !== "GK" && c.cardId !== s.card.cardId)
        .sort((a, b) => ovr(b.c) - ovr(a.c))[0];
      if (best == null) return { ...next, xi: s.xi };
      const inXi = new Set(s.xi.map((cid) => ids.get(cid)!.playerId));
      const role = shape.slots[best.i]!.role;
      const cover = [...pool]
        .sort((a, b) => ovr(a) - ovr(b) || a.playerId - b.playerId)
        .find((c) => !inXi.has(c.playerId) && canPlay(c, role));
      const xi = [...s.xi];
      if (cover != null) xi[best.i] = cover.cardId;
      const forced = { ...run.forced };
      delete forced[best.c.cardId];
      return { ...next, xi, forced };
    }
    case "gegenpress":
      return {
        ...next,
        buffs: [...run.buffs, { id, until: run.round + REWARD_EFFECT.gegenpress.matches }],
      };
    case "ironCurtain":
      return { ...next, buffs: [...run.buffs, { id, until: null }] };
    case "talismanTonic": {
      // Boon: your best outfielder becomes a Talisman. Catch: the pressure — more cards.
      const best = run.xi
        .map((cid) => ids.get(cid)!)
        .filter((c) => c.role !== "GK")
        .sort((a, b) => ovr(b) - ovr(a))[0];
      return {
        ...next,
        forced: best == null ? run.forced : { ...run.forced, [best.cardId]: "talisman" },
        buffs: [...run.buffs, { id, until: null }],
      };
    }
    case "physio":
      // Boon: a life back. Catch: every opponent from now on is a tier stronger.
      return { ...next, lives: Math.min(LIVES, run.lives + 1), tierBonus: run.tierBonus + 1 };
  }
}
