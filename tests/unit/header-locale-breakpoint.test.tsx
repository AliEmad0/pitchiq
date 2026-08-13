import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { renderWithIntl } from "./_helpers/intl";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/teams"),
  useRouter: () => ({ push: vi.fn() }),
}));

import { SeasonSwitcher } from "@/components/layout/SeasonSwitcher";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LAYOUT = join(process.cwd(), "src/components/layout");
const read = (file: string) => readFileSync(join(LAYOUT, file), "utf8");

/**
 * TASK-M80 — the phone header could not afford the language toggle, so it moved
 * into the mobile drawer below `sm` instead of being deleted. That makes the
 * header's wrapper and the drawer's row exact complements, expressed as two
 * Tailwind class names in two different files with nothing checking them
 * against each other.
 *
 * Get it wrong in either direction and phones lose: raise only the header's
 * breakpoint and a band of widths has NO language control; raise only the
 * drawer's and that band has TWO. The e2e spec measures 375px and 1280px, so
 * a desync in the middle band (`sm`–`lg`) would slip past it entirely.
 *
 * These read the breakpoint TOKEN rather than a literal, so a deliberate future
 * move still passes — what is pinned is that the two move together.
 *
 * Source-read rather than rendered: `Header` is an async Server Component that
 * calls `getTranslations`, which needs a request context this suite has no way
 * to provide. The pairing lives in the markup, so the markup is what we read.
 */
function breakpointOf(className: string, utility: string): string | undefined {
  return className
    .split(/\s+/)
    .find((token) => new RegExp(`^[a-z0-9]+:${utility}$`).test(token))
    ?.split(":")[0];
}

// The wrapper `<div>` immediately around the header's Suspense-boundaried
// LocaleSwitcher.
function headerLocaleWrapperClasses(): string {
  // `<Suspense[^>]*>` would not work: the fallback prop contains a self-closing
  // `<Skeleton … />`, so the first `>` ends the match early. Anchor on the div
  // being immediately followed by the boundary instead — that also stops the
  // enclosing controls-cluster div from matching first.
  const match = read("Header.tsx").match(
    /<div className="([^"]*)">\s*<Suspense[\s\S]*?<LocaleSwitcher\s*\/>/,
  );
  if (!match) throw new Error("Header.tsx: could not find the LocaleSwitcher wrapper <div>");
  return match[1];
}

// The drawer row that holds the same control below `sm`.
function drawerLocaleRowClasses(): string {
  const match = read("MobileNav.tsx").match(
    /<div className="([^"]*)">[\s\S]{0,600}?<LocaleSwitcher\s*\/>/,
  );
  if (!match) throw new Error("MobileNav.tsx: could not find the LocaleSwitcher row <div>");
  return match[1];
}

describe("the language toggle's header/drawer breakpoints are complements", () => {
  it("reveals it in the header at the same breakpoint that hides it in the drawer", () => {
    const revealsInHeaderAt = breakpointOf(headerLocaleWrapperClasses(), "block");
    const hidesInDrawerAt = breakpointOf(drawerLocaleRowClasses(), "hidden");

    expect(revealsInHeaderAt).toBeDefined();
    expect(hidesInDrawerAt).toBeDefined();
    expect(revealsInHeaderAt).toBe(hidesInDrawerAt);
  });

  it("keeps the header copy hidden by default so the breakpoint is the only thing that shows it", () => {
    expect(headerLocaleWrapperClasses().split(/\s+/)).toContain("hidden");
  });
});

/**
 * The season chip drops its label below `sm` to buy the other half of the
 * overflow budget. `sr-only` is load-bearing and `hidden` is NOT an equivalent
 * shortcut: `display: none` removes the value from the accessibility tree, so
 * the control would announce "Season" with no indication of which season it
 * currently holds — while still passing every width measurement.
 *
 * happy-dom applies no CSS, so both spellings leave identical DOM text; the
 * class token is the only thing that can be asserted here. The e2e spec covers
 * the width consequence.
 */
describe("the season chip's collapsed label", () => {
  it("hides the label from sight below sm while keeping it for screen readers", () => {
    renderWithIntl(<SeasonSwitcher seasons={[2025, 2024]} />);
    const value = screen
      .getByRole("combobox", { name: "Season" })
      .querySelector('[data-slot="select-value"]');

    expect(value).not.toBeNull();
    // The classes live on the WRAPPER: Radix's Select.Value ignores className
    // entirely (it renders its own span), so asserting on the value node itself
    // would pass against an unstyled element and prove nothing.
    const classes = (value!.parentElement?.className ?? "").split(/\s+/);
    expect(classes).toContain("sr-only");
    expect(classes).toContain("sm:not-sr-only");
    expect(classes).not.toContain("hidden");
  });
});
