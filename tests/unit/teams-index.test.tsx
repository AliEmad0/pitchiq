import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Async Server Component: getTranslations resolves via the shared mock.
vi.mock("next-intl/server", () => import("./_helpers/intl-server"));
vi.mock("@/features/teams/api", () => ({
  getPLTeams: vi.fn(async (season: number) => [
    { team: { id: 42, name: `Club-${season}` }, venue: {} },
  ]),
}));
vi.mock("@/data/loaders", () => ({ loadTeamColors: vi.fn(async () => null) }));
// Stub the client filter so the assertion doesn't depend on its intl/DOM internals.
vi.mock("@/features/teams/components/TeamFilter", () => ({
  TeamFilter: ({ season }: { season: number }) => <div data-testid="filter" data-season={season} />,
}));

import { getPLTeams } from "@/features/teams/api";
import { TeamsIndex } from "@/features/teams/components/TeamsIndex";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TeamsIndex", () => {
  it("fetches and renders the passed season (not the current one)", async () => {
    render(await TeamsIndex({ season: 2003, locale: "en" }));
    expect(vi.mocked(getPLTeams)).toHaveBeenCalledWith(2003);
    expect(screen.getByTestId("filter")).toHaveAttribute("data-season", "2003");
  });
});
