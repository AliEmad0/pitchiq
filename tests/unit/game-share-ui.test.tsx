import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SummaryCardData } from "@/features/game/domain/summary-card";
import { ShareLink } from "@/features/game/components/ShareLink";
import { SummaryCard } from "@/features/game/components/SummaryCard";
import { renderWithIntl } from "./_helpers/intl";

const data: SummaryCardData = {
  home: "Your XI",
  away: "The Rivals",
  score: { home: 3, away: 1 },
  scorers: [
    { minute: 8, name: "Otamendi", side: "home", own: false, penalty: true },
    { minute: 61, name: "Otamendi", side: "away", own: true, penalty: false },
  ],
  formationName: "4-6-0 Strikerless",
  seed: 20260817,
  code: "v1.abc",
};

describe("ShareLink", () => {
  it("copies an ABSOLUTE url built from the current origin", async () => {
    // Absolutised in the browser, not from a configured origin, so a link copied out of a
    // preview deployment points at that deployment rather than silently at production.
    const writeText = vi.fn().mockResolvedValue(undefined);
    // ⚠️ `Object.assign` cannot be used — `navigator.clipboard` is a getter-only property.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderWithIntl(<ShareLink code="v1.abc" locale="en" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const url = writeText.mock.calls[0]![0] as string;
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toContain("/game/draft?m=v1.abc");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("puts the Arabic link under the locale prefix", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // ⚠️ `Object.assign` cannot be used — `navigator.clipboard` is a getter-only property.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderWithIntl(<ShareLink code="v1.abc" locale="ar" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText.mock.calls[0]![0]).toContain("/ar/game/draft?m=v1.abc");
  });
});

describe("SummaryCard", () => {
  // ⚠️ The DOM here has no 2D context, so `getContext` returns null and nothing is
  // painted. That is the point: the component must still render its controls, and the
  // CONTENT it would paint is tested in summary-card.test.ts, where it is real data
  // rather than pixels.
  it("renders its controls even when no 2D context exists", () => {
    renderWithIntl(<SummaryCard data={data} locale="en" />);
    expect(screen.getByRole("button", { name: "Download card" })).toBeInTheDocument();
  });

  it("labels the canvas with the scoreline, so it is not an unnamed image", () => {
    renderWithIntl(<SummaryCard data={data} locale="en" />);
    expect(screen.getByRole("img", { name: "Your XI 3–1 The Rivals" })).toBeInTheDocument();
  });

  it("⛔ uses the app's Eastern-Arabic digits under /ar, not Intl's", () => {
    // Measured in the browser: `new Intl.NumberFormat("ar").format(3)` returns a WESTERN
    // "3" in this engine, so the card would have printed 3–1 beside a UI printing ٣–١.
    // The app's `localizeDigits` is the only correct source.
    renderWithIntl(<SummaryCard data={data} locale="ar" />, "ar");
    expect(screen.getByRole("img", { name: "Your XI ٣–١ The Rivals" })).toBeInTheDocument();
  });

  it("does not throw when the download is pressed with nothing painted", async () => {
    renderWithIntl(<SummaryCard data={data} locale="en" />);
    await userEvent.click(screen.getByRole("button", { name: "Download card" }));
    expect(screen.getByRole("button", { name: "Download card" })).toBeInTheDocument();
  });
});
