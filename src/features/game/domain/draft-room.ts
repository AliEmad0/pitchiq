import type { PlayerRole } from "@/data/schemas";
import type { PoolCard } from "./chaos-draft";
import { canPlay } from "./eligibility";
import type { Formation } from "./formation";
import { mulberry32 } from "./rng";

/** Candidates offered per slot. */
export const HAND_SIZE = 5;

/**
 * The rating that counts as a standout (TASK-1810, owner decision).
 *
 * ⚠️ A FLOOR, not a band. The original rule was "one card from 80–85", but the committed
 * ratings cannot support it: 12 of the 51 clubs have no player who ever reached 80, and 35
 * have fewer than the eleven such cards an XI would need. Huddersfield's best player ever
 * is a 67. So the guarantee is "one card at 80+, or failing that the best card the club can
 * offer for this position" — which delivers the same intent (never a round of five nobodies)
 * at every club instead of only the big six.
 */
export const STANDOUT_OVR = 80;

export interface DealOptions {
  /**
   * Players who must never be dealt, by `playerId` (Captain's Draft, TASK-1810).
   *
   * ⭐ The icon IS in the pool — every path that rebuilds a match resolves the saved XI
   * against it, and `replayWith` returns null on the first card it cannot find, so a
   * captain missing from the pool would make his own match unresumable and his share link
   * dead. He is excluded from the DEALS instead, which is a different question from
   * whether the card exists.
   *
   * ⛔ Determinism: this filter changes the bag, so it changes every draw after it. It is
   * only ever non-empty for a pack that locks a slot — Legacy passes nothing and its deals
   * are byte-identical to before.
   */
  excludePlayers?: ReadonlySet<number>;
  /** Candidates per hand. Defaults to the shipped five. */
  handSize?: number;
  /**
   * Guarantee one strong card per hand: a card rated `STANDOUT_OVR`+ chosen at random when
   * the club has any for this position, otherwise the best card it does have.
   */
  standout?: boolean;
  /**
   * Guarantee the CHEAPEST eligible card in every hand (TASK-1810 Budget Cap).
   *
   * ⚠️ `domain/budget.ts` reserves the cheapest card of each unfilled HAND, so what bounds the
   * draft is the sum of the hands' minimums, not the pool's. On the original euro scale that
   * made this option a FEASIBILITY fix: five random cards per slot put the floor at €137M–265M
   * against a €100M cap, so every card in every hand came out disabled and the mode could not
   * be played at all. A browser found that; every unit fixture had missed it.
   *
   * ⭐ Compressing prices into the FPL band changed what it is FOR. The worst naive floor is
   * now **£65.0m** against a £100.0m cap — feasible everywhere — so this buys HEADROOM rather
   * than completion: it drops the floor to £44.3m, roughly £21m more to spend up with, and
   * guarantees every hand holds an economising option instead of leaving some slots with no
   * cheap card at all. `budget-pool.test.ts` pins both halves.
   *
   * ⚠️ This is STATIC, which is exactly why it can live here. An "always deal something
   * affordable" option could not: `roomDeals` deals every hand up front from one seed, before
   * a single pick exists, so it cannot know what has been spent. "The cheapest eligible card"
   * needs no such knowledge, and including it makes the hand floor equal the pool floor.
   *
   * ⚠️ Drawn FIRST and with NO rng, like the `standout` fallback — a guaranteed card must not
   * be crowded out by the random remainder, and spending a random number here would change
   * every existing room that shares this stream.
   */
  cheapest?: boolean;
  /**
   * Extra hands dealt AFTER the formation's slots — the bench (TASK-1810 Budget Cap).
   *
   * ⚠️ Appended, never interleaved, and that is what keeps every existing room byte-identical:
   * the rng is consumed in slot order first, so the eleven starting hands are drawn exactly as
   * they always were and the bench simply continues the stream. Absent = no bench hands, which
   * is every caller that predates this.
   *
   * ⚠️ The roles are the CALLER's, not a constant here, because "which bench" is a mode's rule.
   * `BENCH_SHAPE` opens with a goalkeeper, which is what makes "one of them must be a keeper"
   * true by construction rather than by a check somewhere else.
   */
  bench?: readonly PlayerRole[];
  /**
   * Treat every card of the same player as one, so a player can appear in at most one hand.
   *
   * ⚠️ This is what makes "you cannot pick the same player twice" true BY CONSTRUCTION
   * rather than by a rule the UI has to enforce. It matters here and nowhere else: the
   * Legacy pool holds one card per player-season, so without it Gary Neville 1996 and Gary
   * Neville 2003 are different cards and could both end up in the same XI.
   */
  onePerPlayer?: boolean;
}

