import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/teams",
  useRouter: () => ({ replace }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("season=2004"),
}));

// ⭐ The locale list is mocked so the SWITCHING behaviour below keeps being exercised while
// Arabic is parked out of the real `routing.locales` (TASK-1843). Deleting these cases would
// let the two-locale logic rot silently, and restoring the locale is meant to be one edit in
// `src/i18n/routing.ts` — not a repair job. See tests/unit/i18n-routing.test.ts.
// ⚠️ `vi.hoisted` is required: `vi.mock` is lifted above every `const` in the file, so a
// plain declaration here is still in its temporal dead zone when the factory runs.
const routingMock = vi.hoisted(() => ({ locales: ["en", "ar"] as string[] }));
vi.mock("@/i18n/routing", () => ({ routing: routingMock }));

import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

import { renderWithIntl } from "./_helpers/intl";

beforeEach(() => {
  routingMock.locales = ["en", "ar"];
});

afterEach(() => {
  cleanup();
  replace.mockClear();
});

describe("LocaleSwitcher", () => {
  it("from English, offers Arabic and switches, preserving path + season", () => {
    renderWithIntl(<LocaleSwitcher />, "en");
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }));
    expect(replace).toHaveBeenCalledWith(
      { pathname: "/teams", query: { season: "2004" } },
      { locale: "ar" },
    );
  });

  it("from Arabic, offers English", () => {
    renderWithIntl(<LocaleSwitcher />, "ar");
    fireEvent.click(screen.getByRole("button", { name: /Switch to English/i }));
    expect(replace).toHaveBeenCalledWith(
      { pathname: "/teams", query: { season: "2004" } },
      { locale: "en" },
    );
  });

  // ⛔ The shipped state. This component names "en" and "ar" literally rather than deriving
  // them, so with Arabic parked it went on rendering a "ع" button whose destination
  // next.config.ts 301s straight back to English — a control that visibly does nothing.
  it("⛔ renders NOTHING when only one locale ships", () => {
    routingMock.locales = ["en"];
    const { container } = renderWithIntl(<LocaleSwitcher />, "en");
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
