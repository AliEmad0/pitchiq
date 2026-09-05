import { StrictMode } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { seasonSetup } from "./_helpers/season";
import { renderWithIntl } from "./_helpers/intl";
import type { SavedRun } from "@/features/game/storage/season-slot";
import type { SeasonFixturePlay } from "@/features/game/components/SeasonFixturePlay";
import type { ComponentProps } from "react";
import { formationKey } from "@/features/game/domain/formation";

const slot = vi.hoisted(() => ({ loadRun: vi.fn(), saveRun: vi.fn(), clearRun: vi.fn() }));
vi.mock("@/features/game/storage/season-slot", () => slot);
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/components/SeasonFixturePlay", () => ({
  SeasonFixturePlay: ({ fixture, onReturn }: ComponentProps<typeof SeasonFixturePlay>) => (
    <>
      <button onClick={() => onReturn(null)}>Cancel fixture</button>
      <button
        onClick={() => {
          const result = { seed: fixture.setup.seed, score: { home: 7, away: 2 }, events: [] };
          onReturn(result);
          onReturn(result);
        }}
      >
        Finish fixture twice
      </button>
    </>
  ),
}));
const { SeasonHub } = await import("@/features/game/components/SeasonHub");
beforeEach(() => {
  slot.loadRun.mockReset().mockResolvedValue(null);
  slot.saveRun.mockReset().mockResolvedValue(undefined);
  slot.clearRun.mockReset().mockResolvedValue(undefined);
});

describe("season fixture lifecycle", () => {
  it("saves week zero on explicit play; cancellation preserves the mounted hub", async () => {
    const { props } = seasonSetup();
    const user = userEvent.setup();
    renderWithIntl(
      <StrictMode>
        <SeasonHub {...props} />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled());
    expect(slot.saveRun).not.toHaveBeenCalled();
    const hub = screen.getByTestId("season-hub");
    await user.click(screen.getByRole("button", { name: "Play fixture" }));
    expect(hub).not.toBeVisible();
    expect(slot.saveRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ results: [], leagueIds: props.leagueIds }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel fixture" }));
    expect(screen.getByTestId("season-hub")).toBe(hub);
    expect(hub).toBeVisible();
    expect(screen.getByTestId("season-week")).toHaveTextContent(/0.*6/);
  });

  it("commits the played score once, saves the whole week and survives a remount", async () => {
    const { props } = seasonSetup();
    const user = userEvent.setup();
    const mounted = renderWithIntl(
      <StrictMode>
        <SeasonHub {...props} />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Play fixture" }));
    await user.click(screen.getByRole("button", { name: "Finish fixture twice" }));
    expect(screen.getByTestId("season-week")).toHaveTextContent(/1.*6/);
    const saved = slot.saveRun.mock.calls.at(-1)![0] as SavedRun;
    expect(saved.results).toHaveLength(2);
    expect(saved.results[0]).toMatchObject({ homeGoals: 7, awayGoals: 2 });
    mounted.unmount();
    slot.loadRun.mockResolvedValue(saved);
    renderWithIntl(<SeasonHub {...props} />);
    await waitFor(() => expect(screen.getByTestId("season-week")).toHaveTextContent(/1.*6/));
  });

  it("blocks every advance until the slot resolves, then resumes without losing results", async () => {
    const { props, run } = seasonSetup();
    let resolve!: (saved: SavedRun | null) => void;
    slot.loadRun.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    renderWithIntl(<SeasonHub {...props} />);
    for (const name of [/Play fixture/, /Sim week/i, /Sim 5/i, /To the end/i]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(slot.saveRun).not.toHaveBeenCalled();
    await act(async () =>
      resolve({
        ...run,
        leagueIds: props.leagueIds,
        cardIds: props.squad.map((p) => p.cardId),
        formationKey: formationKey(props.formation),
      }),
    );
    expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled();
  });

  it("blocks a same-size league with different club identities without overwriting it", async () => {
    const { props, run } = seasonSetup();
    slot.loadRun.mockResolvedValue({
      ...run,
      leagueIds: [1, 3, 2, 4],
      cardIds: props.squad.map((p) => p.cardId),
      formationKey: formationKey(props.formation),
    });
    renderWithIntl(<SeasonHub {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/progress has been kept/);
    expect(screen.getByRole("button", { name: "Play fixture" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sim week/i })).toBeDisabled();
    expect(slot.saveRun).not.toHaveBeenCalled();
  });
});
