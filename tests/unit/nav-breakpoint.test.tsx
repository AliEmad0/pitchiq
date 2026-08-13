import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { renderWithIntl } from "./_helpers/intl";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { MobileNav } from "@/components/layout/MobileNav";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * TASK-M79 — the desktop pill nav and the mobile drawer are exact complements:
 * the drawer hides at precisely the width the pill row appears. That pairing is
 * only ever expressed as two Tailwind class names in two different files, and
 * nothing else checks them against each other.
 *
 * Get it wrong in either direction and a whole band of viewports breaks:
 * reveal the pills too low and the header overflows (the bug this ticket fixed,
 * 157px of sideways scroll at 820px); raise the drawer's breakpoint without
 * raising the nav's and every width in between has **no navigation at all**.
 *
 * These read the token rather than a literal breakpoint so the guard survives
 * a deliberate future move — what it pins is that the two move together.
 */
function breakpointOf(className: string, utility: "flex" | "hidden"): string | undefined {
  return className
    .split(/\s+/)
    .find((token) => new RegExp(`^[a-z0-9]+:${utility}$`).test(token))
    ?.split(":")[0];
}

describe("nav breakpoints — the pill row and the drawer are complements", () => {
  it("reveals the desktop pill nav at the same breakpoint that hides the drawer trigger", () => {
    renderWithIntl(<PrimaryNav />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    cleanup();

    renderWithIntl(<MobileNav />);
    const trigger = screen.getByRole("button", { name: /open navigation menu/i });

    const revealsAt = breakpointOf(nav.className, "flex");
    const drawerHidesAt = breakpointOf(trigger.className, "hidden");

    expect(revealsAt).toBeDefined();
    expect(drawerHidesAt).toBeDefined();
    expect(revealsAt).toBe(drawerHidesAt);
  });

  it("keeps the pill nav hidden by default so the breakpoint is the only thing that shows it", () => {
    renderWithIntl(<PrimaryNav />);
    const nav = screen.getByRole("navigation", { name: /primary/i });

    expect(nav.className.split(/\s+/)).toContain("hidden");
  });
});
