import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { NATION_PACK } from "@/features/game/domain/rule-packs";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: vi.fn(async () => {}),
  loadMatch: vi.fn(async () => null),
  clearMatch: vi.fn(async () => {}),
}));

const { GamePlay } = await import("@/features/game/components/GamePlay");

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
 * Egypt everywhere EXCEPT centre-back; Senegal (same continent) and France (another) cover
 * everything. Opening a CB round must widen to Africa — visibly — while a GK round stays
 * Egyptian and shows no ring furniture at all.
 */
const make = (code: string, offset: number, skip?: PlayerRole): PoolCard[] =>
  ROLES.filter((r) => r !== skip).flatMap((role, r) =>
    Array.from({ length: 6 }, (_, i) => ({
      cardId: makeCardId(offset + r * 100 + i, 2020),
      playerId: offset + r * 100 + i,
      season: 2020,
      name: `${code}-${role}-${i}`,
      role,
      altRoles: [] as PlayerRole[],
      foot: null,
      height: null,
      provenance: null,
      ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 60 },
      club: "Club",
      nationalityCode: code,
    })),
  );

const pool: PoolCard[] = [...make("eg", 1000, "CB"), ...make("sn", 30000), ...make("fr", 60000)];

/**
 * ⛔ READ OFF THE SHIPPED PACK, never restated (the #201 lesson, stated the third time this
 * file family has needed it): `lockPicks`/`standout` decide what the round says and does,
 * and a fixture that contradicts the pack proves nothing about the pack.
 */
const DRAFT = NATION_PACK.draft!;

const render = (ui: ReactElement) => renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);
const lock = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Lock in / }));
const veil = () => screen.getByTestId("pd-veil");

describe("nationality draft", () => {
  it("⭐ a WIDENED round says so — the ring line, and a chip on every card", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={DRAFT} nation="eg" />);
    await lock(user);

    await user.click(screen.getAllByRole("button", { name: /^CB, empty/ })[0]!);
    // The line names both ends of the widening: no one left from Egypt → dealing from Africa.
    const line = within(veil()).getByTestId("pd-ring-line");
    expect(line).toHaveTextContent(/Egypt/);
    expect(line).toHaveTextContent(/Africa/);
    // Every card in a widened hand carries the chip — the hand is single-ring, so "some do"
    // would be the same bug the ticket warns about, half fixed.
    const cards = within(veil()).getAllByTestId("pd-candidate");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(within(card).getByTestId("pd-ring-chip")).toHaveTextContent("Africa");
    }
  });

  it("⛔ THE CONTROL — a countryman round shows NO ring furniture, and no budget meter", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={DRAFT} nation="eg" />);
    await lock(user);

    await user.click(screen.getByRole("button", { name: /^GK, empty/ }));
    expect(within(veil()).queryByTestId("pd-ring-line")).toBeNull();
    expect(within(veil()).queryByTestId("pd-ring-chip")).toBeNull();
    // The nation prop must not smuggle in any OTHER pack's furniture.
    expect(screen.queryByTestId("budget-meter")).toBeNull();
    // And the pack's own copy: picks are final here, and no 80+ promise is made.
    expect(veil().textContent).toMatch(/This pick is final/);
    expect(veil().textContent).not.toMatch(/rated 80/);
  });

  it("⛔ THE OTHER CONTROL — without `nation`, the same pool renders ring-free", async () => {
    // The prop is the gate. A pack that never passes it — every other mode — must render
    // this exact pool exactly as it did before TASK-1842 existed.
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={DRAFT} />);
    await lock(user);
    await user.click(screen.getAllByRole("button", { name: /^CB, empty/ })[0]!);
    expect(within(veil()).queryByTestId("pd-ring-line")).toBeNull();
    expect(within(veil()).queryByTestId("pd-ring-chip")).toBeNull();
  });

  it("an UNPICKED countryman returns to the next same-role round (owner report)", async () => {
    /**
     * The report, on the surface it happened on: Egypt has three CM-eligible men and a
     * 4-4-2 has two CM slots. Picking one in the first CM round must leave the OTHER TWO
     * in the second CM round - with precomputed hands the first round consumed all three
     * and the second widened to Africa, which read as two countrymen simply vanishing.
     */
    const user = userEvent.setup();
    const three = [
      ...make("eg", 1000, "CB").filter((c) => c.role !== "CM"),
      // exactly THREE Egyptian CMs
      ...make("eg", 90000)
        .filter((c) => c.role === "CM")
        .slice(0, 3),
      ...make("sn", 30000),
      ...make("fr", 60000),
    ];
    render(<GamePlay pool={three} draft={DRAFT} nation="eg" />);
    await lock(user);

    // First CM round: all three Egyptians on offer.
    await user.click(screen.getAllByRole("button", { name: /^CM, empty/ })[0]!);
    let cards = within(veil()).getAllByTestId("pd-candidate");
    expect(cards).toHaveLength(3);
    expect(within(veil()).queryByTestId("pd-ring-chip")).toBeNull();
    await user.click(within(cards[0]!).getByRole("button", { name: /^Choose / }));

    // Second CM round: the two he did NOT pick - still Egyptian, still no widening.
    await user.click(screen.getAllByRole("button", { name: /^CM, empty/ })[0]!);
    cards = within(veil()).getAllByTestId("pd-candidate");
    expect(cards).toHaveLength(2);
    expect(within(veil()).queryByTestId("pd-ring-line")).toBeNull();
    expect(within(veil()).queryByTestId("pd-ring-chip")).toBeNull();
  });

  it("the back link names the choice — a different COUNTRY, not a different club", async () => {
    render(<GamePlay pool={pool} draft={DRAFT} nation="eg" backHref="/game/nation" />);
    expect(screen.getByRole("link", { name: /country/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/game/nation"),
    );
  });
});
