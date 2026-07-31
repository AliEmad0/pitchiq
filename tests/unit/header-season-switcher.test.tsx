import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "./_helpers/intl";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  // TASK-M71a: the inner <SeasonSwitcher> mounts the router for path-mode
  // navigation on `/` and `/seasons/*`.
  useRouter: () => ({ push: vi.fn() }),
}));

import { usePathname } from "next/navigation";

import { HeaderSeasonSwitcher } from "@/components/layout/HeaderSeasonSwitcher";

const mockUsePathname = vi.mocked(usePathname);
const SEASONS = [2025, 2024, 2023, 2022, 2021];

function renderAt(pathname: string) {
  mockUsePathname.mockReturnValue(pathname);
  renderWithIntl(
    <NuqsTestingAdapter>
      <HeaderSeasonSwitcher seasons={SEASONS} />
    </NuqsTestingAdapter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The global header switcher (all committed seasons) hides itself on entity
// detail pages — those render their own season control scoped to the entity's
// seasons (TASK-M10), so leaving the all-seasons one would re-introduce the
// "pick a season the entity has no data for" footgun this ticket closes.
describe("HeaderSeasonSwitcher", () => {
  it("renders the global season switcher on the dashboard", () => {
    renderAt("/");
    expect(screen.getByRole("combobox", { name: "Season" })).toBeInTheDocument();
  });

  it("renders the global season switcher on the teams index", () => {
    renderAt("/teams");
    expect(screen.getByRole("combobox", { name: "Season" })).toBeInTheDocument();
  });

  // TASK-M71b: /compare has its own per-slot season pickers and the global
  // switcher no longer writes a `?season=` it could consume, so it hides here
  // (like /map).
  it("hides the global switcher on /compare", () => {
    renderAt("/compare");
    expect(screen.queryByRole("combobox", { name: "Season" })).not.toBeInTheDocument();
  });

  it("hides the global switcher on a player detail page", () => {
    renderAt("/players/1001119");
    expect(screen.queryByRole("combobox", { name: "Season" })).not.toBeInTheDocument();
  });

  it("hides the global switcher on a team detail page", () => {
    renderAt("/teams/40");
    expect(screen.queryByRole("combobox", { name: "Season" })).not.toBeInTheDocument();
  });

  it("hides the global switcher on a manager detail page (TASK-M49)", () => {
    renderAt("/managers/58");
    expect(screen.queryByRole("combobox", { name: "Season" })).not.toBeInTheDocument();
  });

  it("renders the global season switcher on the managers index", () => {
    renderAt("/managers");
    expect(screen.getByRole("combobox", { name: "Season" })).toBeInTheDocument();
  });

  it("hides the global switcher on /map — the timeline slider is the control (TASK-M27)", () => {
    renderAt("/map");
    expect(screen.queryByRole("combobox", { name: "Season" })).not.toBeInTheDocument();
  });
});