/**
 * Eleven hands of five, one per formation slot.
 *
 * ⚠️ PRECOMPUTED, IN SLOT ORDER, against one shared used-set. Two properties fall out,
 * and both are load-bearing:
 *
 * 1. No player can appear in two hands, so a duplicate pick is impossible by construction.
 * 2. The ORDER THE COACH VISITS SLOTS cannot change what any slot offers. Dealt lazily as
 *    slots were opened, a hand would depend on which slots had already been visited — and
 *    a room would stop replaying from `(seed)` alone, breaking the shareable-room
 *    requirement inherited from TASK-1812.
 *
 * ⚠️ A hand is SHORT rather than padded when a role cannot supply five eligible cards.
 * Padding with ineligible cards is the one way an illegal candidate could be offered, and
 * this path has no validation behind it — the hard ban here is enforced by construction.
 *
 * ⚠️ The rng is drawn PER PICK, in slot order. Shuffling each bag independently, or
 * drawing all the indices up front, changes the draw sequence — and every room ever
 * shared by seed would then deal differently.
 *
 * ⚠️ Every option DEFAULTS OFF (TASK-1810), so a caller that predates the rule packs draws
 * the identical sequence it always did — that is what keeps `/game/draft` and the Chaos
 * control byte-identical. Note the size is part of the draw: the rng advances once per
 * card, so the same seed at a different hand size is a different room by design.
 */
export function roomDeals(
  pool: readonly PoolCard[],
  formation: Formation,
  seed: number,
  opts: DealOptions = {},
): PoolCard[][] {
  const {
    handSize = HAND_SIZE,
    standout = false,
    cheapest = false,
    onePerPlayer = false,
    bench,
    excludePlayers,
  } = opts;
  const rng = mulberry32(seed);
  const used = new Set<string | number>();
  const key = (c: PoolCard) => (onePerPlayer ? c.playerId : c.cardId);
  const ovr = (c: PoolCard) => c.ratings?.overall ?? 0;

  // ⚠️ Slots FIRST, bench after — see `DealOptions.bench`. The order is what keeps every
  // existing room's draw sequence untouched.
  const roles = [...formation.slots.map((s) => s.role), ...(bench ?? [])];

  return roles.map((role) => {
    const bag = pool.filter(
      (c) => excludePlayers?.has(c.playerId) !== true && !used.has(key(c)) && canPlay(c, role),
    );
    const hand: PoolCard[] = [];
    const take = (i: number) => {
      const [card] = bag.splice(i, 1);
      hand.push(card!);
      used.add(key(card!));
      // ⛔ Also drop that player's OTHER cards from THIS bag. `used` is only consulted
      // when the bag is built, so without this a single hand could offer the same man in
      // four different seasons — which is precisely what `onePerPlayer` exists to stop.
      if (onePerPlayer) {
        for (let j = bag.length - 1; j >= 0; j--) {
          if (bag[j]!.playerId === card!.playerId) bag.splice(j, 1);
        }
      }
    };

    // The guaranteed card is drawn FIRST, so it can never be crowded out by the random
    // four when a position is thin.
    if (standout && bag.length > 0) {
      const strong = bag.filter((c) => ovr(c) >= STANDOUT_OVR);
      if (strong.length > 0) {
        // Random among the strong ones — a club with fifty 80+ cards must not open the
        // same round with the same face every time.
        take(bag.indexOf(strong[Math.floor(rng() * strong.length)]!));
      } else {
        // No 80+ for this position, so the club's best available stands in. Deterministic
        // and draws no rng, which keeps thin clubs replayable too.
        let best = 0;
        for (let i = 1; i < bag.length; i++) if (ovr(bag[i]!) > ovr(bag[best]!)) best = i;
        take(best);
      }
    }

    /**
     * The cheapest eligible card, also drawn first and also with NO rng (TASK-1810).
     *
     * ⛔ This is what makes a budget draft completable. `domain/budget.ts` reserves the
     * cheapest card of each unfilled HAND, so guaranteeing the pool's cheapest eligible card
     * appears here is what makes the hand floor equal the pool floor — €46M rather than the
     * €137M–265M five random cards per slot produced, against a €100M cap.
     */
    if (cheapest && bag.length > 0) {
      let low = 0;
      for (let i = 1; i < bag.length; i++) {
        if ((bag[i]!.price ?? Infinity) < (bag[low]!.price ?? Infinity)) low = i;
      }
      take(low);
    }

    while (hand.length < handSize && bag.length > 0) take(Math.floor(rng() * bag.length));

    // ⚠️ Shuffled, or the guarantee becomes a tell: the strong card would sit in slot one
    // of every hand and the other four would never be read.
    if (standout) {
      for (let i = hand.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [hand[i], hand[j]] = [hand[j]!, hand[i]!];
      }
    }
    return hand;
  });
}

/**
 * The shapes this pool can actually field, one player per slot.
 *
 * ⚠️ Needed only because `onePerPlayer` collapses a club's cards to its distinct players
 * (TASK-1810). Measured across all 51 clubs: 46 can fill all 20 formations, but five
 * one-or-two-season clubs cannot — Barnsley and Oldham each fail three slots of a 2-3-5
 * Pyramid, which has five forward slots and a 26-player history to fill them from. Offering
 * a shape that strands an unfillable slot would deadlock the draft, so the picker asks this
 * first.
 *
 * Greedy, scarcest slot first — filling the hardest position while candidates remain is
 * what makes a single pass sufficient here.
 */
export function canField(pool: readonly PoolCard[], formation: Formation): boolean {
  const taken = new Set<number>();
  const order = formation.slots
    .map((s) => ({
      role: s.role,
      n: pool.filter((c) => canPlay(c, s.role)).length,
    }))
    .sort((a, b) => a.n - b.n);

  for (const slot of order) {
    const pick = pool.find((c) => !taken.has(c.playerId) && canPlay(c, slot.role));
    if (pick == null) return false;
    taken.add(pick.playerId);
  }
  return true;
}
