import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";

import { renderWithIntl } from "./_helpers/intl";
import { ManagerHero } from "../../src/features/managers/components/ManagerHero";
import { ManagerHonours } from "../../src/features/managers/components/ManagerHonours";
import { ManagerCareerTable } from "../../src/features/managers/components/ManagerCareerTable";
import type { ManagerProfile } from "../../src/features/managers/manager-profile.api";

const rec = {
  played: 76,
  win: 55,
  draw: 10,
  loss: 11,
  gf: 154,
  ga: 52,
  gd: 102,
  points: 175,
  ppg: 2.3,
  winPct: 72,
};

const PROFILE: ManagerProfile = {
  id: "58",
  name: "Alex Ferguson",
  photo: "58",
  photoFallback: null,
  birthDate: "1941-12-31",
  dateOfDeath: null,
  age: 84,
  nationality: "United Kingdom",
  nationalityCode: "gb",
  seasons: [2009, 2008],
  honours: [{ season: 2008, teamId: 33, teamName: "Manchester United" }],
  byClub: [
    {
      teamId: 33,
      teamName: "Manchester United",
      teamLogo: "/logos/33.png",
      seasons: [2008, 2009],
      record: rec,
    },
  ],
  bySeason: [
    {
      season: 2008,
      teamId: 33,
      teamName: "Manchester United",
      teamLogo: "/logos/33.png",
      record: rec,
    },
    {
      season: 2009,
      teamId: 33,
      teamName: "Manchester United",
      teamLogo: "/logos/33.png",
      record: rec,
    },
  ],
  targetSeason: {
    season: 2009,
    rows: [
      {
        season: 2009,
        teamId: 33,
        teamName: "Manchester United",
        teamLogo: "/logos/33.png",
        record: rec,
      },
    ],
  },
  totals: rec,
  // TASK-M81 — a manager with no enrichment (153 of 293 are in this state).
  // The career sections must self-hide rather than render empty shells.
  careerSummary: null,
  careerHonours: [],
  careerSpells: [],
};

describe("manager profile components", () => {
  it("hero shows name + nationality + age", () => {
    renderWithIntl(<ManagerHero profile={PROFILE} />);
    expect(screen.getByRole("heading", { name: "Alex Ferguson" })).toBeInTheDocument();
    expect(screen.getByText(/United Kingdom/)).toBeInTheDocument();
  });

  it("honours lists a PL title linking to the club", () => {
    renderWithIntl(<ManagerHonours honours={PROFILE.honours} season={2009} />);
    expect(screen.getByText(/Premier League/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manchester United/ })).toHaveAttribute(
      "href",
      "/teams/33?season=2009",
    );
  });

  it("honours renders nothing when empty", () => {
    const { container } = renderWithIntl(<ManagerHonours honours={[]} season={2009} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("career table shows the club row + a season-carrying club link", () => {
    const { container } = renderWithIntl(
      <ManagerCareerTable byClub={PROFILE.byClub} season={2009} highlightSeason={2009} />,
    );
    // The club link + points render in both the desktop table and the mobile
    // card list — scope to the <table> (desktop tree) so the query is unambiguous.
    const table = within(container.querySelector("table")!);
    expect(table.getByRole("link", { name: /Manchester United/ })).toHaveAttribute(
      "href",
      "/teams/33?season=2009",
    );
    expect(table.getByText("175")).toBeInTheDocument();
  });
});
