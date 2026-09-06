import { StrictMode, type ComponentProps } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { seasonSetup } from "./_helpers/season";
import { renderWithIntl } from "./_helpers/intl";
import type { SavedRun } from "@/features/game/storage/season-slot";
import type { SeasonFixturePlay } from "@/features/game/components/SeasonFixturePlay";
const slot = vi.hoisted(() => ({ loadRun: vi.fn(), saveRun: vi.fn(), clearRun: vi.fn() }));
vi.mock("@/features/game/storage/season-slot", () => slot);
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/components/SeasonFixturePlay", () => ({
  SeasonFixturePlay: ({ fixture, onReturn }: ComponentProps<typeof SeasonFixturePlay>) => (
    <>
      <p data-testid="played-xi">
        {fixture.setup[fixture.coachSide].players.map((p) => p.cardId).join(",")}
      </p>
      <button
        onClick={() => {
          const result = {
            seed: fixture.setup.seed,
            score: { home: 2, away: 1 },
            events: [
              {
                kind: "injury" as const,
                minute: 20,
                side: fixture.coachSide,
                playerId: fixture.setup[fixture.coachSide].players[0].playerId,
                injurySeverity: "severe" as const,
              },
            ],
          };
          onReturn(result);
          onReturn(result);
        }}
      >
        Finish injured twice
      </button>
    </>
  ),
}));
const { SeasonHub } = await import("@/features/game/components/SeasonHub");
beforeEach(() => {
  slot.loadRun.mockReset().mockResolvedValue(null);
  slot.saveRun.mockReset().mockResolvedValue(undefined);
  slot.clearRun.mockReset();
});
it("rotates within a saved roster, carries a played injury once and restores exact availability", async () => {
  const { props } = seasonSetup();
  const user = userEvent.setup();
  const mount = renderWithIntl(
    <StrictMode>
      <SeasonHub {...props} />
    </StrictMode>,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled());
  const initial = slot.saveRun.mock.calls.at(-1)![0] as SavedRun;
  const select = screen.getByRole("combobox", { name: "Position 1" }) as HTMLSelectElement;
  const replacement = Array.from(select.options).find((o) => o.value !== select.value);
  expect(replacement).toBeDefined();
  await user.selectOptions(select, replacement!.value);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled());
  const rotated = slot.saveRun.mock.calls.at(-1)![0] as SavedRun;
  expect(rotated.rosterIds).toEqual(initial.rosterIds);
  expect(rotated.cardIds).toEqual(initial.cardIds);
  expect(rotated.lineupIds![0]).toBe(replacement!.value);
  await user.click(screen.getByRole("button", { name: "Play fixture" }));
  expect(screen.getByTestId("played-xi")).toHaveTextContent(rotated.lineupIds!.join(","));
  await user.click(screen.getByRole("button", { name: "Finish injured twice" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled());
  const saved = slot.saveRun.mock.calls.at(-1)![0] as SavedRun;
  expect(saved.results).toHaveLength(2);
  expect(saved.injuries).toEqual([{ cardId: replacement!.value, remaining: 3 }]);
  expect(screen.getByRole("combobox", { name: "Position 1" })).not.toHaveValue(replacement!.value);
  mount.unmount();
  slot.loadRun.mockResolvedValue(saved);
  renderWithIntl(<SeasonHub {...props} />);
  await screen.findByText(/unavailable for 3 more fixtures/);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled());
  expect(slot.saveRun.mock.calls.at(-1)![0]).toMatchObject({
    rosterIds: saved.rosterIds,
    lineupIds: saved.lineupIds,
    injuries: saved.injuries,
    results: saved.results,
  });
});
it("a failed rotation save disables progress and retries the same roster and selection", async () => {
  const { props } = seasonSetup();
  const user = userEvent.setup();
  renderWithIntl(<SeasonHub {...props} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled());
  slot.saveRun.mockRejectedValueOnce(new Error("quota"));
  const select = screen.getByRole("combobox", { name: "Position 1" }) as HTMLSelectElement;
  const replacement = Array.from(select.options).find((o) => o.value !== select.value);
  expect(replacement).toBeDefined();
  await user.selectOptions(select, replacement!.value);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Play fixture" })).toBeDisabled();
  expect(select).toBeDisabled();
  const failed = slot.saveRun.mock.calls.at(-1)![0];
  await user.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(slot.saveRun).toHaveBeenLastCalledWith(failed);
});
it("missing saved reserves block resume without writing a replacement roster", async () => {
  const { props, run } = seasonSetup();
  slot.loadRun.mockResolvedValue({
    ...run,
    cardIds: props.squad.map((p) => p.cardId),
    formationKey: "unused",
    rosterIds: [...props.squad.map((p) => p.cardId), "missing@2020"],
  });
  renderWithIntl(<SeasonHub {...props} />);
  await screen.findByRole("alert");
  expect(slot.saveRun).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Play fixture" })).toBeDisabled();
});

it("a failed slot read cannot overwrite an existing season and can be retried", async () => {
  const { props } = seasonSetup();
  const user = userEvent.setup();
  slot.loadRun.mockRejectedValueOnce(new Error("blocked database"));
  renderWithIntl(<SeasonHub {...props} />);
  await screen.findByRole("alert");
  expect(slot.saveRun).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Play fixture" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Retry loading league" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled());
  expect(screen.queryByRole("alert")).toBeNull();
});
