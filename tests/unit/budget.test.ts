import { describe, expect, it } from "vitest";
import { budgetView, canAfford } from "@/features/game/domain/budget";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";

/**
 * A card is identified by player and season; only the id and the price matter here.
 *
 * ⚠️ Prices are TENTHS of a million (`500` = £50.0m), matching `PoolCard.price`. Integers,
 * so summing ten of them for the reserve can never drift the way floats would.
 */
const card = (playerId: number, price: number | undefined): PoolCard =>
  ({ cardId: makeCardId(playerId, 2020), playerId, price }) as unknown as PoolCard;

const HANDS = [
  [card(1, 500), card(2, 30)],
  [card(3, 400), card(4, 50)],
  [card(5, 200), card(6, 70)],
];

describe("budget", () => {
  it("spends nothing and reserves every OTHER hand at the start", () => {
    const view = budgetView(HANDS, [null, null, null], 1000, 0);
    expect(view.spent).toBe(0);
    // The open slot is not reserved against itself; the other two contribute their cheapest.
    expect(view.reserve).toBe(120);
    expect(view.ceiling).toBe(880);
  });

  it("counts a pick's real cost and drops its slot from the reserve", () => {
    const view = budgetView(HANDS, [makeCardId(1, 2020), null, null], 1000, 1);
    expect(view.spent).toBe(500);
    expect(view.remaining).toBe(500);
    expect(view.reserve).toBe(70); // only slot 2 is unfilled and unopened
    expect(view.ceiling).toBe(430);
  });

  it("reads the HANDS, not the pool — a cheap card elsewhere never covers an expensive slot", () => {
    // ⛔ THE fixture that separates this implementation from a pool-wide one. Slot 0's hand
    // is all-expensive (think: the goalkeeper hand); a pool-wide "cheapest card overall"
    // would reserve 1M for it and let the coach overspend by 29M, dead-ending the draft.
    const hands = [[card(1, 300)], [card(2, 10), card(3, 900)]];
    const view = budgetView(hands, [null, null], 1000, 1);
    expect(view.reserve).toBe(300);
    expect(view.ceiling).toBe(700);
  });

  it("always leaves at least one card in the open hand affordable", () => {
    // ⭐ Property 2 of the reserve rule. Spend the maximum on slot 0, then slot 1 must still
    // have something clickable — otherwise the coach reaches a hand he cannot answer.
    const hands = [
      [card(1, 600), card(2, 40)],
      [card(3, 600), card(4, 60)],
    ];
    const first = budgetView(hands, [null, null], 700, 0);
    expect(first.ceiling).toBe(640);

    const second = budgetView(hands, [makeCardId(1, 2020), null], 700, 1);
    expect(hands[1]!.some((c) => canAfford(c, second))).toBe(true);
  });

  it("treats a missing price as unaffordable rather than free", () => {
    // ⚠️ The pool builder filters unpriced cards out, so this should be unreachable — but a
    // silent zero is exactly the kind of default that would hand the coach a free superstar.
    const noPrice = card(9, undefined);
    const view = budgetView([[noPrice]], [null], 1000, 0);
    expect(canAfford(noPrice, view)).toBe(false);
  });

  it("⛔ REFUNDS the man in the slot being re-drafted, or a full squad DEAD-ENDS", () => {
    /**
     * The shipped bug, at the arithmetic (owner report, 2026-08-26).
     *
     * A full squad has £1.0m of change. The coach taps a filled slot to swap someone out —
     * and the man he is replacing is STILL counted as spent, so the ceiling is the change
     * alone. Every card in that slot's own hand is dearer than that, all five come out
     * disabled, and `PitchDraft` has put up a round that cannot be dismissed. Stuck for good.
     *
     * ⚠️ `open` means "the slot being drafted". Its CURRENT contents must not constrain the
     * pick being made — not its hand's minimum (that half always worked) and not its
     * occupant's fee (this half never did).
     */
    const picks = [makeCardId(1, 2020), makeCardId(3, 2020), makeCardId(5, 2020)];
    const budget = 1110;

    const full = budgetView(HANDS, picks, budget, null);
    expect(full.spent).toBe(1100);
    expect(full.remaining).toBe(10);
    // The dead end: nothing in slot 0's hand is buyable out of £1.0m of change.
    expect(HANDS[0]!.some((c) => canAfford(c, full))).toBe(false);

    // Slot 0 re-opens. Its £50.0m occupant goes back on the table; the other two do not.
    const swap = budgetView(HANDS, picks, budget, 0);
    expect(swap.spent).toBe(600);
    expect(swap.reserve).toBe(0);
    expect(swap.ceiling).toBe(510);
    expect(HANDS[0]!.every((c) => canAfford(c, swap))).toBe(true);
  });

  it("⭐ the man already in a slot is always affordable when that slot re-opens", () => {
    /**
     * Property 2 of the reserve rule, extended to the re-draft — and the reason a hand can
     * never be dead however tight the money got. He came out of THIS hand and his own fee is
     * refunded, so `cost ≤ ceiling` holds for him by the same induction that makes the first
     * pass safe. The coach can therefore always put the veil back the way he found it.
     */
    const hands = [
      [card(1, 600), card(2, 40)],
      [card(3, 600), card(4, 60)],
    ];
    // Spent to the last tenth: £60.0m at slot 0 and £6.0m at slot 1 against a £66.0m cap.
    const picks = [makeCardId(1, 2020), makeCardId(4, 2020)];
    const view = budgetView(hands, picks, 660, 0);
    expect(view.remaining).toBe(600); // only slot 1's £6.0m is still committed
    expect(canAfford(hands[0]![0]!, view)).toBe(true);
  });

  it("⚠️ an open slot that is EMPTY still reserves nothing and spends nothing", () => {
    // The regression guard for the refund: the first-pass behaviour is unchanged, so Legacy
    // and Captain's Draft — which never re-open a filled slot — see the identical numbers.
    const view = budgetView(HANDS, [null, makeCardId(3, 2020), null], 1000, 0);
    expect(view.spent).toBe(400);
    expect(view.reserve).toBe(70);
    expect(view.ceiling).toBe(530);
  });

  it("keeps reserving once the room is full and nothing is open", () => {
    const view = budgetView(
      HANDS,
      [makeCardId(2, 2020), makeCardId(4, 2020), makeCardId(6, 2020)],
      1000,
      null,
    );
    expect(view.spent).toBe(150);
    expect(view.reserve).toBe(0);
    expect(view.ceiling).toBe(850);
  });
});
