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
      overall: 50 + i * 8, // reaches 90, so a standout exists
    },
    club: "Liverpool",
    teamId: 40,
  })),
);

const LEGACY: DraftSpec = {
  handSize: 5,
  roam: "free",
  timer: null,
  lockPicks: true,
  standout: true,
  onePerPlayer: true,
};

const render = (ui: ReactElement) => renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);
const spots = () => screen.getAllByRole("button", { name: /empty\. Choose a player|View card/ });
const lock = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Lock in / }));

describe("PitchDraft", () => {
  it("⛔ THE CONTROL — a pack with no draft spec still gets the shipped hub", () => {
    render(<GamePlay pool={pool} />);
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Lock in / })).toBeNull();
  });

  it("opens on the shape chooser, and the shape is not yet committed", () => {
    render(<GamePlay pool={pool} draft={LEGACY} />);
    expect(screen.getByRole("dialog", { name: "Choose your shape" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock in 4-4-2 Flat" })).toBeInTheDocument();
  });

  it("⛔ no position can be filled until the shape is locked", () => {
    // The whole draft is built around the shape, so drafting into an uncommitted one would
    // let a coach place players and then move the goalposts.
    render(<GamePlay pool={pool} draft={LEGACY} />);
    for (const s of screen.getAllByRole("button", { name: /GK|CB|CM|CF/ })) {
      if (s.className.includes("pd-spot")) expect(s).toBeDisabled();
    }
  });

  it("⚠️ choosing a shape re-labels the lock button, so the commit names what it commits", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY} />);
    await user.click(screen.getByRole("button", { name: "3-5-2" }));
    expect(screen.getByRole("button", { name: "Lock in 3-5-2" })).toBeInTheDocument();
  });

  it("locking clears the chooser and opens the pitch", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY} />);
    await lock(user);
    expect(screen.queryByRole("dialog", { name: "Choose your shape" })).toBeNull();
    expect(spots()).toHaveLength(11);
    expect(spots()[0]).toBeEnabled();
  });

  it("⚠️ a position deals exactly five cards", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY} />);
    await lock(user);
    await user.click(spots()[0]);
    const veil = screen.getByRole("dialog", { name: /Choose your/ });
    expect(within(veil).getAllByRole("button", { name: /^Choose / })).toHaveLength(5);
  });

  it("⛔ a round CANNOT be dismissed — the only way out is choosing", async () => {
    // The pick is final, so an escape hatch would be the one way to end up with an
    // unfillable board: a slot left open with its hand already spent.
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY} />);
    await lock(user);
    await user.click(spots()[0]);
    const veil = screen.getByRole("dialog", { name: /Choose your/ });
    expect(within(veil).queryByRole("button", { name: "Close" })).toBeNull();
    await user.click(veil);
    expect(screen.getByRole("dialog", { name: /Choose your/ })).toBeInTheDocument();
  });

  it("picking puts the player's name and rating on the pitch", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY} />);
    await lock(user);
    await user.click(spots()[0]);
    const first = screen.getAllByRole("button", { name: /^Choose / })[0];
    const name = /^Choose ([^,]+),/.exec(first.getAttribute("aria-label") ?? "")?.[1] ?? "";
    await user.click(first);

    expect(screen.queryByRole("dialog", { name: /Choose your/ })).toBeNull();
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText("1 of 11 positions set")).toBeInTheDocument();
  });

  it("⚠️ a filled position reopens as a REVIEW, and that one closes", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY} />);
    await lock(user);
    await user.click(spots()[0]);
    await user.click(screen.getAllByRole("button", { name: /^Choose / })[0]);

    await user.click(screen.getByRole("button", { name: /View card/ }));
    const review = screen.getByRole("dialog", { name: /your pick/ });
    // ⚠️ Nothing selectable — the pick was final, so a review must not offer a second one.
    expect(within(review).queryByRole("button", { name: /^Choose / })).toBeNull();
    await user.click(within(review).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: /your pick/ })).toBeNull();
  });

  it("⚠️ the way back to the club menu is a LINK, and only before the shape is locked", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={pool} draft={LEGACY} backHref="/game/legacy" />);
    expect(screen.getByRole("link", { name: "Choose a different club" })).toHaveAttribute(
      "href",
      "/game/legacy",
    );
    await lock(user);
    expect(screen.queryByRole("link", { name: "Choose a different club" })).toBeNull();
  });
});
