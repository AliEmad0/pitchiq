import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { UnlockBanner } from "@/features/game/components/UnlockBanner";
import ar from "@/i18n/messages/ar.json";
import { renderWithIntl } from "./_helpers/intl";

/** TASK-1813 — the full-time line for what a match unlocked. */
describe("UnlockBanner", () => {
  it("names each unlocked achievement", () => {
    renderWithIntl(<UnlockBanner ids={["hat-trick", "late-winner"]} />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Achievement unlocked");
    expect(banner).toHaveTextContent("Hat-trick Hero · Squeaky Bum Time");
  });

  it("renders nothing when nothing was unlocked", () => {
    const { container } = renderWithIntl(<UnlockBanner ids={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("speaks Arabic", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <UnlockBanner ids={["hat-trick"]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("بطل الهاتريك");
  });
});
