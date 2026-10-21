import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "./_helpers/intl";
import { STYLE_POOL } from "./fixtures/style-pool";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const slot = {
  saved: null as null | { style?: string },
  save: vi.fn(async (m: unknown) => {
    slot.saved = m as { style?: string };
  }),
  load: vi.fn(async () => null),
  clear: vi.fn(async () => {
    slot.saved = null;
  }),
};
vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: (m: unknown) => slot.save(m),
  loadMatch: () => slot.load(),
  clearMatch: () => slot.clear(),
}));

const { GamePlay } = await import("@/features/game/components/GamePlay");

/**
 * TASK-1825 — on the matchday programme the coach reads the scout, picks a style, presses
 * Kick off to see what the opponent actually played, then Walk out starts the match.
 */
const renderPlay = (ui: ReactElement) =>
  renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);
const playerNames = () =>
  screen
    .queryAllByText(/^[A-Z]{2,3}-\d$/)
    .map((e) => e.textContent)
    .sort();

async function reachProgramme(user: ReturnType<typeof userEvent.setup>) {
  renderPlay(<GamePlay pool={STYLE_POOL} screens="legacy" />);
  await user.click(await screen.findByRole("button", { name: "Auto-fill" }));
  await user.click(screen.getByRole("button", { name: "Play match" }));
  await screen.findByRole("region", { name: "Scouting report" });
  // TASK-1814 — the programme names who carries a personality.
  expect(screen.getByTestId("traits-panel")).toBeInTheDocument();
}

describe("GamePlay — the Scout's Dossier", () => {
  beforeEach(() => {
    slot.saved = null;
    slot.save.mockClear();
    window.localStorage.clear();
  });

  it("Kick off reveals the opponent's style; Walk out starts the match with the pick", async () => {
    const user = userEvent.setup();
    await reachProgramme(user);
    await user.click(screen.getByRole("button", { name: /High Press/ }));
    await user.click(screen.getByRole("button", { name: "Kick off" }));
    expect(await screen.findByText(/^They played /)).toBeInTheDocument();
    expect(slot.save).not.toHaveBeenCalled(); // still the programme, not a live match
    await user.click(screen.getByRole("button", { name: "Walk out" }));
    await vi.waitFor(() => expect(slot.saved).not.toBeNull());
    expect(slot.saved!.style).toBe("high-press");
    // TASK-1814 — every new match plays with traits, and the save says so (identity).
    expect((slot.saved as { personality?: boolean }).personality).toBe(true);
    expect(screen.queryByTestId("traits-panel")).toBeNull(); // the programme is gone by now
  });

  it("⛔ the rebuild at Kick off keeps the opponent the programme showed", async () => {
    const user = userEvent.setup();
    await reachProgramme(user);
    const before = playerNames();
    expect(before.length).toBeGreaterThan(11);
    await user.click(screen.getByRole("button", { name: /Counter/ }));
    await user.click(screen.getByRole("button", { name: "Kick off" }));
    await screen.findByText(/^They played /);
    expect(playerNames()).toEqual(before);
  });

  it("⭐ the stance picked beside the style is saved with the match (identity)", async () => {
    const user = userEvent.setup();
    await reachProgramme(user);
    const stances = screen.getAllByTestId("sd-stance");
    expect(stances).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /^Defensive/ }));
    await user.click(screen.getByRole("button", { name: "Kick off" }));
    // Locked once the opponent's style is revealed, like the style picks.
    expect(screen.getAllByTestId("sd-stance").every((b) => (b as HTMLButtonElement).disabled)).toBe(
      true,
    );
    await user.click(await screen.findByRole("button", { name: "Walk out" }));
    await vi.waitFor(() => expect(slot.saved).not.toBeNull());
    expect((slot.saved as { mentality?: string }).mentality).toBe("defensive");
  });

  it("no stance picked = no stance saved (Balanced adds nothing)", async () => {
    const user = userEvent.setup();
    await reachProgramme(user);
    await user.click(screen.getByRole("button", { name: "Kick off" }));
    await user.click(await screen.findByRole("button", { name: "Walk out" }));
    await vi.waitFor(() => expect(slot.saved).not.toBeNull());
    expect((slot.saved as { mentality?: string }).mentality).toBeUndefined();
  });

  it("remembers the last pick in this browser", async () => {
    const user = userEvent.setup();
    await reachProgramme(user);
    await user.click(screen.getByRole("button", { name: /Low Block/ }));
    await user.click(screen.getByRole("button", { name: "Kick off" }));
    await user.click(await screen.findByRole("button", { name: "Walk out" }));
    expect(window.localStorage.getItem("pitchiq.style")).toBe("low-block");
  });
});
