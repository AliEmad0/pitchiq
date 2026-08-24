import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

// Reduced motion → the reveal settles immediately and the conveyor-out does not stall
// the hand-off, so the flow can be driven click by click.
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

/** Distinct names per card, so an XI can be identified by what is written on it. */
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
    cardId: makeCardId(r * 10 + i, 2020 - i),
    playerId: r * 10 + i,
    season: 2020 - i,
    name: `${role} Name${r}x${i}`,
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
    club: "Liverpool",
    teamId: 40,
  })),
);

const render = (ui: ReactElement) => renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);

/** `/game/chaos` as the route mounts it. */
const chaos = () => (
  <GamePlay pool={pool} initialPhase="setup" setup="reveal" screens="legacy" />
);

/**
 * TASK-1838 — chaos runs on the interactive driver.
 *
 * Chaos used to batch-`simulate()` a finished match inside its own component and render
 * the playback, so it had no preview and no summary and nothing in it was coachable.
 * These drive the REAL flow from the Match Night board, because a fixture that cannot
 * occur proves nothing: an `initialPhase="preview"` shortcut would fall straight back to
 * setup, `match` being null, and assert over a screen that never rendered.
 */
describe("chaos on the match driver", () => {
  it("hands the drafted XI up to the matchday programme instead of playing it itself", async () => {
    const user = userEvent.setup();
    render(chaos());

    // The setup phase is still Match Night, untouched.
    expect(screen.getByRole("group", { name: "Matchday board" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Play Match/ }));

    // ⛔ The phase chaos never had. Before this ticket, Play went straight to a finished
    // match's playback.
    expect(await screen.findByText("The teams")).toBeInTheDocument();
    expect(screen.getAllByTestId("prog-card")).toHaveLength(22);
  });

  /**
   * ⛔ THE REGRESSION GUARD for the seed hand-up.
   *
   * `buildSession` re-drafts the RIVAL from the seed, so if the setup screen's seed is not
   * the one the match is built from, the coach walks out against an opponent he was never
   * introduced to. Both sides of this assertion are read off the SCREEN — the board's away
   * dots and the programme's away XI — so nothing is re-derived from the same seed that
   * would make the check agree with itself.
   */
  it("plays the rival the board introduced, not a fresh draw", async () => {
    const user = userEvent.setup();
    render(chaos());

    const onBoard = [...document.querySelectorAll(".mn-dot-away i")].map((el) => el.textContent);
    expect(onBoard).toHaveLength(11);

    await user.click(screen.getByRole("button", { name: /Play Match/ }));
    await screen.findByText("The teams");

    const inProgramme = [...document.querySelectorAll(".lg-xi-away .lg-xi-card")].map(
      (el) => el.textContent ?? "",
    );
    expect(inProgramme).toHaveLength(11);
    // Both lists run in slot order, so the rival is the same man in the same place.
    onBoard.forEach((name, i) => {
      expect(name).toBeTruthy();
      expect(inProgramme[i]).toContain(name);
    });
  });

  it("makes the match COACHABLE — kick-off reaches the live feed with the bench", async () => {
    const user = userEvent.setup();
    render(chaos());
    await user.click(screen.getByRole("button", { name: /Play Match/ }));
    await screen.findByText("The teams");
    await user.click(screen.getByRole("button", { name: /Kick off/i }));

    expect(await screen.findByText("The comments")).toBeInTheDocument();
    // Both sheets carry one, hence `getAll` — the coach's is the point, its presence is
    // what makes the match coachable at all.
    expect(screen.getAllByText("Substitutes").length).toBeGreaterThan(0);
    expect(document.querySelector(".lg-live")).not.toBeNull();
  });
});
