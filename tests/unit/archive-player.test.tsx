import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-M96 PR B — the archived-player shell. Heavy presentational children are stubbed: what is
 * under test is only what the shell adds — which static files it loads, that it follows the
 * URL, and that it hands every season to `PlayerSeasonView` as `preloaded`.
 */
const nav = vi.hoisted(() => ({ pathname: "/players/1002187" }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => nav.pathname,
}));
const seen = vi.hoisted(() => ({ preloaded: null as unknown }));
vi.mock("@/features/players/components/PlayerSeasonView", () => ({
  PlayerSeasonView: (p: { playerId: number; preloaded: unknown; displayName: string }) => {
    seen.preloaded = p.preloaded;
    return <p data-testid="view">{`${p.playerId}:${p.displayName}`}</p>;
  },
  PlayerSeasonBody: () => null,
}));
vi.mock("@/features/players/components/PlayerHero", () => ({ PlayerHero: () => null }));
vi.mock("@/features/players/components/PlayerCareerRecord", () => ({
  PlayerCareerRecord: () => null,
}));
vi.mock("@/features/players/components/MarketValueBlock", () => ({
  MarketValueBlock: () => null,
}));

const { ArchivePlayer } = await import("@/features/players/components/ArchivePlayer");

const archiveFor = (id: number, name: string) => ({
  id,
  name,
  seasons: [2007, 2006],
  initialSeason: 2007,
  bySeason: { "2007": { profile: { name }, facts: [] }, "2006": { profile: { name }, facts: [] } },
  career: null,
  marketValue: null,
});

const fetchMock = vi.fn();
beforeEach(() => {
  nav.pathname = "/players/1002187";
  seen.preloaded = null;
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    if (url === "/api/archive/club-logos") return new Response("{}");
    const id = Number(url.split("/").pop());
    if (id === 9999999) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(archiveFor(id, id === 1002187 ? "Didier Drogba" : "Other")));
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("ArchivePlayer", () => {
  it("⭐ loads ONLY prerendered static files and hands every season over as `preloaded`", async () => {
    renderWithIntl(<ArchivePlayer />);
    expect(await screen.findByTestId("view")).toHaveTextContent("1002187:Didier Drogba");
    const urls = fetchMock.mock.calls.map(([u]) => u as string).sort();
    expect(urls).toEqual(["/api/archive/club-logos", "/api/archive/players/1002187"]);
    // ⛔ never the request-time routes the prerendered page's switcher uses
    expect(urls.some((u) => u.includes("/profile") || u.includes("/api/trivia"))).toBe(false);
    expect(Object.keys(seen.preloaded as object).sort()).toEqual(["2006", "2007"]);
    expect(document.title).toBe("Didier Drogba — PitchIQ");
  });

  it("⛔ follows the URL: a client navigation to another archived player loads THAT player", async () => {
    const { rerender } = renderWithIntl(<ArchivePlayer />);
    expect(await screen.findByTestId("view")).toHaveTextContent("1002187");
    nav.pathname = "/players/1000208";
    rerender(<ArchivePlayer />);
    await waitFor(() => expect(screen.getByTestId("view")).toHaveTextContent("1000208:Other"));
  });

  it("says the player is not found when his JSON 404s", async () => {
    nav.pathname = "/players/9999999";
    renderWithIntl(<ArchivePlayer />);
    await waitFor(() =>
      expect(screen.getByTestId("archive-player-status")).not.toHaveTextContent(/loading/i),
    );
    expect(screen.queryByTestId("view")).toBeNull();
  });
});
