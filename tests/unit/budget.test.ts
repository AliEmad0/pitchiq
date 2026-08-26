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
