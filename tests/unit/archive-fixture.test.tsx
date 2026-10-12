import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-M96 — the archived-match shell. The shared `FixtureDetailView` is stubbed: what is under
 * test here is only what the shell adds — which JSON it loads, and that it follows the URL.
 */
const nav = vi.hoisted(() => ({ pathname: "/fixtures/2004-12-28-FUL-BIR" }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => nav.pathname,
}));
vi.mock("@/features/leagues/components/FixtureDetailView", () => ({
  FixtureDetailView: ({ detail }: { detail: { fixture: { fixture: { id: string } } } }) => (
    <p data-testid="view">{detail.fixture.fixture.id}</p>
  ),
}));

const { ArchiveFixture } = await import("@/features/leagues/components/ArchiveFixture");

const detailFor = (id: string) => ({
  fixture: {
    fixture: { id },
    teams: { home: { name: "Fulham" }, away: { name: "Birmingham" } },
    goals: { home: 2, away: 3 },
  },
  lineups: [],
  statistics: [],
  events: [],
});

const fetchMock = vi.fn();
beforeEach(() => {
  nav.pathname = "/fixtures/2004-12-28-FUL-BIR";
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    const id = decodeURIComponent(url.split("/").pop()!);
    if (id.includes("XXX")) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(detailFor(id)), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("ArchiveFixture", () => {
  it("⭐ loads the match's PRERENDERED JSON — never a request-time API", async () => {
    renderWithIntl(<ArchiveFixture />);
    expect(await screen.findByTestId("view")).toHaveTextContent("2004-12-28-FUL-BIR");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/archive/fixtures/2004-12-28-FUL-BIR",
      expect.anything(),
    );
    expect(document.title).toBe("Fulham 2–3 Birmingham — PitchIQ");
  });

  it("⛔ follows the URL: a client navigation to another archived match loads THAT match", async () => {
    const { rerender } = renderWithIntl(<ArchiveFixture />);
    expect(await screen.findByTestId("view")).toHaveTextContent("2004-12-28-FUL-BIR");

    nav.pathname = "/fixtures/1995-05-14-LIV-BLB";
    rerender(<ArchiveFixture />);
    await waitFor(() => expect(screen.getByTestId("view")).toHaveTextContent("1995-05-14-LIV-BLB"));
  });

  it("⚠️ a slow response for the PREVIOUS match never overwrites the current one", async () => {
    let releaseFirst: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (releaseFirst = resolve)),
    );
    const { rerender } = renderWithIntl(<ArchiveFixture />);
    nav.pathname = "/fixtures/1995-05-14-LIV-BLB";
    rerender(<ArchiveFixture />);
    expect(await screen.findByTestId("view")).toHaveTextContent("1995-05-14-LIV-BLB");

    await act(async () => {
      releaseFirst(new Response(JSON.stringify(detailFor("2004-12-28-FUL-BIR")), { status: 200 }));
    });
    expect(screen.getByTestId("view")).toHaveTextContent("1995-05-14-LIV-BLB");
  });

  it("says the match is not found when its JSON 404s", async () => {
    nav.pathname = "/fixtures/2003-01-01-XXX-YYY";
    renderWithIntl(<ArchiveFixture />);
    await waitFor(() =>
      expect(screen.getByTestId("archive-fixture-status")).not.toHaveTextContent(/loading/i),
    );
    expect(screen.queryByTestId("view")).toBeNull();
  });
});
