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

/**
 * A poolable card = a rated player-season plus its club (for the card face).
 *
 * ⚠️ `price` is present only on a `pricedMarket` pool (TASK-1810 Budget Cap). It is the GAME
 * price in **tenths of a million** (`164` = £16.4m), not a market value: real values are
 * indexed for era and then compressed into an FPL-style band — see `domain/price-band.ts`.
 * Optional because no other pool has a concept of price; absent means "not for sale in this
 * mode", which `domain/budget.ts` treats as unaffordable rather than free.
 */
export type PoolCard = GamePlayer & { club: string; teamId?: number; price?: number };

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
export const BENCH_SHAPE: PlayerRole[] = ["GK", "CB", "CM", "CF", "RW"];

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
 *
 * ⭐ `budget` (TASK-1810) drafts under a spending cap, and it exists because `best` cannot be
 * used for Budget Cap: the unlimited ceiling XI measures mean rating **94.0** against the
 * coach's **80.8** at €100M — a 13-point gap settled by the draft rules before a ball is
 * kicked, which is precisely the balance defect the owner reported on 2026-08-19.
 */
export type DraftPolicy = "random" | "best" | "strong" | "budget";

export interface DraftOptions {
  /** Absent means `random`, i.e. exactly what `/game/chaos` has always drafted. */
  policy?: DraftPolicy;
  /**
   * The spending cap for `policy: "budget"`, in tenths of a million. Ignored by every other
   * policy.
   *
   * ⛔ It covers the XI **and the bench**, because the coach pays for his (TASK-1810,
   * owner 2026-08-26). Capping only the rival's eleven would buy him sixteen players for the
   * same money the coach spends on eleven — the 2026-08-19 balance defect wearing a different
   * hat, and nothing on screen would show it. Whichever side pays, both must.
   */
  budget?: number;
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

/** The cheapest `n` unused cards `canPlay` accepts for `role`, cheapest first. */
function cheapestFor(
  pool: PoolCard[],
  role: PlayerRole,
  used: ReadonlySet<number>,
  n: number,
): PoolCard[] {
  return pool
    .filter((c) => !used.has(c.playerId) && canPlay(c, role))
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    .slice(0, n);
}

/**
 * What must be held back to fill the remaining slots, if `exclude` is spent on this one.
 *
 * ⛔ `exclude` is the whole point, and leaving it out is a real bug rather than a nicety: a
 * candidate can BE the cheap card that was reserved as cover for a later slot, so pricing the
 * reserve without removing him lets the draft buy its own safety net. Measured — seed 99 came
 * out with **nine players** before this argument existed.
 *
 * ⚠️ Greedy over per-slot cheapest LISTS rather than single cards, so the assignment stays
 * DISTINCT: one cheap utility defender must not be counted as cover for three different slots.
 * Each list is longer than the number of slots it serves, so the walk can never run dry.
 */
function reserveFrom(lists: readonly PoolCard[][], exclude: number): number {
  const claimed = new Set<number>([exclude]);
  let total = 0;
  for (const list of lists) {
    const card = list.find((c) => !claimed.has(c.playerId));
    if (card == null) continue;
    claimed.add(card.playerId);
    total += card.price ?? 0;
  }
  return total;
}

/**
 * A seeded draw from the affordable standouts, or the best affordable card there is.
 *
 * A candidate is affordable when his own cost PLUS the cheapest way to fill every slot after
 * him still fits inside `remaining` — which is what makes eleven filled slots structural
 * rather than lucky.
 *
 * ⛔ The rng is drawn EXACTLY ONCE per slot whether or not anything is affordable — the same
 * discipline `strongFor` documents. A branch that skipped the draw when the band was empty
 * would make the stream depend on how many slots happened to find one, and the bench below
 * shares that stream.
 */
function budgetPick(
  pool: PoolCard[],
  role: PlayerRole,
  used: ReadonlySet<number>,
  rng: () => number,
  remaining: number,
  later: readonly PlayerRole[],
): PoolCard | null {
  const from = candidatesFor(pool, role, used);
  const roll = rng();
  const lists = later.map((r) => cheapestFor(pool, r, used, later.length + 2));
  const affordable = from.filter(
    (c) => (c.price ?? Infinity) + reserveFrom(lists, c.playerId) <= remaining,
  );
  if (affordable.length === 0) return null;
  const band = affordable.filter((c) => (c.ratings?.overall ?? 0) >= STANDOUT_OVR);
  const choices = band.length > 0 ? band : affordable;
  // Sorted before the draw: `pool` order is an input we do not control, and an unsorted draw
  // would pick differently after an unrelated data refresh.
  const sorted = [...choices].sort((a, b) => a.cardId.localeCompare(b.cardId));
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
  const { policy = "random", exclude, budget } = options;
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
  /** Shared by the XI and the bench loops — `budget` covers the whole squad, not the eleven. */
  let spent = 0;
  if (policy === "strong") {
    for (const slot of shape.slots) {
      const card = strongFor(pool, slot.role, used, rng);
      if (card == null) continue;
      used.add(card.playerId);
      chosen.push(card);
    }
  } else if (policy === "budget") {
    // ⭐ Greedy in SLOT order under a running ceiling. The reserve is what keeps the last
    // slots fillable: spending everything on a keeper and two strikers would otherwise leave
    // eight slots with nothing affordable, and the rival would walk out with seven men.
    for (let i = 0; i < shape.slots.length; i++) {
      const remaining = (budget ?? Infinity) - spent;
      // ⛔ The reserve covers the BENCH as well as the remaining slots. Without it the rival
      // spends the whole cap on eleven and has nothing left for the five it also has to buy.
      const later = [
        ...shape.slots.slice(i + 1).map((s) => s.role),
        ...BENCH_SHAPE.slice(0, BENCH_SIZE),
      ];
      const card = budgetPick(pool, shape.slots[i]!.role, used, rng, remaining, later);
      if (card == null) continue;
      used.add(card.playerId);
      spent += card.price ?? 0;
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
    if (policy === "budget") {
      // ⛔ The bench is PAID FOR, because the coach pays for his. Its reserve is the bench
      // roles still to come, so the rival cannot spend out and finish with three substitutes.
      const later = BENCH_SHAPE.slice(i + 1, BENCH_SIZE);
      const card = budgetPick(pool, want, used, rng, (budget ?? Infinity) - spent, later);
      if (card == null) break;
      used.add(card.playerId);
      spent += card.price ?? 0;
      bench.push(card);
      continue;
    }
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
   * The rival's spending cap for `opponent: "budget"` (TASK-1810).
   *
   * ⛔ Part of the match's IDENTITY, exactly like `opponent` itself. Every path that rebuilds
   * the match must pass it: without it the rival's ceiling is Infinity, the policy degenerates
   * into best-available, and the replay drafts a different eleven — which surfaces as a
   * fingerprint mismatch reading like a corrupt save rather than like a missing argument.
   */
  budget?: number;
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
  const { opponent, exclude, rivalPool, rivalName, budget } = options;
  const home = chaosDraft(pool, seed, names.home, { exclude });
  const away = chaosDraft(rivalPool ?? pool, seed ^ 0x9e3779b9, rivalName ?? names.away, {
    policy: opponent,
    exclude,
    // ⛔ Without this the rival's ceiling is Infinity and `policy: "budget"` degenerates into
    // `best` — the exact 94.0-against-80.8 mismatch the policy exists to prevent, and it would
    // look completely normal on screen.
    budget,
  });
  const sr = mulberry32(seed ^ 0x51ed270b);
  return {
    home,
    homeStyle: pick(STYLES, sr),
    opponent: { kind: "squad", team: away, style: pick(STYLES, sr) },
  };
}
