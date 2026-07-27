import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { TopPlayersStrip } from "../../src/features/players/components/TopPlayersStrip";
import type { PlayerIndexRow } from "../../src/features/players/players-index.api";

import { renderWithIntl } from "./_helpers/intl";

afterEach(cleanup);

const row = (id: number, name: string, c: number): PlayerIndexRow => ({
  id,
  name,
  photo: String(id),
  position: "Forward",
  nationality: "Egypt",
  nationalityCode: "eg",
  teamId: 40,
  teamName: "Liverpool",
  teamLogo: "/logos/40.png",
  teamColor: "#C8102E",
  appearances: 38,
  goals: c,
  assists: 0,
  contributions: c,
  marketValueEur: null,
});

const ROWS = Array.from({ length: 12 }, (_, i) => row(i + 1, "Player " + (i + 1), 30 - i));

describe("<TopPlayersStrip>", () => {
  it("renders the top 8 by contributions with a season-carrying profile link", () => {
    renderWithIntl(<TopPlayersStrip rows={ROWS} season={2024} />);
    expect(screen.getByRole("link", { name: /Player 1/ })).toHaveAttribute(
      "href",
      "/players/1?season=2024",
    );
    expect(screen.getByText("Player 8")).toBeInTheDocument();
    expect(screen.queryByText("Player 9")).not.toBeInTheDocument();
  });

  it("numbers each showcase card by rank", () => {
    renderWithIntl(<TopPlayersStrip rows={ROWS} season={2024} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#8")).toBeInTheDocument();
    expect(screen.queryByText("#9")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty list", () => {
    const { container } = renderWithIntl(<TopPlayersStrip rows={[]} season={2024} />);
    expect(container).toBeEmptyDOMElement();
  });
});
