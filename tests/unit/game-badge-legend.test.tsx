import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithIntl } from "./_helpers/intl";

const { BadgeLegend } = await import("@/features/game/components/PlayerBadges");

const labels = {
  goal: "Goal",
  assist: "Assist",
  yellow: "Yellow card",
  red: "Red card — sent off",
  subOn: "Came on as a substitute",
  subOff: "Substituted off",
};

describe("BadgeLegend", () => {
  it("names every mark that can appear on a roster row", () => {
    // The badges are symbolic so nothing needs translating — which serves a screen
    // reader well and a sighted player seeing a boot for the first time not at all.
    renderWithIntl(<BadgeLegend labels={labels} />);
    for (const text of Object.values(labels)) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("draws the same glyphs the rows use, not a second set", () => {
    // Six entries, each with its own glyph carrying the same aria-label as the row
    // badge. If these ever diverge the key stops being a key.
    renderWithIntl(<BadgeLegend labels={labels} />);
    for (const text of Object.values(labels)) {
      expect(screen.getByRole("img", { name: text })).toBeInTheDocument();
    }
  });

  it("shows the substitution glyphs with a number, because that number is the confusing part", () => {
    // The count next to an arrow is WHICH substitution, not how many — the single
    // thing people misread on this panel.
    renderWithIntl(<BadgeLegend labels={labels} />);
    const onEntry = screen.getByText(labels.subOn).closest("li");
    expect(onEntry).not.toBeNull();
    expect(onEntry!.textContent).toMatch(/2/);
  });
});
