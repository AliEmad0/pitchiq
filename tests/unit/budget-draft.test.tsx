import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import {
  BUDGET_PACK,
  CAPTAINS_PACK,
  packFor,
  type DraftSpec,
} from "@/features/game/domain/rule-packs";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: vi.fn(async () => {}),
  loadMatch: vi.fn(async () => null),
  clearMatch: vi.fn(async () => {}),
}));

const { GamePlay } = await import("@/features/game/components/GamePlay");
const { PlayerCard } = await import("@/features/game/components/PlayerCard");

const ROLES: PlayerRole[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
];

/**
 * A wide price spread, so a hand holds BOTH sides of any sane ceiling.
 *
 * ⚠️ Without the spread the two assertions below would be vacuous in opposite directions: an
 * all-cheap pool disables nothing and an all-expensive one disables everything, and either
 * would stay green against an implementation that ignored the budget completely.
 */
const SPREAD = [10, 40, 120, 400, 900, 20];

/**
 * TWELVE per role, not six.
 *
 * ⛔ Six is not enough and the reason is worth keeping: `onePerPlayer` means a role used
 * twice by a shape — two CBs in a 4-4-2 — gives the first hand five of the six and leaves the
 * second with ONE. `roomDeals` deals short rather than padding, so if that leftover is the
 * £90.0m card, the reserve for that slot is £90.0m and the ceiling everywhere else collapses to
 * nothing. Every candidate came out disabled. The real pool has 50+ eligible cards per slot
 * and a £37M cheapest legal XI against a £100M cap, so it has no such cliff — but a fixture
 * that manufactures one tests a situation the mode never reaches.
 */
