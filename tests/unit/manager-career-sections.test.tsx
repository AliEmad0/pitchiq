import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithIntl } from "./_helpers/intl";
import { ManagerCareerHonours } from "@/features/managers/components/ManagerCareerHonours";
import { ManagerCareerSummary } from "@/features/managers/components/ManagerCareerSummary";
import { ManagerFullCareer } from "@/features/managers/components/ManagerFullCareer";
import type {
  ManagerCareerSpell,
  ManagerEnrichmentSummary,
  ManagerHonourGroup,
} from "@/data/schemas";

const summary = (over: Partial<ManagerEnrichmentSummary> = {}): ManagerEnrichmentSummary => ({
  trophies: 26,
  honours: 24,
  awards: 6,
  clubsManaged: 10,
  careerMatches: 1240,
  careerWins: 766,
  careerDraws: 251,
  careerLosses: 223,
  careerPpm: 2.06,
  photo: null,
  ...over,
});

const group = (over: Partial<ManagerHonourGroup> = {}): ManagerHonourGroup => ({
  title: "UEFA Champions League winner",
  count: 2,
  kind: "trophy",
  entries: [{ season: "09/10", competition: "UCL", competitionId: "CL" }],
  ...over,
});

const spell = (over: Partial<ManagerCareerSpell> = {}): ManagerCareerSpell => ({
  club: "Porto",
  clubId: "720",
  role: "Manager",
  appointedSeason: null,
  appointedDate: "2002-01-23",
  until: null,
  untilDate: "2004-06-30",
  ongoing: false,
  matches: 127,
  wins: 91,
  draws: 21,
  losses: 15,
  daysInCharge: null,
  playersUsed: null,
  goalsPerMatch: null,
  ppm: 2.32,
  assistantTo: null,
  ...over,
});

describe("<ManagerCareerSummary>", () => {
  it("shows the whole-career numbers", () => {
    renderWithIntl(<ManagerCareerSummary summary={summary()} />);
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("1240")).toBeInTheDocument();
    expect(screen.getByText("2.06")).toBeInTheDocument();
  });

  it("renders NOTHING without enrichment — 153 of 293 managers have none", () => {
    const { container } = renderWithIntl(<ManagerCareerSummary summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an em dash rather than inventing a 0 when there is no record", () => {
    renderWithIntl(
      <ManagerCareerSummary
        summary={summary({
          careerPpm: null,
          careerMatches: 0,
          careerWins: 0,
          careerDraws: 0,
          careerLosses: 0,
        })}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("<ManagerCareerHonours>", () => {
  it("shows silverware with its count and seasons", () => {
    renderWithIntl(<ManagerCareerHonours groups={[group()]} />);
    expect(screen.getByText("UEFA Champions League winner")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("09/10")).toBeInTheDocument();
  });

  it("separates individual awards from trophies", () => {
    renderWithIntl(
      <ManagerCareerHonours
        groups={[group(), group({ title: "Manager of the Year", kind: "award", count: 3 })]}
      />,
    );
    // The award is present but under its own heading, never in the trophy grid.
    expect(screen.getByText("Individual awards")).toBeInTheDocument();
    expect(screen.getByText("Manager of the Year")).toBeInTheDocument();
  });

  it("renders nothing when there are no groups", () => {
    const { container } = renderWithIntl(<ManagerCareerHonours groups={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("<ManagerFullCareer>", () => {
  it("lists a spell with its club, span and record", () => {
    renderWithIntl(<ManagerFullCareer spells={[spell()]} />);
    // Desktop table + mobile card both render, so the club appears twice.
    expect(screen.getAllByText("Porto").length).toBeGreaterThan(0);
    // PPM is derived from the spell's own W/D/L: (3·91 + 21) / 127 = 2.3149 → 2.31.
    // Transfermarkt prints 2.32 for this spell; we show our own exact figure rather
    // than its rounding, which is why the fixture's `ppm: 2.32` is NOT what renders.
    expect(screen.getAllByText("2.31").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2002–2004/).length).toBeGreaterThan(0);
  });

  it("flags a non-standard role but stays quiet for a plain manager", () => {
    const { rerender } = renderWithIntl(<ManagerFullCareer spells={[spell()]} />);
    expect(screen.queryByText("Manager")).not.toBeInTheDocument();
    rerender(<ManagerFullCareer spells={[spell({ role: "Caretaker Manager" })]} />);
    expect(screen.getAllByText("Caretaker Manager").length).toBeGreaterThan(0);
  });

  it("never leaks Transfermarkt's free-text end cell into the span", () => {
    renderWithIntl(
      <ManagerFullCareer
        spells={[spell({ until: "expected 30/06/2027", untilDate: null, ongoing: true })]}
      />,
    );
    expect(screen.queryByText(/expected/i)).not.toBeInTheDocument();
  });

  it("renders nothing when there are no spells", () => {
    const { container } = renderWithIntl(<ManagerFullCareer spells={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
