import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerProfile } from "@/features/players/api";
import { PlayerSeasonView } from "@/features/players/components/PlayerSeasonView";

const messages = {
  players: {
    noSeasonData: "No {season} data for {name}",
    noSeasonDataMsg: "{name} — try {latest}",
  },
  controls: { season: "Season" },
  common: {},
  trivia: {},
};

function profile(id: number, name: string): PlayerProfile {
  return {
    id,
    name,
    team: { id: 1, name: "Club", logo: "" },
    position: "FW",
    photo: "",
    age: 25,
    birthDate: null,
    dateOfDeath: null,
    nationality: null,
    nationalityCode: null,
    isCaptain: false,
    role: null,
    altRoles: [],
    foot: null,
    height: null,
    metrics: [] as unknown as PlayerProfile["metrics"],
    enrichment: null,
  };
}

function renderView(careerBlock?: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlayerSeasonView
        playerId={42}
        seasons={[2025, 2016]}
        initialSeason={2025}
        displayName="Test Player"
        clubLogos={null}
        hero={<div>Initial Hero</div>}
        careerBlock={careerBlock}
      >
        <div>Initial Content</div>
      </PlayerSeasonView>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => window.history.replaceState(null, "", "/players/42"));
afterEach(() => vi.unstubAllGlobals());

describe("PlayerSeasonView", () => {
  it("renders the server children for the initial season without fetching", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderView();
    expect(screen.getByText("Initial Content")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches and swaps for a ?season= deep link to a historical season", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/profile")
          ? new Response(JSON.stringify({ profile: profile(42, "Historical Player") }))
          : new Response(JSON.stringify({ facts: [] })),
      ),
    );
    // season=2016 in the URL differs from initialSeason (2025), so the view
    // fetches that season on mount and swaps in client-rendered content.
    window.history.replaceState(null, "", "/players/42?season=2016");
    renderView();
    await waitFor(() => expect(screen.getByText("Historical Player")).toBeInTheDocument());
    // The server children are replaced once a non-initial season is active.
    expect(screen.queryByText("Initial Content")).not.toBeInTheDocument();
  });

  it("places the career block between the hero and the season subtree (TASK-M68)", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { container } = renderView(<div data-testid="career-block">career</div>);
    const text = container.querySelector("main")!.textContent!;
    // Owner-requested order: hero, then market value, then season statistics.
    expect(text.indexOf("Initial Hero")).toBeLessThan(text.indexOf("career"));
    expect(text.indexOf("career")).toBeLessThan(text.indexOf("Initial Content"));
  });

  it("keeps the career block mounted across a season swap (TASK-M68)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/profile")
          ? new Response(JSON.stringify({ profile: profile(42, "Historical Player") }))
          : new Response(JSON.stringify({ facts: [] })),
      ),
    );
    window.history.replaceState(null, "", "/players/42?season=2016");
    renderView(<div data-testid="career-block">career</div>);

    // Present before the swap resolves...
    expect(screen.getByTestId("career-block")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Historical Player")).toBeInTheDocument());
    // ...and still present after. The block is season-invariant, and keeping it
    // out of the swapped subtree is what keeps the 5 MB market-value history
    // off the dynamic /api/players/[id]/profile path.
    expect(screen.getByTestId("career-block")).toBeInTheDocument();
    expect(screen.queryByText("Initial Content")).not.toBeInTheDocument();
  });
});
