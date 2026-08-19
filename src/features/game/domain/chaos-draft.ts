import type { PlayerRole } from "@/data/schemas";
import { STANDOUT_OVR } from "./draft-room";
import { canPlay } from "./eligibility";
import { fillGaps } from "./fill-gaps";
import type { Formation, FormationSlot } from "./formation";
import type { Opponent, TacticalStyle } from "./opponent";
import type { GamePlayer } from "./player";
import { mulberry32 } from "./rng";
import { type GameTeam, makeGameTeam } from "./team";

// TASK-1806 — Chaos Draft. A fully-randomised squad, drafted from a build-time
// card pool, seeded so a draft replays from its seed. Pure + client-safe.

/** A poolable card = a rated player-season plus its club (for the card face). */
export type PoolCard = GamePlayer & { club: string; teamId?: number };

const slot = (row: number, col: number, role: PlayerRole): FormationSlot => ({ row, col, role });
const formation = (name: string, slots: FormationSlot[]): Formation => ({ name, season: 0, slots });

/** Build a shape from lines of roles, keeper line first. */
const shape = (name: string, lines: PlayerRole[][]): Formation =>
  formation(
    name,
    lines.flatMap((line, r) => line.map((role, c) => slot(r + 1, c + 1, role))),
  );

/**
 * The full formation set — twenty shapes in three families (TASK-1831).
 *
 * Row 1 is the goalkeeper line, increasing toward the opponent goal; `col` runs left to
 * right.
 *
 * ⚠️ NAMES CARRY THE VARIANT, and that is load-bearing. `formationKey` is
 * `${name}/${slots.length}` and every shape here is 11 slots, so two variants both called
 * "4-3-3" would collide on "4-3-3/11" — and TASK-1807 B2 resolves a stored match by that
 * key, so a collision restores a saved match into the wrong shape.
 *
 * ⚠️ The array's ORDER is presentation only. Resolve a shape with `formationByName`,
 * never by index; a guard test enforces it.
 */
