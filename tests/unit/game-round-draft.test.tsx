import { screen } from "@testing-library/react";
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

// The container reads the IndexedDB slot on mount. What is under test is which SETUP
// surface a pack gets, not the store.
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
 * One club's cards, six per role.
 *
 * ⚠️ Six, not one. `canPlay` is a strict role match, so a round can only offer three
 * candidates if the club actually has three for that slot — a thin fixture would deal short
 * hands and "offers exactly three" would be measuring the fixture rather than the rule.
 */
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3, 4, 5].map((i) => ({
    cardId: makeCardId(r * 10 + i, 2020 - i),
    playerId: r * 10 + i,
    season: 2020 - i,
    name: `${role}-${i}`,
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
      overall: 50 + i,
    },
    club: "Manchester United",
    teamId: 33,
  })),
);

const LEGACY_DRAFT: DraftSpec = { handSize: 3, roam: "sequential" };

/** `GamePlay` mirrors its phase into the URL, and `useQueryState` throws without an adapter. */
const render = (ui: ReactElement) => renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);

describe("GamePlay setup — which draft a pack gets", () => {
  it("⛔ THE CONTROL — no `draft` still renders the shipped free-build hub", () => {
    // `/game/draft` and `/game/chaos` go through this same container and must be unmoved.
    render(<GamePlay pool={pool} />);
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start the draft" })).toBeNull();
  });

  it("a pack with a draft spec picks its shape FIRST", () => {
    // The owner's flow is club → formation → rounds, so no cards may be dealt before the
    // coach has chosen a shape — the round's position comes from the formation's slot.
    render(<GamePlay pool={pool} draft={LEGACY_DRAFT} />);
    expect(screen.getByRole("combobox", { name: "Formation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rated/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Auto-fill" })).toBeNull();
  });

  it("⚠️ starting deals rounds of exactly three on a sequential board", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY_DRAFT} />);
    await user.click(screen.getByRole("button", { name: "Start the draft" }));

    expect(screen.getAllByRole("button", { name: /rated/ })).toHaveLength(3);
    expect(screen.getByText("Round 1 of 11")).toBeInTheDocument();
    // ⛔ Not disabled buttons — dead tab stops leading nowhere are the locked anti-pattern.
    expect(screen.queryAllByRole("button", { name: /^Slot/ })).toHaveLength(0);
  });

  it("the chosen shape drives the rounds", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY_DRAFT} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Formation" }), "3-5-2");
    await user.click(screen.getByRole("button", { name: "Start the draft" }));

    // 3-5-2 opens on a keeper like every shape; what proves the shape was carried through
    // is that the round count is its slot count.
    expect(screen.getByText("Round 1 of 11")).toBeInTheDocument();
  });

  it("⚠️ the way back to the club menu is a LINK, not a button", async () => {
    // The club is a route segment now, so going back is navigation. A button would need a
    // callback the server page has no way to provide.
    render(<GamePlay pool={pool} draft={LEGACY_DRAFT} backHref="/game/legacy" />);
    const back = screen.getByRole("link", { name: "Choose a different club" });
    expect(back).toHaveAttribute("href", "/game/legacy");

    // …and it is gone once the rounds are under way, where there is nothing to go back to.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Start the draft" }));
    expect(screen.queryByRole("link", { name: "Choose a different club" })).toBeNull();
  });
});
