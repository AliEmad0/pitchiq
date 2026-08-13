import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formationByName } from "@/features/game/domain/formation";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";
import { renderWithIntl } from "./_helpers/intl";

const { MatchupPreview } = await import("@/features/game/components/MatchupPreview");

const formation = formationByName("4-4-2 Flat");

function team(name: string, prefix: string) {
  const players = formation.slots.map((slot, i) => ({
    playerId: 1000 + i,
    season: 2020,
    name: `${prefix}-${i}`,
    role: slot.role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: null,
    club: "Club",
  })) as unknown as GamePlayer[];
  return makeGameTeam(1, name, 2020, formation, players);
}

describe("MatchupPreview", () => {
  it("shows both XIs, not just the names", () => {
    renderWithIntl(
      <MatchupPreview
        home={team("Your XI", "H")}
        away={team("Rivals", "A")}
        referee="strict"
        weather="rain"
        onKickOff={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Your XI")).toBeInTheDocument();
    expect(screen.getByText("Rivals")).toBeInTheDocument();
    // Actual players, not just a scoreline placeholder.
    expect(screen.getByText("H-0")).toBeInTheDocument();
    expect(screen.getByText("A-0")).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: /line-up/i })).toHaveLength(2);
  });

  it("explains what the referee and weather DO, not just their names", () => {
    renderWithIntl(
      <MatchupPreview
        home={team("Your XI", "H")}
        away={team("Rivals", "A")}
        referee="strict"
        weather="rain"
        onKickOff={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Strict")).toBeInTheDocument();
    expect(screen.getByText(/books more/i)).toBeInTheDocument();
    expect(screen.getByText(/scrappier/i)).toBeInTheDocument();
  });

  it("omits the impact line when the condition is unknown", () => {
    renderWithIntl(
      <MatchupPreview
        home={team("Your XI", "H")}
        away={team("Rivals", "A")}
        referee={null}
        weather={null}
        onKickOff={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByText(/books more/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scrappier/i)).not.toBeInTheDocument();
  });

  it("still kicks off and still goes back", async () => {
    const onKickOff = vi.fn();
    const onBack = vi.fn();
    renderWithIntl(
      <MatchupPreview
        home={team("Your XI", "H")}
        away={team("Rivals", "A")}
        referee={null}
        weather={null}
        onKickOff={onKickOff}
        onBack={onBack}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /kick off/i }));
    expect(onKickOff).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /squad/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