export const FORMATIONS: Formation[] = [
  // ---- Back four ----
  shape("4-3-3 Holding", [
    ["GK"],
    ["LB", "CB", "CB", "RB"],
    ["CDM", "CM", "CM"],
    ["LW", "CF", "RW"],
  ]),
  shape("4-3-3 Flat", [["GK"], ["LB", "CB", "CB", "RB"], ["CM", "CM", "CM"], ["LW", "CF", "RW"]]),
  shape("4-3-3 False 9", [
    ["GK"],
    ["LB", "CB", "CB", "RB"],
    ["CDM", "CM", "CM"],
    ["LW", "CAM", "RW"],
  ]),
  shape("4-2-3-1", [["GK"], ["LB", "CB", "CB", "RB"], ["CDM", "CDM"], ["LW", "CAM", "RW"], ["CF"]]),
  shape("4-4-2 Flat", [["GK"], ["LB", "CB", "CB", "RB"], ["LM", "CM", "CM", "RM"], ["CF", "CF"]]),
  shape("4-4-2 Diamond", [
    ["GK"],
    ["LB", "CB", "CB", "RB"],
    ["CDM"],
    ["CM", "CM"],
    ["CAM"],
    ["CF", "CF"],
  ]),
  shape("4-1-4-1", [["GK"], ["LB", "CB", "CB", "RB"], ["CDM"], ["LM", "CM", "CM", "RM"], ["CF"]]),
  shape("4-3-2-1 Christmas Tree", [
    ["GK"],
    ["LB", "CB", "CB", "RB"],
    ["CDM", "CM", "CM"],
    ["CAM", "CAM"],
    ["CF"],
  ]),
  shape("4-5-1", [["GK"], ["LB", "CB", "CB", "RB"], ["LM", "CDM", "CM", "CDM", "RM"], ["CF"]]),
  shape("4-2-2-2 Magic Rectangle", [
    ["GK"],
    ["LB", "CB", "CB", "RB"],
    ["CDM", "CDM"],
    ["CAM", "CAM"],
    ["CF", "CF"],
  ]),
  // ---- Back three or five ----
  shape("3-5-2", [["GK"], ["CB", "CB", "CB"], ["LM", "CM", "CAM", "CM", "RM"], ["CF", "CF"]]),
  shape("3-4-3 Flat", [["GK"], ["CB", "CB", "CB"], ["LM", "CM", "CM", "RM"], ["LW", "CF", "RW"]]),
  shape("3-4-2-1", [["GK"], ["CB", "CB", "CB"], ["LM", "CM", "CM", "RM"], ["CAM", "CAM"], ["CF"]]),
  shape("3-1-4-2", [["GK"], ["CB", "CB", "CB"], ["CDM"], ["LM", "CM", "CM", "RM"], ["CF", "CF"]]),
  shape("5-3-2", [["GK"], ["LB", "CB", "CB", "CB", "RB"], ["CM", "CM", "CM"], ["CF", "CF"]]),
  shape("5-4-1", [["GK"], ["LB", "CB", "CB", "CB", "RB"], ["LM", "CM", "CM", "RM"], ["CF"]]),
  // ---- Historic ----
  shape("4-2-4", [["GK"], ["LB", "CB", "CB", "RB"], ["CM", "CM"], ["LW", "CF", "CF", "RW"]]),
  shape("3-2-2-3 W-M", [
    ["GK"],
    ["CB", "CB", "CB"],
    ["CM", "CM"],
    ["CAM", "CAM"],
    ["LW", "CF", "RW"],
  ]),
  shape("2-3-5 Pyramid", [
    ["GK"],
    ["LB", "RB"],
    ["LM", "CM", "RM"],
    ["LW", "SS", "CF", "SS", "RW"],
  ]),
  shape("4-6-0 Strikerless", [
    ["GK"],
    ["LB", "CB", "CB", "RB"],
    ["LM", "CDM", "CM", "CM", "CAM", "RM"],
  ]),
];

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

/**
 * Draft a full XI from the pool: a random formation, then a random ELIGIBLE card
 * per slot (falling back to any unused card). Deterministic from `seed`.
 */
/** Bench size. TASK-1822 Phase 4 needs substitutes; the draft screen still shows the XI. */
const BENCH_SIZE = 5;

/** Roles a bench should cover, in order — a spare keeper first, then the spine. */
const BENCH_SHAPE: PlayerRole[] = ["GK", "CB", "CM", "CF", "RW"];

/**
 * How a slot chooses among the cards eligible for it.
 *
 * - `random` — the shipped Chaos behaviour, a seeded draw over everything eligible.
 * - `best` — the highest-rated card available, no entropy at all. Always the same XI.
 * - `strong` — a seeded draw over the cards at `STANDOUT_OVR` or better, falling back to
 *   the best available when a club has none for that slot.
 *
 * ⭐ `best` exists because of an owner report (2026-08-19): the Legacy opponent was
 * fielding 39s and 44s against a coach whose every round guarantees an 80+ standout. Its
 * pool is a club's COMPLETE history — hundreds of squad players — so a uniform draw lands
 * far below the coach by construction, and no amount of re-seeding fixes that.
 *
 * ⭐ `strong` is the owner's answer to what `best` costs: a club that always fields its
 * single strongest XI is the same match every time. Drawing inside the 80+ band keeps the
 * quality and gives the line-up back its variety — measured on Liverpool, whose rank-30
 * player is an 84 and rank-45 an 82, so the band IS the 82–90 range he asked for.
 *
 * ⚠️ The bar is `STANDOUT_OVR`, reused rather than reinvented. It is already what the pack
 * guarantees inside the coach's own hands, so the rival is drafted to the standard the
 * coach is promised — one number, one meaning.
 */
export type DraftPolicy = "random" | "best" | "strong";

