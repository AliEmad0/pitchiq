import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import {
  PlayerCareerSummary,
  PlayerHonoursInline,
} from "@/features/players/components/PlayerCareerSummary";
import type { PlayerEnrichment } from "@/types/api";

import { renderWithIntl } from "./_helpers/intl";

afterEach(() => {
  cleanup();
});

const enrichment = (over: Partial<PlayerEnrichment> = {}): PlayerEnrichment => ({
  trophies: 3,
  honours: 9,
  awards: 2,
  caps: 41,
  internationalGoals: 7,
  careerFee: "€52.60m",
  ...over,
});

/**
 * TASK-M93 — this data was committed on 100% of player rows and read by NOTHING.
 * The assertions that matter are the "unknown vs zero" ones: `caps` and
 * `internationalGoals` are nullable and null means TM has no record, so
 * rendering 0 would be a fabricated fact.
 */
describe("<PlayerCareerSummary>", () => {
  it("renders the career tiles for an enriched player", () => {
    renderWithIntl(<PlayerCareerSummary enrichment={enrichment()} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText("€52.60m")).toBeInTheDocument();
  });

  it("renders NOTHING for an unenriched player, so the page is unchanged", () => {
    const { container } = renderWithIntl(<PlayerCareerSummary enrichment={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows an em dash — never 0 — when a count is unknown", () => {
    // The whole point: an uncapped player and a player TM has no cap record for
    // must not render identically.
    renderWithIntl(<PlayerCareerSummary enrichment={enrichment({ caps: null })} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    // …and a genuine zero still renders as a zero.
    cleanup();
    renderWithIntl(<PlayerCareerSummary enrichment={enrichment({ caps: 0, trophies: 0 })} />);
    expect(screen.queryByText("—")).toBeNull();
  });

  it("shows a real 0 for a player with honours but no silverware", () => {
    // `trophies` is silverware-only upstream, so 0 here is a fact, not a gap.
    renderWithIntl(<PlayerCareerSummary enrichment={enrichment({ trophies: 0, honours: 6 })} />);

    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("<PlayerHonoursInline> (squad card)", () => {
  it("badges trophies and caps", () => {
    renderWithIntl(<PlayerHonoursInline enrichment={enrichment()} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
  });

  it("renders nothing when there is no silverware and no caps", () => {
    // Otherwise every squad card in the grid sprouts a row of zeros.
    const { container } = renderWithIntl(
      <PlayerHonoursInline enrichment={enrichment({ trophies: 0, caps: 0 })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an unenriched player", () => {
    const { container } = renderWithIntl(<PlayerHonoursInline enrichment={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("omits the caps badge when caps are unknown but still shows trophies", () => {
    renderWithIntl(<PlayerHonoursInline enrichment={enrichment({ caps: null })} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("41")).toBeNull();
  });
});
