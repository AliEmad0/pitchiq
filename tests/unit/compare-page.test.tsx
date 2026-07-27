import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";

// The async page uses `getTranslations` (next-intl/server) → mock it with the
// real en strings. Its sync children (ComparisonView/ComparisonEmpty) + the
// client slot pickers use the isomorphic `useTranslations`, resolved by the
// NextIntlClientProvider in renderPage.
vi.mock("next-intl/server", () => import("./_helpers/intl-server"));

vi.mock("@/features/players/api", async (importActual) => {
  const actual = await importActual<typeof import("@/features/players/api")>();
  return {
    ...actual,
    getPlayerStats: vi.fn(),
    getPlayerCareer: vi.fn(),
  };
});

// TASK-M68: only the market-value loader is stubbed — everything else on the
// page keeps reading the committed snapshots.
vi.mock("@/data/loaders", async (importActual) => {
  const actual = await importActual<typeof import("@/data/loaders")>();
  return { ...actual, loadMarketValues: vi.fn(async () => null) };
});

import { loadMarketValues } from "@/data/loaders";
import { getPlayerStats, getPlayerCareer } from "@/features/players/api";
import ComparePage from "@/app/[locale]/compare/page";
import type { ComparisonMetrics } from "@/types/api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function metrics(overrides: Partial<ComparisonMetrics> = {}): ComparisonMetrics {
  return {
    appearances: 30,
    goals: 18,
    assists: 11,
    passAccuracy: 84,
    keyPasses: 62,
    tackles: 28,
    interceptions: 14,
    duelsWon: 118,
    dribblesCompleted: 51,
    shotsOnTarget: 47,
    yellowCards: 6,
    redCards: 2,
    ...overrides,
  };
}

function playerWithMetrics(
  id: number,
  name: string,
  metricOverrides: Partial<ComparisonMetrics> = {},
) {
  return {
    player: {
      id,
      name,
      firstname: name.split(" ")[0] ?? name,
      lastname: name.split(" ").slice(1).join(" ") || name,
      age: 28,
      birth: { date: "1995-01-01", place: null, country: null },
      nationality: "Unknown",
      height: null,
      weight: null,
      injured: false,
      photo: "",
    },
    metrics: metrics(metricOverrides),
  };
}

// `/compare` is a server component. Awaiting the component call gives
// the React element tree; render it under the same providers production
// layout uses (QueryClient + nuqs adapter) so the client-island slot
// pickers don't crash on hydration.
function renderPage(element: ReactElement, searchParams = "") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="en" messages={en}>
      <QueryClientProvider client={client}>
        <NuqsTestingAdapter searchParams={searchParams}>{children}</NuqsTestingAdapter>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  return render(element, { wrapper });
}