const PER_ROLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  PER_ROLE.map((i) => ({
    cardId: makeCardId(r * 100 + i, 2020 - (i % 6)),
    playerId: r * 100 + i,
    season: 2020 - (i % 6),
    name: `${role}Player${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50 + (i % 6) * 8,
    },
    club: "Liverpool",
    teamId: 40,
    price: SPREAD[i % SPREAD.length]!,
  })),
);

/** Budget Cap's rules: no `standout`, because a forced 80+ fights a cap. */
const BUDGET: DraftSpec = {
  handSize: 5,
  roam: "free",
  timer: null,
  /**
   * ⛔ READ OFF THE SHIPPED PACK, never restated — this literal is why the mode shipped with
   * a dead end (owner report, 2026-08-26).
   *
   * It said `true` here while `BUDGET_PACK` ships `false`, and `lockPicks` is the ONE field
   * that decides what a filled slot does when it is tapped: `true` re-opens it read-only,
   * `false` re-opens its HAND so the coach can swap. So every test in this file exercised
   * the read-only path of a mode that does not have one, and the swap path — the path that
   * dead-ended a full squad — had no coverage at all. A fixture that contradicts the pack it
   * stands for proves nothing about the pack.
   */
  lockPicks: BUDGET_PACK.draft?.lockPicks,
  onePerPlayer: true,
};

/**
 * ⚠️ `bench` and `confirm` are deliberately NOT taken from the pack here. Both are real
 * fields of it, but a bench adds five more hands off the same 12-per-role pool, and under
 * `onePerPlayer` a role the shape already uses twice would then deal its third hand short —
 * manufacturing the reserve cliff the `PER_ROLE` note above exists to avoid. The bench gets
 * its own deeper pool below.
 */
const WITH_BENCH: DraftSpec = { ...BUDGET, bench: true, confirm: true };

/** Deep enough that a role used by the shape AND the bench still deals full hands. */
const benchPool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 30 }, (_, i) => ({
    ...pool[0]!,
    cardId: makeCardId(9000 + r * 100 + i, 2020 - (i % 6)),
    playerId: 9000 + r * 100 + i,
    season: 2020 - (i % 6),
    name: `${role}Sub${i}`,
    role,
    price: SPREAD[i % SPREAD.length]!,
  })),
);

const render = (ui: ReactElement) => renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);
const spots = () => screen.getAllByRole("button", { name: /empty\. Choose a player|View card/ });
const lock = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Lock in / }));

describe("budget draft", () => {
  it("⛔ THE CONTROL — a pack with no budget renders no meter at all", async () => {
    // Legacy and Captain's Draft must be untouched by this mode.
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={BUDGET} />);
    await lock(user);
    expect(screen.queryByTestId("budget-meter")).toBeNull();
  });

  it("shows the meter on the pitch once a shape is locked", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={BUDGET} budget={600} />);
    await lock(user);
    expect(screen.getByTestId("budget-meter")).toBeInTheDocument();
  });

  it("⛔ every card is dealt, and exactly the unaffordable ones are DISABLED", async () => {
    /**
     * ⚠️ A PROPERTY, not a head-count, and that is deliberate. `PitchDraft` seeds itself with
     * `randomSeed()`, so the deal differs on every render — asserting "at least one is
     * disabled" would pass or fail on the draw, roughly two runs in three. Reading the
     * ceiling off the meter and checking each card against it holds for any deal.
     */
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={BUDGET} budget={600} />);
    await lock(user);
    await user.click(spots()[0]!);

    const veil = screen.getByRole("dialog", { name: /Choose your/ });
    // ⚠️ Scoped to the VEIL. The meter renders on the pitch too, because the veil covers the
    // pitch and a meter that lived only on the veil would vanish between rounds.
    // The Countdown meter states the ceiling as "£9.0m spendable right now".
    const ceiling = Number(
      /£([\d.]+)m spendable/.exec(within(veil).getByTestId("budget-meter").textContent ?? "")?.[1],
    );
    expect(Number.isFinite(ceiling)).toBe(true);

    const cards = within(veil).getAllByTestId("pd-candidate");
    expect(cards).toHaveLength(5); // dealt but disabled — never filtered out of the hand

    let enabled = 0;
    for (const card of cards) {
      const cost = Number(
        within(card)
          .getByTestId("card-cost")
          .textContent?.replace(/[^\d.]/g, ""),
      );
      const pick = within(card).getByRole("button", { name: /^Choose / });
      const blocked = pick.hasAttribute("disabled");
      expect(blocked, `£${cost}m against a £${ceiling}m ceiling`).toBe(cost > ceiling);
      // ⚠️ A disabled card must say HOW SHORT it is; "unavailable" alone teaches nothing.
      if (blocked) expect(pick.getAttribute("aria-label")).toMatch(/Over by/);
      else enabled += 1;
    }
    // ⭐ The reserve rule's second property, and the one thing here that IS structural: the
    // cheapest card in the open hand is always at or below the ceiling, so a hand is never
    // entirely dead however the deal falls.
    expect(enabled).toBeGreaterThan(0);
  });

  // ---- re-opening a filled slot (owner report, 2026-08-26) ----

  /**
   * ⚠️ By TESTID, not by accessible name. A round over a slot that already holds someone is
   * titled "Change your CF", not "Choose your CF" — the heading is part of what makes the
   * swap legible, so a name-matched query would break on the fix it is meant to prove.
   */
  const veil = () => screen.getByTestId("pd-veil");

  /** The ceiling the meter states, read out of the veil that is currently up. */
  const ceilingOf = () =>
    Number(
      /£([\d.]+)m spendable/.exec(
        within(veil()).getByTestId("budget-meter").textContent ?? "",
      )?.[1],
    );

  /** Buy the first card the ceiling allows. The reserve rule guarantees there is one. */
  const buyFirst = async (user: ReturnType<typeof userEvent.setup>) => {
    const pick = within(veil())
      .getAllByTestId("pd-candidate")
      // ⚠️ `query`, not `get` — on a re-opened slot one of the five is the man already in it,
      // and his control REMOVES him rather than choosing him.
      .map((c) => within(c).queryByRole("button", { name: /^Choose / }))
      .find((b) => b != null && !b.hasAttribute("disabled"));
    expect(pick, "the open hand is never entirely dead").toBeTruthy();
    await user.click(pick!);
  };

  it("⛔ a re-opened slot puts its occupant's fee BACK on the table", async () => {
    /**
     * THE DEAD END, at the surface. A filled slot re-opens its hand so the coach can swap —
     * but his fee stayed counted as spent, so the ceiling was the loose change alone. With a
     * full squad and £1.2m left, every card in the hand was priced out and the round has no
     * way out: the page was stuck until a reload threw the whole draft away.
     *
     * ⚠️ Asserts the ceiling RETURNS TO WHAT IT WAS, which holds for any deal. The seed is
     * drawn once at lock-in, so the reserve either side of the pick is the same number, and
     * the only thing that could move the ceiling is the pick itself — which is exactly what
     * re-opening the slot is supposed to undo.
     */
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={BUDGET} budget={600} />);
    await lock(user);

    await user.click(spots()[0]!);
    const before = ceilingOf();
    await buyFirst(user);

    await user.click(spots()[0]!); // the same slot, now filled
    expect(ceilingOf()).toBe(before);
    // ⚠️ And the heading acknowledges him, rather than asking again for a slot he fills.
    expect(within(veil()).getByRole("heading")).toHaveTextContent(/^Change your/);
  });

  it("⭐ the man in the slot is marked in his own hand, and tapping him drops him", async () => {
    // Owner's words: "when I click on his card a second time, it deselects the player". The
    // freed money is the point — dropping him is how the coach affords someone else.
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={BUDGET} budget={600} />);
    await lock(user);

    await user.click(spots()[0]!);
    await buyFirst(user);
    await user.click(spots()[0]!);

    // He is MARKED, so the coach can tell which of the five he is already holding.
    expect(within(veil()).getByTestId("pd-current-mark")).toBeInTheDocument();
    // ⚠️ Never disabled. Dropping a man costs nothing, so affordability has no say in it.
    const drop = within(veil()).getByTestId("pd-drop");
    expect(drop).toHaveAccessibleName(/^Remove /);
    expect(drop).not.toBeDisabled();
    await user.click(drop);

    expect(screen.queryByTestId("pd-veil")).toBeNull();
    expect(spots()[0]!).toHaveAccessibleName(/empty\. Choose a player/);
  });

  it("⛔ a round the coach opened himself can be BACKED OUT of, pick untouched", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={BUDGET} budget={600} />);
    await lock(user);

    await user.click(spots()[0]!);
    await buyFirst(user);
    const name = spots()[0]!.getAttribute("aria-label");

    await user.click(spots()[0]!);
    // The label names the man he keeps, so backing out is not a leap of faith.
    const back = within(veil()).getByTestId("veil-back");
    expect(back).toHaveTextContent(/^Keep /);
    await user.click(back);
    expect(screen.queryByTestId("pd-veil")).toBeNull();
    expect(spots()[0]!.getAttribute("aria-label")).toBe(name);
  });

  it("⛔ Escape backs out of a reconsiderable round too", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={BUDGET} budget={600} />);
    await lock(user);
    await user.click(spots()[0]!);
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("pd-veil")).toBeNull();
  });

  it("⛔ THE CONTROL — a pack that LOCKS picks keeps its round non-dismissable", async () => {
    /**
     * Legacy Club and Captain's Draft are the shipped surfaces this must not touch. Their
     * round IS the commitment ("the tap that picks one is final"), so it has no way out and
     * a filled slot re-opens read-only. The escape hatch is derived from `lockPicks`, not
     * from a mode check — modes are rule packs, not code paths.
     */
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={{ ...BUDGET, lockPicks: true }} budget={600} />);
    await lock(user);

    await user.click(spots()[0]!);
    expect(within(veil()).queryByTestId("veil-back")).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("pd-veil")).not.toBeNull();

    await buyFirst(user);
    await user.click(spots()[0]!);
    // Read-only: his card and a Close, no hand to choose from and nothing to drop.
    const review = screen.getByRole("dialog", { name: /your pick/ });
    expect(within(review).getAllByTestId("pd-candidate")).toHaveLength(1);
    expect(within(review).queryByTestId("pd-drop")).toBeNull();
    expect(within(review).queryByTestId("pd-current-mark")).toBeNull();
  });

  // ---- the bench, made legible (owner report, 2026-08-26) ----

  it("⭐ a bench slot names the man and his fee, not a bare rating", async () => {
    /**
     * Five 92px boxes reading "GK 74" were, in the owner's words, hard to see at a glance —
     * they carried neither who the man was nor what he cost, which are the two things a
     * squad list is for when the money is the game.
     */
    const user = userEvent.setup();
    render(<GamePlay pool={benchPool} draft={WITH_BENCH} budget={2000} />);
    await lock(user);

    const bench = screen.getByTestId("pd-bench");
    const slots = within(bench).getAllByTestId("pd-bench-slot");
    expect(slots).toHaveLength(5);
    // Empty slots say what they are FOR, so they read as work still to do.
    expect(slots[0]!).toHaveAccessibleName(/empty\. Choose a player/);
    expect(within(bench).getByTestId("pd-bench-count")).toHaveTextContent("0 of 5");

    await user.click(slots[0]!);
    await buyFirst(user);

    const filled = within(screen.getByTestId("pd-bench")).getAllByTestId("pd-bench-slot")[0]!;
    expect(filled.textContent).toMatch(/Sub\d/); // his NAME
    expect(within(filled).getByTestId("pd-bench-cost")).toHaveTextContent(/£[\d.]+m/);
    expect(screen.getByTestId("pd-bench-count")).toHaveTextContent("1 of 5");
  });

  // ---- the round's copy must state the rules the PACK actually has ----

  /**
   * ⛔ TASK-1836's rule, and #199 broke it in both directions at once.
   *
   * `pitchRoundHint` and `pitchNoTimer` were REWRITTEN IN PLACE for Budget Cap — "you can
   * change your mind until you confirm" and "swap anyone out until the squad and the money
   * both work" — while `PitchDraft` renders them on every pack's round. Legacy Club and
   * Captain's Draft ship `lockPicks: true` and no `confirm`, so both lines promised rules
   * those modes do not have, on a screen with no confirm button and no money at all. The
   * strings they replaced had been correct for Legacy for months.
   */
  const roundCopy = async (draft: DraftSpec) => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={draft} budget={600} />);
    await lock(user);
    await user.click(spots()[0]!);
    return veil().textContent ?? "";
  };

  it("⛔ a pack that LOCKS its picks says FINAL, and promises no confirm it has no button for", async () => {
    const text = await roundCopy({ ...BUDGET, lockPicks: true });
    expect(text).toMatch(/This pick is final/);
    expect(text).toMatch(/no way back once you choose/);
    // The two lies, both of them Budget Cap's rules and neither of them this pack's.
    expect(text).not.toMatch(/change your mind until you confirm/);
    expect(text).not.toMatch(/Swap anyone out/);
  });

  it("⛔ a pack whose picks are RECONSIDERABLE keeps the swap copy", async () => {
    const text = await roundCopy(BUDGET);
    expect(text).toMatch(/change your mind until you confirm/);
    expect(text).toMatch(/Swap anyone out/);
    expect(text).not.toMatch(/This pick is final/);
    expect(text).not.toMatch(/no way back once you choose/);
  });

  it("⭐ the 80+ promise is keyed on `standout`, NOT on finality", async () => {
    /**
     * ⚠️ THE TRAP this test exists for. All three shipped packs have `lockPicks === standout`
     * (Legacy and Captain's are true/true, Budget is false/absent), so a hint that carried the
     * 80+ sentence along with the finality sentence would be ACCIDENTALLY correct today — and
     * would become a lie the moment a pack ships `lockPicks: true` with no standout, which is
     * a legal spec. Each sentence is keyed on the field that makes it true.
     */
    expect(await roundCopy({ ...BUDGET, lockPicks: true, standout: true })).toMatch(
      /rated 80 or better/,
    );
  });

  it("⛔ THE CONTROL — a locked pack with NO standout claims no rating floor", async () => {
    const text = await roundCopy({ ...BUDGET, lockPicks: true });
    expect(text).toMatch(/This pick is final/); // it IS the locked copy
    expect(text).not.toMatch(/rated 80/); // …but it promises nothing about ratings
  });

  it("⛔ every SHIPPED pack's round copy matches its own spec", async () => {
    /**
     * Driven off the real `RulePack`s rather than a hand-written spec, so flipping `lockPicks`
     * on a shipped mode moves this assertion with it instead of leaving stale copy behind —
     * which is exactly what #199 did.
     */
    for (const [id, spec] of [
      ["legacy", packFor("legacy")?.draft],
      ["captains", CAPTAINS_PACK.draft],
      ["budget", BUDGET_PACK.draft],
    ] as const) {
      expect(spec, `${id} has a draft spec`).toBeDefined();
      cleanup();
      const text = await roundCopy(spec!);
      const final = spec!.lockPicks === true;
      expect(text, `${id} finality`).toMatch(final ? /This pick is final/ : /until you confirm/);
      if (spec!.standout === true) expect(text, `${id} standout`).toMatch(/rated 80 or better/);
      else expect(text, `${id} standout`).not.toMatch(/rated 80/);
    }
  });

  it("prints the indexed cost on the card face", () => {
    // Owner, 2026-08-25: the indexed cost ONLY. The card still carries its season, so a 2014
    // card reads as a 2014 card — what is hidden is the historical euro figure.
    renderWithIntl(<PlayerCard card={{ ...pool[0]!, price: 164 } as never} />);
    expect(screen.getByTestId("card-cost")).toHaveTextContent("16.4");
  });

  it("prints no cost at all for a card that has no price", () => {
    const unpriced = { ...pool[0]!, price: undefined };
    renderWithIntl(<PlayerCard card={unpriced as never} />);
    expect(screen.queryByTestId("card-cost")).toBeNull();
  });
});
