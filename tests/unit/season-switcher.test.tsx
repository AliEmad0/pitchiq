import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "./_helpers/intl";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";

// TASK-M71a: the switcher reads the pathname (path-mode on `/` and
// `/seasons/*`) and needs a mounted router to navigate. Default to a
// query-param route; the path-mode tests override per-test.
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/teams"),
  useRouter: () => ({ push: vi.fn() }),
}));

import { usePathname } from "next/navigation";

import { SeasonSwitcher } from "@/components/layout/SeasonSwitcher";
import { currentDataSeason, formatSeasonLabel } from "@/utils/season";

const mockUsePathname = vi.mocked(usePathname);

afterEach(() => {
  cleanup();
  mockUsePathname.mockReturnValue("/teams");
});

// The committed-season list the server `<SeasonSwitcherLoader>` would pass —
// newest-first, mirroring `data/_meta.json.seasons` (TASK-701/702).
const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];

// Radix Select renders the chosen value inside the trigger button (the
// `aria-haspopup="listbox"` element). We assert on the trigger's text
// instead of opening the dropdown — happy-dom doesn't drive Radix's pointer
// portal reliably, and the open-list interaction is better covered by an
// E2E. The hook test below covers the URL-state round-trip.

describe("SeasonSwitcher", () => {
  it("defaults the trigger label to the current data season when no ?season= is set", () => {
    renderWithIntl(
      <NuqsTestingAdapter>
        <SeasonSwitcher seasons={SEASONS} />
      </NuqsTestingAdapter>,
    );
    const expected = formatSeasonLabel(currentDataSeason());
    expect(screen.getByRole("combobox", { name: "Season" })).toHaveTextContent(expected);
  });

  it("reflects the ?season= URL param on the trigger", () => {
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?season=2018">
        <SeasonSwitcher seasons={SEASONS} />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByRole("combobox", { name: "Season" })).toHaveTextContent("2018-19");
  });

  it("falls back to the current season when ?season= is non-numeric", () => {
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?season=not-a-year">
        <SeasonSwitcher seasons={SEASONS} />
      </NuqsTestingAdapter>,
    );
    const expected = formatSeasonLabel(currentDataSeason());
    expect(screen.getByRole("combobox", { name: "Season" })).toHaveTextContent(expected);
  });

  // TASK-M71a — on the dashboard routes the season lives in the PATH, so the
  // trigger label derives from the pathname, not `?season=`.
  it("derives the trigger label from /seasons/<year> on the dashboard routes", () => {
    mockUsePathname.mockReturnValue("/seasons/2018");
    renderWithIntl(
      <NuqsTestingAdapter>
        <SeasonSwitcher seasons={SEASONS} />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByRole("combobox", { name: "Season" })).toHaveTextContent("2018-19");
  });

  it("shows the current season on `/` even when ?season= lingers", () => {
    mockUsePathname.mockReturnValue("/");
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?season=2018">
        <SeasonSwitcher seasons={SEASONS} />
      </NuqsTestingAdapter>,
    );
    const expected = formatSeasonLabel(currentDataSeason());
    expect(screen.getByRole("combobox", { name: "Season" })).toHaveTextContent(expected);
  });
});
