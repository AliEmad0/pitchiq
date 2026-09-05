import { StrictMode } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SeasonFixturePlay } from "@/features/game/components/SeasonFixturePlay";
import { finishSeasonWeek, seasonFixture } from "@/features/game/view/season-match";
import { simulate } from "@/features/game/domain/simulate";
import { seasonSetup } from "./_helpers/season";
import { renderWithIntl } from "./_helpers/intl";
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

it.each([0, 1])(
  "finishes week %i with the real live screen and an empty coach bench",
  async (week) => {
    const { teams, run: initial } = seasonSetup();
    const run =
      week === 0
        ? initial
        : finishSeasonWeek(initial, teams, simulate(seasonFixture(initial, teams)!.setup));
    const fixture = seasonFixture(run, teams)!;
    expect(fixture.setup[fixture.coachSide].bench).toEqual([]);
    const onReturn = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <StrictMode>
        <SeasonFixturePlay
          fixture={fixture}
          crests={{ home: 1, away: 4 }}
          captaincies={{}}
          referees={[]}
          onReturn={onReturn}
        />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: /Kick off/i }));
    expect(
      screen.getByRole("img", {
        name:
          fixture.coachSide === "home"
            ? "Both teams on the pitch, yours attacking right"
            : "Both teams on the pitch, yours attacking left",
      }),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: "Full time", exact: true }, { timeout: 2000 }),
    );
    await user.click(screen.getByRole("button", { name: "Return to season" }));
    expect(onReturn).toHaveBeenCalledExactlyOnceWith(simulate(fixture.setup));
  },
);