export interface DraftOptions {
  /** Absent means `random`, i.e. exactly what `/game/chaos` has always drafted. */
  policy?: DraftPolicy;
  /**
   * playerIds that are already spoken for — the coach's own XI.
   *
   * ⚠️ Needed the moment `best` exists. Both sides draw from the SAME club pool, so
   * without this the opponent's best-available pick is very often a man already standing
   * on the pitch in the other shirt: peak van Dijk marking peak van Dijk.
   */
  exclude?: ReadonlySet<number>;
}

/** Eligible, unused cards for `role`; falls back to anything free, exactly as the shipped draw does. */
function candidatesFor(pool: PoolCard[], role: PlayerRole, used: ReadonlySet<number>): PoolCard[] {
  const free = pool.filter((c) => !used.has(c.playerId));
  const eligible = free.filter((c) => canPlay(c, role));
  return eligible.length > 0 ? eligible : free;
}

/**
 * A seeded draw from the standout band, or the best card there is.
 *
 * ⛔ The rng is drawn EXACTLY ONCE per slot whether or not the band is empty. A branch that
 * skipped the draw for a club with no 80+ cards would give that club a different stream from
 * the same seed, and the bench below shares it — so a thin club's XI would depend on how many
 * of its slots happened to find a standout.
 */
function strongFor(
  pool: PoolCard[],
  role: PlayerRole,
  used: ReadonlySet<number>,
  rng: () => number,
): PoolCard | null {
  const from = candidatesFor(pool, role, used);
  const roll = rng();
  if (from.length === 0) return null;
  const band = from.filter((c) => (c.ratings?.overall ?? 0) >= STANDOUT_OVR);
  if (band.length === 0) return bestFor(pool, role, used);
  // Sorted before the draw: `pool` order is an input we do not control, and an unsorted
  // draw would make the same seed pick differently after an unrelated data refresh.
  const sorted = [...band].sort((a, b) => a.cardId.localeCompare(b.cardId));
  return sorted[Math.floor(roll * sorted.length)] ?? null;
}

/** The best card for `role` that nobody has taken, or null. Rating desc, then cardId. */
function bestFor(pool: PoolCard[], role: PlayerRole, used: ReadonlySet<number>): PoolCard | null {
  const ovr = (c: PoolCard) => c.ratings?.overall ?? -1;
  let best: PoolCard | null = null;
  // ⚠️ Eligibility FIRST, exactly as the random path does: a free card of the wrong role is
  // only ever a last resort, never a better answer than an eligible one.
  for (const stage of [true, false]) {
    for (const card of pool) {
      if (used.has(card.playerId)) continue;
      if (stage && !canPlay(card, role)) continue;
      if (
        best == null ||
        ovr(card) > ovr(best) ||
        (ovr(card) === ovr(best) && card.cardId < best.cardId)
      ) {
        best = card;
      }
    }
    if (best != null) return best;
  }
  return null;
}

