import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "./_helpers/intl";
import { makeTeam } from "./_helpers/match-setup";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { MatchProgramme } = await import("@/features/game/components/MatchProgramme");

// ⚠️ Both sides are the same club on purpose — Legacy draws the opponent from the club's
// own history, so this is the REAL shape, not a contrived one. Settled with the owner:
// the same player may turn out for both teams.
const home = makeTeam({ name: "Liverpool", ratings: [85, 80, 80, 80, 80, 78, 78, 78, 78, 90, 88] });
const away = makeTeam({ name: "Liverpool", ratings: [70, 68, 68, 68, 68, 72, 72, 72, 72, 75, 74] });

const render = (over: Partial<Parameters<typeof MatchProgramme>[0]> = {}) =>
  renderWithIntl(
    <MatchProgramme
      home={home}
      away={away}
      referee="strict"
      weather="rain"
      onKickOff={vi.fn()}
      onBack={vi.fn()}
      {...over}
    />,
  );

describe("MatchProgramme", () => {
  it("shows both XIs as cards, not as a list", () => {
    render();
    expect(screen.getAllByTestId("prog-card")).toHaveLength(22);
  });

  it("draws the four comparison bars, gold left and rose right", () => {
    render();
    const bars = screen.getAllByTestId("prog-bar");
    expect(bars).toHaveLength(4);
    // The overall bar must actually reflect the gap: 81 against 71.
    expect(bars[0]).toHaveAttribute("aria-label", expect.stringContaining("81"));
    expect(bars[0]).toHaveAttribute("aria-label", expect.stringContaining("71"));
  });

  it("puts each side's best player in the spotlight", () => {
    render();
    // ⚠️ Scoped to the spotlight's own accessible name. A bare getByText("90") is
    // ambiguous — all 22 player cards paint their own rating on the face.
    expect(
      screen.getByRole("article", { name: /Your talisman: Liverpool9, rated 90/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: /Theirs: Liverpool9, rated 75/ }),
    ).toBeInTheDocument();
  });

  it("says what the referee and the weather DO, not only what they are", () => {
    render();
    // Not trivia: the impact line is the reason the section exists.
    expect(screen.getByText(/books/i)).toBeInTheDocument();
  });

  it("kicks off, and goes back", async () => {
    const onKickOff = vi.fn();
    const onBack = vi.fn();
    render({ onKickOff, onBack });
    await userEvent.click(screen.getByRole("button", { name: /kick off/i }));
    expect(onKickOff).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: /back to the squad/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("survives an XI with nothing rated in it", () => {
    // A real case, not a contrived one: a thin club's cards can all be unrated, and the
    // spotlight then has nothing to show on that side.
    const bare = makeTeam({ name: "Barnsley", ratings: Array<null>(11).fill(null) });
    render({ home: bare });
    expect(screen.getAllByTestId("prog-bar")).toHaveLength(4);
    expect(screen.getAllByTestId("prog-card")).toHaveLength(22);
  });

  it("renders before the officials are known", () => {
    // `referee`/`weather` are read from the first segment's events; until that segment
    // arrives they are legitimately null.
    render({ referee: null, weather: null });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
