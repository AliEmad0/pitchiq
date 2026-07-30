import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "./_helpers/intl";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";

// TASK-M71a: the inner <SeasonSwitcher> reads the pathname and needs a
// mounted router. Entity switchers live on entity detail pages — a
// query-param route, so the `?season=` behavior under test is unchanged.
vi.mock("next/navigation", () => ({
  usePathname: () => "/players/1",
  useRouter: () => ({ push: vi.fn() }),
}));

// Radix Select renders its options lazily inside a portal only when open, and
// happy-dom can't drive that pointer interaction (see season-switcher.test.tsx).
// To assert the SCOPED OPTION LIST directly, replace the UI primitives with
// trivial elements that render every SelectItem inline as role="option".
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div role="option" aria-selected={false} data-value={value}>
      {children}
    </div>
  ),
}));

import { EntitySeasonSwitcher } from "@/components/layout/EntitySeasonSwitcher";

afterEach(() => {
  cleanup();
});

describe("EntitySeasonSwitcher", () => {
  it("offers only the entity's seasons, newest-first, as the option list", () => {
    renderWithIntl(
      <NuqsTestingAdapter>
        <EntitySeasonSwitcher seasons={[2011, 2010, 2009]} />
      </NuqsTestingAdapter>,
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["2011-12", "2010-11", "2009-10"]);
  });

  it("does NOT offer a season the entity lacks (the M10 fix)", () => {
    renderWithIntl(
      <NuqsTestingAdapter>
        <EntitySeasonSwitcher seasons={[2003, 2002]} />
      </NuqsTestingAdapter>,
    );
    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels).not.toContain("2025-26");
  });

  it("renders a static label (no dropdown) for a single-season entity", () => {
    renderWithIntl(
      <NuqsTestingAdapter>
        <EntitySeasonSwitcher seasons={[2010]} />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByText("2010-11")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
