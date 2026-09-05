import { StrictMode, type ComponentProps } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import { simulate } from "@/features/game/domain/simulate";
import { finishSeasonWeek, seasonFixture } from "@/features/game/view/season-match";
import type { MatchLive } from "@/features/game/components/MatchLive";
import { seasonSetup } from "./_helpers/season";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
// Only replace playback timing; keep the real driver, engine, programme and summary.
vi.mock("@/features/game/components/MatchLive", () => ({
  MatchLive: ({ pending, onAnswer, onFullTime, coachSide }: ComponentProps<typeof MatchLive>) => (
    <>
      <p data-testid="coach-side">{coachSide}</p>
      {pending != null ? (
        <button onClick={() => onAnswer(defaultAnswer(pending))}>Answer {pending.side}</button>
      ) : (
        <button onClick={onFullTime}>Full time</button>
      )}
    </>
  ),
}));
const { SeasonFixturePlay } = await import("@/features/game/components/SeasonFixturePlay");

it.each([0, 1])(
  "plays week %i through preview, real decisions, summary and return under StrictMode",
  async (week) => {
    const { teams, run: initial } = seasonSetup();
    const run =
      week === 0
        ? initial
        : finishSeasonWeek(initial, teams, simulate(seasonFixture(initial, teams)!.setup));
    const fixture = seasonFixture(run, teams)!;
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
    expect(screen.getByRole("status")).toHaveTextContent(/restarts this fixture/);
    await user.click(screen.getByRole("button", { name: /Kick off/i }));
    expect(screen.getByTestId("coach-side")).toHaveTextContent(fixture.coachSide);
    let answered = 0;
    while (screen.queryByRole("button", { name: /^Answer / }) != null && answered < 100) {
      await user.click(screen.getByRole("button", { name: `Answer ${fixture.coachSide}` }));
      answered++;
    }
    expect(answered).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Full time" }));
    expect(onReturn).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Copy link/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Return to season" }));
    expect(onReturn).toHaveBeenCalledExactlyOnceWith(simulate(fixture.setup));
  },
);
