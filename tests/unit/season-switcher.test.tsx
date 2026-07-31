import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "./_helpers/intl";

// TASK-M71b — the switcher is fully path-model now (no `?season=`, no
// useSeason). It reads the locale-stripped pathname and pushes a path target.
// The switcher imports usePathname/useRouter from @/i18n/navigation, whose test
// stub re-exports them from next/navigation — so mock next/navigation.
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/teams"),
  useRouter: () => ({ push }),
}));

import { usePathname } from "next/navigation";

import { SeasonSwitcher } from "@/components/layout/SeasonSwitcher";
import { currentDataSeason, formatSeasonLabel } from "@/utils/season";

const mockUsePathname = vi.mocked(usePathname);
const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

afterEach(() => {
  cleanup();
  push.mockClear();
  mockUsePathname.mockReturnValue("/teams");
});

// Radix Select renders the chosen value inside the trigger button; we assert on
// the trigger text rather than opening the portal (happy-dom can't drive it).
// Navigation on pick is covered by e2e; the unit test pins the derived value.
describe("SeasonSwitcher", () => {
  it("shows the current season on a bare section index", () => {
    mockUsePathname.mockReturnValue("/teams");
    renderWithIntl(<SeasonSwitcher seasons={SEASONS} />);
    expect(screen.getByRole("combobox", { name: "Season" })).toHaveTextContent(
      formatSeasonLabel(currentDataSeason()),
    );
  });

  it("derives the trigger from /seasons/<year>", () => {
    mockUsePathname.mockReturnValue("/seasons/2018");
    renderWithIntl(<SeasonSwitcher seasons={SEASONS} />);
    expect(screen.getByRole("combobox", { name: "Season" })).toHaveTextContent("2018-19");
  });

  it("derives the trigger from /seasons/<year>/<section>", () => {
    mockUsePathname.mockReturnValue("/seasons/2018/teams");
    renderWithIntl(<SeasonSwitcher seasons={SEASONS} />);
    expect(screen.getByRole("combobox", { name: "Season" })).toHaveTextContent("2018-19");
  });
});
