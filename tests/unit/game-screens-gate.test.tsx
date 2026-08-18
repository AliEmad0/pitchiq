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

/** Six per role — `canPlay` is a strict role match, so a thin pool deals short hands. */
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3, 4, 5].map((i) => ({
    cardId: makeCardId(r * 10 + i, 2020 - i),
    playerId: r * 10 + i,
    season: 2020 - i,
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
      overall: 50 + i * 8,
    },
    club: "Liverpool",
    teamId: 40,
  })),
);

const LEGACY_DRAFT: DraftSpec = {
  handSize: 5,
  roam: "free",
  timer: null,
  lockPicks: true,
  standout: true,
  onePerPlayer: true,
};

const render = (ui: ReactElement) => renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);

/** Lock the shape, then fill all eleven positions — the only way to reach `preview`. */
async function draftAnXi(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Lock in / }));
  for (let i = 0; i < 11; i++) {
    const empty = screen.getAllByRole("button", { name: /empty\. Choose a player/ });
    await user.click(empty[0]);
    await user.click(screen.getAllByRole("button", { name: /^Choose / })[0]);
  }
}

/**
 * TASK-1810 — the CONTROL for the match-screen redesign.
 *
 * The programme reaches only packs declaring `screens: "legacy"`. `/game/draft`,
 * `/game/chaos` and `/game/daily` declare nothing, so they must keep the shipped
 * `MatchupPreview`.
 *
 * ⚠️ Both cases drive a REAL draft to a REAL preview. An earlier version of this file
 * passed `initialPhase="preview"` without a squad — but `GamePlay` falls back to setup
 * while `match` is null, so NEITHER branch rendered and the control passed over a gate
 * that was never exercised. A fixture that cannot occur proves nothing.
 */
describe("the screens gate", () => {
  it("⛔ THE CONTROL — a pack declaring no screens gets the SHIPPED preview", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY_DRAFT} />);
    await draftAnXi(user);

    expect(screen.getByText("Before kick-off")).toBeInTheDocument();
    expect(screen.queryAllByTestId("prog-card")).toHaveLength(0);
    expect(screen.queryAllByTestId("prog-bar")).toHaveLength(0);
  });

  it("a pack declaring screens=legacy gets the matchday programme", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY_DRAFT} screens="legacy" />);
    await draftAnXi(user);

    expect(screen.queryByText("Before kick-off")).toBeNull();
    expect(screen.getByText("The teams")).toBeInTheDocument();
    expect(screen.getAllByTestId("prog-bar")).toHaveLength(4);
    expect(screen.getAllByTestId("prog-card")).toHaveLength(22);
  });
});