export function chaosDraft(
  pool: PoolCard[],
  seed: number,
  name = "Your XI",
  options: DraftOptions = {},
): GameTeam {
  const { policy = "random", exclude } = options;
  const rng = mulberry32(seed);
  const shape = pick(FORMATIONS, rng);
  // ⚠️ Seeded with the exclusions, so they are honoured by the XI and the bench alike.
  const used = new Set<number>(exclude ?? []);
  // ⚠️ The SAME rng stream is threaded through: `fillGaps` draws exactly once per slot
  // it fills, in slot order, which is precisely what the inline loop here used to do.
  // Passing it a seed instead would start a second stream and change every draft
  // `/game/chaos` has ever produced — the route prerenders from this.
  const byCardId = new Map(pool.map((c) => [c.cardId, c]));
  const chosen: PoolCard[] = [];
  if (policy === "strong") {
    for (const slot of shape.slots) {
      const card = strongFor(pool, slot.role, used, rng);
      if (card == null) continue;
      used.add(card.playerId);
      chosen.push(card);
    }
  } else if (policy === "best") {
    // ⚠️ Greedy in SLOT order, which is goalkeeper-first. No rng is drawn at all, so this
    // path cannot shift the `random` path's stream — the two never run together anyway,
    // but the bench below shares the same `rng` and would notice.
    for (const slot of shape.slots) {
      const card = bestFor(pool, slot.role, used);
      if (card == null) continue;
      used.add(card.playerId);
      chosen.push(card);
    }
  } else {
    for (const id of fillGaps(
      pool,
      shape,
      shape.slots.map(() => null),
      rng,
      exclude,
    )) {
      if (id == null) continue;
      const card = byCardId.get(id);
      if (card == null) continue;
      used.add(card.playerId);
      chosen.push(card);
    }
  }

  // The bench is drafted AFTER the XI so the starting eleven is unaffected — the same
  // seed still produces the same first-choice side it always did.
  const bench: PoolCard[] = [];
  for (let i = 0; i < BENCH_SIZE; i++) {
    const want = BENCH_SHAPE[i % BENCH_SHAPE.length];
    if (policy === "strong") {
      const card = strongFor(pool, want, used, rng);
      if (card == null) break;
      used.add(card.playerId);
      bench.push(card);
      continue;
    }
    if (policy === "best") {
      const card = bestFor(pool, want, used);
      if (card == null) break;
      used.add(card.playerId);
      bench.push(card);
      continue;
    }
    const eligible = pool.filter((c) => !used.has(c.playerId) && canPlay(c, want));
    const anyFree = pool.filter((c) => !used.has(c.playerId));
    const from = eligible.length ? eligible : anyFree;
    if (from.length === 0) break;
    const card = pick(from, rng);
    used.add(card.playerId);
    bench.push(card);
  }

  return makeGameTeam(-1, name, 0, shape, chosen, bench);
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

export interface MatchupOptions {
  /**
   * How the OPPONENT drafts. Absent = the shipped random draw.
   *
   * ⚠️ Deliberately not applied to the home draft. The coach picks his own XI; all this
   * side contributes is his BENCH, and a best-available bench would hand him five more
   * superstars rather than the squad depth a bench is meant to be.
   */
  opponent?: DraftPolicy;
  /**
   * The cards the OPPONENT draws from. Absent = the coach's own pool.
   *
   * ⭐ This is what "I want to face Arsenal" means (owner, 2026-08-19). Absent, both sides
   * come out of one club's history and the rival is your own reserves — which is the
   * arrangement that produced van Dijk marking van Dijk.
   */
  rivalPool?: PoolCard[];
  /** What the opponent is CALLED. Absent = `names.away`. */
  rivalName?: string;
  /**
   * The coach's drafted playerIds — withheld from BOTH auto-drafts. See `DraftOptions`.
   *
   * ⚠️ Still right when the rival is a different club: a `playerId` is stable across clubs,
   * so a man who turned out for both would otherwise line up against himself.
   */
  exclude?: ReadonlySet<number>;
}

/** Draft your XI plus a distinct auto-drafted opponent, each with a seeded style. */
export function chaosMatchup(
  pool: PoolCard[],
  seed: number,
  names: { home: string; away: string } = { home: "Your XI", away: "Rivals" },
  options: MatchupOptions = {},
): ChaosMatchup {
  const { opponent, exclude, rivalPool, rivalName } = options;
  const home = chaosDraft(pool, seed, names.home, { exclude });
  const away = chaosDraft(rivalPool ?? pool, seed ^ 0x9e3779b9, rivalName ?? names.away, {
    policy: opponent,
    exclude,
  });
  const sr = mulberry32(seed ^ 0x51ed270b);
  return {
    home,
    homeStyle: pick(STYLES, sr),
    opponent: { kind: "squad", team: away, style: pick(STYLES, sr) },
  };
}
