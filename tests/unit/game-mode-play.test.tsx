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

// ModePlay hands off to GamePlay, which reads the IndexedDB slot on mount. What is under
// test here is the chooser and the handoff, not the store.
vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: vi.fn(async () => {}),
  loadMatch: vi.fn(async () => null),
  clearMatch: vi.fn(async () => {}),
}));

const { ModePlay } = await import("@/features/game/components/ModePlay");

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
 * Two clubs' worth of real-shaped cards.
 *
 * ⚠️ SIX per role, not one. `canPlay` is a strict role match, so a round can only offer
 * three candidates if the club actually has three for that slot — a one-per-role fixture
 * would deal short hands and the "offers exactly three" assertion would be measuring the
 * fixture rather than the rule.
 */
const clubCards = (teamId: number, club: string): PoolCard[] =>
  ROLES.flatMap((role, r) =>
    [0, 1, 2, 3, 4, 5].map((i) => ({
      cardId: makeCardId(teamId * 1000 + r * 10 + i, 2020),
      playerId: teamId * 1000 + r * 10 + i,
      season: 2020,
      name: `${club}-${role}-${i}`,
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
      club,
      teamId,
    })),
  );

const pool: PoolCard[] = [...clubCards(33, "Manchester United"), ...clubCards(40, "Liverpool")];

/** Legacy Club's rules, as the pack declares them. */
const LEGACY_DRAFT: DraftSpec = { handSize: 3, roam: "sequential" };

/** `GamePlay` mirrors its phase into the URL, and `useQueryState` throws without an adapter. */
const render = (ui: ReactElement) => renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);

/** Club → formation → rounds, the owner's flow. Returns once the first round is on screen. */
async function chooseAndStart(user: ReturnType<typeof userEvent.setup>, club: RegExp) {
  await user.click(screen.getByRole("button", { name: club }));
  await user.click(screen.getByRole("button", { name: "Start the draft" }));
}

describe("ModePlay", () => {
  it("⚠️ shows a club chooser before any drafting, labelled from DATA", () => {
    // The AST guard rejects hardcoded strings under features/game, and a hardcoded club
    // name would also ship English into the Arabic UI. Names come off the cards.
    render(<ModePlay pool={pool} chooser={{ kind: "club" }} draft={LEGACY_DRAFT} />);
    expect(screen.getByRole("button", { name: /Manchester United/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Liverpool/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rated/ })).toBeNull();
  });

  it("⛔ deals ONLY the chosen club's cards", async () => {
    // The whole point of the mode. If the filter leaks, Legacy is just Chaos.
    const user = userEvent.setup();
    render(<ModePlay pool={pool} chooser={{ kind: "club" }} draft={LEGACY_DRAFT} />);
    await chooseAndStart(user, /Liverpool/);

    const offered = screen.getAllByRole("button", { name: /rated/ });
    expect(offered.length).toBeGreaterThan(0);
    for (const card of offered) {
      expect(card.getAttribute("aria-label")).toMatch(/^Liverpool-/);
    }
  });

  it("⚠️ a round offers exactly three cards on a sequential board", async () => {
    // The two halves of the owner's mechanic, read off the pack rather than hardcoded in
    // a Legacy component — and the board must carry no slot buttons at all.
    const user = userEvent.setup();
    render(<ModePlay pool={pool} chooser={{ kind: "club" }} draft={LEGACY_DRAFT} />);
    await chooseAndStart(user, /Manchester United/);

    expect(screen.getAllByRole("button", { name: /rated/ })).toHaveLength(3);
    expect(screen.queryAllByRole("button", { name: /^Slot/ })).toHaveLength(0);
    expect(screen.getByText("Round 1 of 11")).toBeInTheDocument();
  });

  it("the coach picks the shape before the rounds begin", async () => {
    const user = userEvent.setup();
    render(<ModePlay pool={pool} chooser={{ kind: "club" }} draft={LEGACY_DRAFT} />);
    await user.click(screen.getByRole("button", { name: /Liverpool/ }));

    const shape = screen.getByRole("combobox", { name: "Formation" });
    await user.selectOptions(shape, "3-5-2");
    await user.click(screen.getByRole("button", { name: "Start the draft" }));

    // 3-5-2 opens on a keeper like every shape, but its outfield lines differ from the
    // default 4-4-2 — so the round count staying at eleven is the assertion that holds
    // across shapes.
    expect(screen.getByText("Round 1 of 11")).toBeInTheDocument();
  });

  it("⛔ THE CONTROL — a pack with no chooser and no draft renders the shipped hub", () => {
    // `/game/chaos` and `/game/draft` go through GamePlay untouched: no club step, and the
    // free-build hub rather than rounds.
    render(<ModePlay pool={pool} />);
    expect(screen.queryByRole("button", { name: /Manchester United$/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
  });
});