describe("/compare page", () => {
  beforeEach(() => {
    // Default mocks — individual tests override.
    vi.mocked(getPlayerStats).mockResolvedValue(null);
    vi.mocked(getPlayerCareer).mockResolvedValue(null);
  });

  it("renders a market-value row when a slot has a value (TASK-M68)", async () => {
    vi.mocked(loadMarketValues).mockResolvedValue({
      "2025": {
        "1485": { valueEur: 45_000_000, determined: "2026-05-01" },
        "1927": { valueEur: 90_000_000, determined: "2026-05-01" },
      },
    });
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1485, "Bruno Fernandes"))
      .mockResolvedValueOnce(playerWithMetrics(1927, "Bukayo Saka"));

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1485", b: "1927" }),
    });
    renderPage(element, "?a=1485&b=1927");

    expect(screen.getByText("Market value")).toBeInTheDocument();
    expect(screen.getByText("€45m")).toBeInTheDocument();
    expect(screen.getByText("€90m")).toBeInTheDocument();
  });

  it("omits the market-value row when neither slot has one (TASK-M68)", async () => {
    // Era-sparse, like the xG/xA rows: Transfermarkt's history starts ~2004.
    vi.mocked(loadMarketValues).mockResolvedValue({});
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1485, "Bruno Fernandes"))
      .mockResolvedValueOnce(playerWithMetrics(1927, "Bukayo Saka"));

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1485", b: "1927" }),
    });
    renderPage(element, "?a=1485&b=1927");

    expect(screen.queryByText("Market value")).not.toBeInTheDocument();
  });

  it("shows the career PEAK for an ?sa=all slot (TASK-M68)", async () => {
    vi.mocked(loadMarketValues).mockResolvedValue({
      "2019": { "1485": { valueEur: 30_000_000, determined: "2020-05-01" } },
      "2021": { "1485": { valueEur: 80_000_000, determined: "2022-05-01" } },
      "2025": { "1927": { valueEur: 90_000_000, determined: "2026-05-01" } },
    });
    vi.mocked(getPlayerCareer).mockResolvedValueOnce({
      ...playerWithMetrics(1485, "Bruno Fernandes"),
      span: { from: 2019, to: 2025 },
    } as unknown as Awaited<ReturnType<typeof getPlayerCareer>>);
    vi.mocked(getPlayerStats).mockResolvedValueOnce(playerWithMetrics(1927, "Bukayo Saka"));

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1485", sa: "all", b: "1927" }),
    });
    renderPage(element, "?a=1485&sa=all&b=1927");

    // Peak across the career, not a sum and not the latest season.
    expect(screen.getByText("€80m")).toBeInTheDocument();
  });

  it("renders the page header + two empty slot pickers when ?a/?b are absent", async () => {
    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({}),
    });
    renderPage(element);

    expect(screen.getByRole("heading", { name: /compare players/i, level: 1 })).toBeInTheDocument();
    // Both slot pickers render their empty/search state when the URL is
    // empty — pinned by the `<PlayerSearch>` placeholders in TASK-404.
    expect(screen.getByPlaceholderText(/search player a/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search player b/i)).toBeInTheDocument();
    // No server-side fetch should fire below 2 ids.
    expect(getPlayerStats).not.toHaveBeenCalled();
    expect(getPlayerCareer).not.toHaveBeenCalled();
  });

  it("renders the 'pick a second player' hint when only ?a is present", async () => {
    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1485" }),
    });
    renderPage(element, "?a=1485");

    expect(screen.getByText(/pick a second player to compare/i)).toBeInTheDocument();
    // Server-side comparison fetch hasn't fired yet — only one id.
    expect(getPlayerStats).not.toHaveBeenCalled();
  });

  it("server-fetches both players when ?a and ?b are both present", async () => {
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(
        playerWithMetrics(1485, "Bruno Fernandes", {
          goals: 18,
          assists: 11,
        }),
      )
      .mockResolvedValueOnce(
        playerWithMetrics(1927, "Bukayo Saka", {
          goals: 12,
          assists: 14,
        }),
      );

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1485", b: "1927" }),
    });
    renderPage(element, "?a=1485&b=1927");

    // SSR-visible names: AC #1 from the spec ("view source contains both
    // names"). We assert the names render in the initial element tree.
    expect(screen.getByText(/Bruno Fernandes/)).toBeInTheDocument();
    expect(screen.getByText(/Bukayo Saka/)).toBeInTheDocument();

    // Both server fetchers were called with the expected ids (single-season
    // slots inherit the global season).
    expect(getPlayerStats).toHaveBeenCalledWith(1485, expect.any(Number));
    expect(getPlayerStats).toHaveBeenCalledWith(1927, expect.any(Number));
  });

  it("renders 12 StatRows when both players load successfully", async () => {
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1, "Player A"))
      .mockResolvedValueOnce(playerWithMetrics(2, "Player B"));

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1", b: "2" }),
    });
    renderPage(element, "?a=1&b=2");

    // The 12 metric labels come from COMPARISON_METRICS — assert on a
    // handful of representative ones across the categories (volume,
    // quality, defensive, discipline).
    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByText("Assists")).toBeInTheDocument();
    expect(screen.getByText("Pass accuracy")).toBeInTheDocument();
    expect(screen.getByText("Tackles")).toBeInTheDocument();
    expect(screen.getByText("Yellow cards")).toBeInTheDocument();
    expect(screen.getByText("Red cards")).toBeInTheDocument();
  });

  it("renders Clean sheets + Saves rows when a slot carries them (TASK-M18)", async () => {
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1, "Keeper A", { cleanSheets: 14, saves: 120 }))
      .mockResolvedValueOnce(playerWithMetrics(2, "Keeper B", { cleanSheets: 11, saves: 95 }));

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1", b: "2" }),
    });
    renderPage(element, "?a=1&b=2");

    expect(screen.getByText("Clean sheets")).toBeInTheDocument();
    expect(screen.getByText("Saves")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("omits Clean sheets + Saves rows when neither slot has them", async () => {
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1, "Outfield A", { cleanSheets: null, saves: null }))
      .mockResolvedValueOnce(
        playerWithMetrics(2, "Outfield B", { cleanSheets: null, saves: null }),
      );

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1", b: "2" }),
    });
    renderPage(element, "?a=1&b=2");

    expect(screen.queryByText("Clean sheets")).not.toBeInTheDocument();
    expect(screen.queryByText("Saves")).not.toBeInTheDocument();
  });

  it("renders the share button when both players load successfully", async () => {
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1, "Player A"))
      .mockResolvedValueOnce(playerWithMetrics(2, "Player B"));

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1", b: "2" }),
    });
    renderPage(element, "?a=1&b=2");

    expect(screen.getByRole("button", { name: /copy comparison link/i })).toBeInTheDocument();
  });

  it("renders the ComparisonRadar in the both-loaded branch (pairwise — always)", async () => {
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1, "Bruno Fernandes"))
      .mockResolvedValueOnce(playerWithMetrics(2, "Bukayo Saka"));

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1", b: "2" }),
    });
    renderPage(element, "?a=1&b=2");

    // TASK-M24: the radar normalizes pairwise (`pairwiseMaxes`) so it always
    // renders when both slots resolve — no per-season maxes fetch to fail.
    // The wrapper carries `role="img"` + an aria-label naming both players.
    // Lazy-loaded (TASK-906), so await the dynamic import.
    const chart = await screen.findByRole("img", {
      name: /radar comparison/i,
    });
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAccessibleName(/bruno fernandes/i);
    expect(chart).toHaveAccessibleName(/bukayo saka/i);
    // TASK-M11: the per-slot season is appended to each radar series name so
    // the colored legend distinguishes the two (here both inherit 2025-26).
    expect(chart).toHaveAccessibleName(/\(2025-26\)/);
  });

  it("renders the ShareBanner only in the both-loaded branch", async () => {
    // Ensure no stale dismissal from a sibling test in the same suite
    // would mask the banner.
    sessionStorage.removeItem("compare:share-banner-dismissed");

    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1, "Player A"))
      .mockResolvedValueOnce(playerWithMetrics(2, "Player B"));

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1", b: "2" }),
    });
    renderPage(element, "?a=1&b=2");

    // Wait for the banner's mount-effect to flush (it renders null
    // synchronously, then flips on after `useEffect` reads sessionStorage).
    expect(await screen.findByText(/shareable/i)).toBeInTheDocument();
  });

  it("does not render the ShareBanner in the empty branch", async () => {
    sessionStorage.removeItem("compare:share-banner-dismissed");

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({}),
    });
    renderPage(element);

    // Give the React tree a tick — if a stray ShareBanner were mounted
    // outside the both-loaded branch, its useEffect would have flipped
    // it visible by now.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/shareable/i)).not.toBeInTheDocument();
  });

  it("does not render the ShareBanner in the partial-load branch", async () => {
    sessionStorage.removeItem("compare:share-banner-dismissed");

    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1, "Player A"))
      .mockResolvedValueOnce(null);

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1", b: "999999" }),
    });
    renderPage(element, "?a=1&b=999999");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/shareable/i)).not.toBeInTheDocument();
  });

  it("renders the DataUnavailable card when both ids are present but one's stats are null (TASK-703)", async () => {
    // Both ids are in the URL but one resolves to null — e.g. a player with no
    // stats for the selected season. Rather than the "pick a second player"
    // hint (which implies a slot is empty) or a half-empty comparison, the page
    // shows the per-season empty-state card.
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1, "Player A"))
      .mockResolvedValueOnce(null);

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1", b: "999999" }),
    });
    renderPage(element, "?a=1&b=999999");

    expect(
      screen.getByRole("status", { name: /no comparison for these seasons/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pick a second player to compare/i)).not.toBeInTheDocument();
    // The StatRow stack should NOT render — assert on representative
    // metrics being absent.
    expect(screen.queryByText("Pass accuracy")).not.toBeInTheDocument();
    expect(screen.queryByText("Goals")).not.toBeInTheDocument();
  });

  it("rejects non-numeric ?a / ?b without firing any server fetch", async () => {
    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "abc", b: "def" }),
    });
    renderPage(element);

    expect(getPlayerStats).not.toHaveBeenCalled();
    // Same UX as the all-empty case — two pickers, no comparison.
    expect(screen.getByPlaceholderText(/search player a/i)).toBeInTheDocument();
  });

  it("forwards the optional ?season override to the server fetchers", async () => {
    vi.mocked(getPlayerStats)
      .mockResolvedValueOnce(playerWithMetrics(1, "A"))
      .mockResolvedValueOnce(playerWithMetrics(2, "B"));

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1", b: "2", season: "2023" }),
    });
    renderPage(element, "?a=1&b=2&season=2023");

    expect(getPlayerStats).toHaveBeenCalledWith(1, 2023);
    expect(getPlayerStats).toHaveBeenCalledWith(2, 2023);
  });

  it("resolves per-slot seasons independently — career for ?sa=all, season for ?sb", async () => {
    vi.mocked(getPlayerStats).mockResolvedValue(playerWithMetrics(27, "Erling Haaland"));
    vi.mocked(getPlayerCareer).mockResolvedValue({
      player: playerWithMetrics(1003061, "Thierry Henry").player,
      metrics: metrics({ goals: 175 }),
      span: { from: 1999, to: 2011 },
    });

    const element = await ComparePage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ a: "1003061", sa: "all", b: "27", sb: "2024" }),
    });
    renderPage(element, "?a=1003061&sa=all&b=27&sb=2024");

    // Slot A resolved via the career aggregate; slot B via a single season.
    expect(getPlayerCareer).toHaveBeenCalledWith(1003061);
    expect(getPlayerStats).toHaveBeenCalledWith(27, 2024);
    // Career label + both names render. The career label also appears in the
    // radar legend (TASK-1513 HTML legend), so scope this to the heading.
    const heading = screen.getByRole("heading", { level: 2 });
    expect(within(heading).getByText(/Career 1999–2011/)).toBeInTheDocument();
    expect(within(heading).getByText("Thierry Henry")).toBeInTheDocument();
    expect(within(heading).getByText("Erling Haaland")).toBeInTheDocument();
  });
});
