import { StrictMode } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { formationKey } from "@/features/game/domain/formation";
import { finishSeasonWeek, seasonFixture } from "@/features/game/view/season-match";
import { simulate } from "@/features/game/domain/simulate";
import { seasonSetup } from "./_helpers/season";
import { renderWithIntl } from "./_helpers/intl";
const mocks = vi.hoisted(() => ({
  loadRun: vi.fn(),
  saveRun: vi.fn(),
  clearRun: vi.fn(),
  loadRival: vi.fn(),
}));
vi.mock("@/features/game/storage/season-slot", () => mocks);
vi.mock("@/features/game/view/rival-choice", () => ({ loadRival: mocks.loadRival }));
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
const { SeasonStart } = await import("@/features/game/components/SeasonStart");
beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
});

it.each([null, { cards: [] }])(
  "keeps saved results on unusable rival %j and restores the exact league on retry",
  async (missing) => {
    const { props, teams, run } = seasonSetup();
    const saved = {
      ...finishSeasonWeek(run, teams, simulate(seasonFixture(run, teams)!.setup)),
      leagueIds: [1, 2, 3, 4],
      cardIds: props.squad.map((p) => p.cardId),
      formationKey: formationKey(props.formation),
    };
    mocks.loadRun.mockResolvedValue(saved);
    mocks.loadRival.mockImplementation(async (id: number) =>
      id === 3 ? missing : { cards: props.pools[id] },
    );
    const user = userEvent.setup();
    renderWithIntl(
      <StrictMode>
        <SeasonStart
          {...props}
          saved={saved}
          spec={{ clubs: 4, league: "clubs" }}
          clubs={props.leagueIds.map((id) => ({ id, name: `Club ${id}` }))}
        />
      </StrictMode>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/progress has been kept/);
    expect(screen.queryByTestId("season-hub")).toBeNull();
    expect(mocks.saveRun).not.toHaveBeenCalled();
    expect(mocks.clearRun).not.toHaveBeenCalled();
    mocks.loadRival.mockImplementation(async (id: number) => ({ cards: props.pools[id] }));
    await user.click(screen.getByRole("button", { name: "Retry loading league" }));
    await waitFor(() => expect(screen.getByTestId("season-week")).toHaveTextContent(/1.*6/));
    expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled();
    expect(mocks.saveRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ leagueIds: saved.leagueIds, results: saved.results }),
    );
  },
);
