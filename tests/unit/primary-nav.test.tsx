import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { renderWithIntl } from "./_helpers/intl";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";

import { PrimaryNav } from "@/components/layout/PrimaryNav";

const mockPathname = vi.mocked(usePathname);
const mockSearchParams = vi.mocked(useSearchParams);

// next's useSearchParams is typed to return ReadonlyURLSearchParams; a plain
// URLSearchParams is structurally compatible at runtime for our `.get()` read.
const sp = (q = ""): ReadonlyURLSearchParams =>
  new URLSearchParams(q) as unknown as ReadonlyURLSearchParams;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PrimaryNav — segmented pill (Phase 15)", () => {
  it("renders the primary pill links inline", () => {
    mockPathname.mockReturnValue("/");
    mockSearchParams.mockReturnValue(sp());
    renderWithIntl(<PrimaryNav />);

    // TASK-1832 — "Compare" left this set to make room for "Game". Measured at 1024px the
    // header fits with exactly 0px to spare, and six inline pills overflowed it by 22px.
    for (const label of ["Dashboard", "Teams", "Players", "Fixtures", "Game"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    // Compare is still reachable — it moved into the "More ▾" dropdown, so it is absent
    // until that opens.
    expect(screen.queryByRole("link", { name: "Compare" })).toBeNull();
  });

  it("folds secondary sections into a 'More' dropdown (closed by default)", () => {
    mockPathname.mockReturnValue("/");
    mockSearchParams.mockReturnValue(sp());
    renderWithIntl(<PrimaryNav />);

    expect(screen.getByRole("button", { name: /more sections/i })).toBeInTheDocument();
    // The overflow items are only rendered once the dropdown opens.
    expect(screen.queryByRole("link", { name: "Managers" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Leaderboards" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Map" })).toBeNull();
  });

  it("marks the active primary link with aria-current", () => {
    mockPathname.mockReturnValue("/teams");
    mockSearchParams.mockReturnValue(sp());
    renderWithIntl(<PrimaryNav />);

    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute("aria-current", "page");
    // TASK-1832 — was "Compare"; it moved into the dropdown, so an inline pill that is
    // NOT the active one is now "Game".
    expect(screen.getByRole("link", { name: "Game" })).not.toHaveAttribute("aria-current");
  });

  // TASK-M71b — the viewed season comes from the PATH; pill links carry it in
  // the /seasons/<year>/<section> form.
  it("carries the viewed season onto the pill links in the path form", () => {
    mockPathname.mockReturnValue("/seasons/2003/teams");
    renderWithIntl(<PrimaryNav />);

    expect(screen.getByRole("link", { name: "Players" })).toHaveAttribute(
      "href",
      "/seasons/2003/players",
    );
  });

  it("keeps bare pill links on the current-season index", () => {
    mockPathname.mockReturnValue("/teams");
    renderWithIntl(<PrimaryNav />);

    expect(screen.getByRole("link", { name: "Players" })).toHaveAttribute("href", "/players");
  });
});
