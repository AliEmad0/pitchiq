import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { DraftSpec } from "@/features/game/domain/rule-packs";
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
const SPREAD = [1_000_000, 4_000_000, 12_000_000, 40_000_000, 90_000_000, 2_000_000];

/**
 * TWELVE per role, not six.
 *
 * ⛔ Six is not enough and the reason is worth keeping: `onePerPlayer` means a role used
 * twice by a shape — two CBs in a 4-4-2 — gives the first hand five of the six and leaves the
 * second with ONE. `roomDeals` deals short rather than padding, so if that leftover is the
 * €90M card, the reserve for that slot is €90M and the ceiling everywhere else collapses to
 * nothing. Every candidate came out disabled. The real pool has 50+ eligible cards per slot
 * and a €37M cheapest legal XI against a €100M cap, so it has no such cliff — but a fixture
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
    costEur: SPREAD[i % SPREAD.length]!,
  })),
);

/** Budget Cap's rules: no `standout`, because a forced 80+ fights a cap. */
const BUDGET: DraftSpec = {
  handSize: 5,
  roam: "free",
  timer: null,
  lockPicks: true,
  onePerPlayer: true,
};

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
    render(<GamePlay pool={pool} draft={BUDGET} budget={60_000_000} />);
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
    render(<GamePlay pool={pool} draft={BUDGET} budget={60_000_000} />);
    await lock(user);
    await user.click(spots()[0]!);

    const veil = screen.getByRole("dialog", { name: /Choose your/ });
    // ⚠️ Scoped to the VEIL. The meter renders on the pitch too, because the veil covers the
    // pitch and a meter that lived only on the veil would vanish between rounds.
    const ceiling = Number(
      /Max this pick €(\d+)M/.exec(within(veil).getByTestId("budget-meter").textContent ?? "")?.[1],
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
      expect(blocked, `${cost}M against a ${ceiling}M ceiling`).toBe(cost > ceiling);
      // ⚠️ A disabled card must say HOW SHORT it is; "unavailable" alone teaches nothing.
      if (blocked) expect(pick.getAttribute("aria-label")).toMatch(/Over by/);
      else enabled += 1;
    }
    // ⭐ The reserve rule's second property, and the one thing here that IS structural: the
    // cheapest card in the open hand is always at or below the ceiling, so a hand is never
    // entirely dead however the deal falls.
    expect(enabled).toBeGreaterThan(0);
  });

  it("prints the indexed cost on the card face", () => {
    // Owner, 2026-08-25: the indexed cost ONLY. The card still carries its season, so a 2014
    // card reads as a 2014 card — what is hidden is the historical euro figure.
    renderWithIntl(<PlayerCard card={{ ...pool[0]!, costEur: 22_000_000 } as never} />);
    expect(screen.getByTestId("card-cost")).toHaveTextContent("22");
  });

  it("prints no cost at all for a card that has no price", () => {
    const unpriced = { ...pool[0]!, costEur: undefined };
    renderWithIntl(<PlayerCard card={unpriced as never} />);
    expect(screen.queryByTestId("card-cost")).toBeNull();
  });
});
