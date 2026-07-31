import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";

import { NavLink } from "@/components/layout/NavLink";

const mockUsePathname = vi.mocked(usePathname);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NavLink", () => {
  it("renders the label as a link with the configured href", () => {
    mockUsePathname.mockReturnValue("/");
    render(<NavLink href="/teams">Teams</NavLink>);

    const link = screen.getByRole("link", { name: "Teams" });
    expect(link).toHaveAttribute("href", "/teams");
  });

  it("does NOT mark the link active when the path does not match", () => {
    mockUsePathname.mockReturnValue("/teams");
    render(<NavLink href="/compare">Compare</NavLink>);

    expect(screen.getByRole("link", { name: "Compare" })).not.toHaveAttribute("aria-current");
  });

  it("marks the link active on exact match", () => {
    mockUsePathname.mockReturnValue("/teams");
    render(<NavLink href="/teams">Teams</NavLink>);

    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute("aria-current", "page");
  });

  it("marks the link active on prefix match (nested route)", () => {
    mockUsePathname.mockReturnValue("/teams/33");
    render(<NavLink href="/teams">Teams</NavLink>);

    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute("aria-current", "page");
  });

  it("uses exact match for the root path — '/teams' does NOT activate '/'", () => {
    mockUsePathname.mockReturnValue("/teams");
    render(<NavLink href="/">Dashboard</NavLink>);

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("marks the Dashboard link active only when path is exactly '/'", () => {
    mockUsePathname.mockReturnValue("/");
    render(<NavLink href="/">Dashboard</NavLink>);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  // TASK-M71b — the viewed season is carried in the PATH, not `?season=`.
  it("carries a historical season into the href as the /seasons/<year> path form", () => {
    mockUsePathname.mockReturnValue("/seasons/2003/teams");
    render(
      <NavLink href="/teams" season={2003}>
        Teams
      </NavLink>,
    );

    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute(
      "href",
      "/seasons/2003/teams",
    );
  });

  it("carries the season onto the Dashboard link and still matches the active path", () => {
    mockUsePathname.mockReturnValue("/");
    render(
      <NavLink href="/" season={2003}>
        Dashboard
      </NavLink>,
    );

    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("href", "/seasons/2003");
    expect(link).toHaveAttribute("aria-current", "page"); // active match uses the bare href
  });

  it("keeps the bare href for the current season or when no season is set", () => {
    mockUsePathname.mockReturnValue("/");
    const { rerender } = render(<NavLink href="/teams">Teams</NavLink>);
    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute("href", "/teams");

    rerender(
      <NavLink href="/teams" season={null}>
        Teams
      </NavLink>,
    );
    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute("href", "/teams");
  });
});
