import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "./_helpers/intl";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  // MobileNav now reads the active season to preserve it on the drawer links.
  useSearchParams: vi.fn(() => new URLSearchParams()),
  // TASK-M80 — the drawer also hosts the locale switcher below `sm`, and that
  // reads the router to swap locale in place. Without this the whole sheet
  // throws on render and every open-state test fails.
  useRouter: vi.fn(() => ({ replace: vi.fn(), push: vi.fn() })),
}));

import { usePathname } from "next/navigation";

import { MobileNav } from "@/components/layout/MobileNav";

const mockUsePathname = vi.mocked(usePathname);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setupOnRoute(pathname: string) {
  mockUsePathname.mockReturnValue(pathname);
  return userEvent.setup();
}

describe("MobileNav — closed state", () => {
  it("renders a hamburger button with an accessible label", () => {
    setupOnRoute("/");
    renderWithIntl(<MobileNav />);

    expect(screen.getByRole("button", { name: /open navigation menu/i })).toBeInTheDocument();
  });

  // TASK-M79 moved this from `md` to `lg`: the header cannot fit the desktop
  // pill row until ~1000px, so the drawer stays the navigation up to `lg`.
  // `nav-breakpoint.test.tsx` is what holds it in step with PrimaryNav.
  it("hides the trigger on lg+ via the `lg:hidden` utility class", () => {
    setupOnRoute("/");
    renderWithIntl(<MobileNav />);

    const trigger = screen.getByRole("button", {
      name: /open navigation menu/i,
    });
    expect(trigger.className).toMatch(/lg:hidden/);
  });

  it("does not render the nav links while the sheet is closed", () => {
    setupOnRoute("/");
    renderWithIntl(<MobileNav />);

    expect(screen.queryByRole("navigation", { name: /primary mobile/i })).not.toBeInTheDocument();
  });
});

describe("MobileNav — opening the sheet", () => {
  it("renders the three primary nav links inside the sheet after clicking the trigger", async () => {
    const user = setupOnRoute("/");
    renderWithIntl(<MobileNav />);

    await user.click(screen.getByRole("button", { name: /open navigation menu/i }));

    const nav = await screen.findByRole("navigation", {
      name: /primary mobile/i,
    });
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Teams" })).toHaveAttribute("href", "/teams");
    expect(within(nav).getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/compare");
  });

  it("marks the matching route as aria-current=page", async () => {
    const user = setupOnRoute("/teams");
    renderWithIntl(<MobileNav />);

    await user.click(screen.getByRole("button", { name: /open navigation menu/i }));

    const nav = await screen.findByRole("navigation", {
      name: /primary mobile/i,
    });
    expect(within(nav).getByRole("link", { name: "Teams" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(nav).getByRole("link", { name: "Compare" })).not.toHaveAttribute("aria-current");
  });

  it("activates the Dashboard link only on the exact root path", async () => {
    const user = setupOnRoute("/");
    renderWithIntl(<MobileNav />);

    await user.click(screen.getByRole("button", { name: /open navigation menu/i }));

    const nav = await screen.findByRole("navigation", {
      name: /primary mobile/i,
    });
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("treats nested routes (e.g. /teams/33) as activating the /teams link", async () => {
    const user = setupOnRoute("/teams/33");
    renderWithIntl(<MobileNav />);

    await user.click(screen.getByRole("button", { name: /open navigation menu/i }));

    const nav = await screen.findByRole("navigation", {
      name: /primary mobile/i,
    });
    expect(within(nav).getByRole("link", { name: "Teams" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("MobileNav — closing on link click", () => {
  it("closes the sheet (unmounts the navigation) when a link is clicked", async () => {
    const user = setupOnRoute("/");
    renderWithIntl(<MobileNav />);

    await user.click(screen.getByRole("button", { name: /open navigation menu/i }));

    const navBefore = await screen.findByRole("navigation", {
      name: /primary mobile/i,
    });
    const teamsLink = within(navBefore).getByRole("link", { name: "Teams" });

    await user.click(teamsLink);

    // Radix animates Sheet close; happy-dom doesn't run the animation, but
    // the controlled `open` state flips synchronously, so Sheet's presence
    // logic unmounts the portal. Use findBy* with negative assertion via
    // waitForElementToBeRemoved would be ideal, but a direct queryBy is
    // sufficient here since the state update happens during the click.
    expect(screen.queryByRole("navigation", { name: /primary mobile/i })).not.toBeInTheDocument();
  });
});
