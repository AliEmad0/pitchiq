import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// TASK-M68 — the strip's colour encoding is CSS-driven; guard the ramp the way
// ix-css.test.ts guards the interaction utilities. The hexes are the validated
// ones from the design spec (single hue, monotone lightness, every adjacent gap
// >= 0.06, the step nearest the surface clears 2:1).
const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");

const LIGHT = ["#dc9ed2", "#ce82c2", "#be65b3", "#af47a3", "#9e2193", "#86017c", "#690161"];
const DARK = ["#713b6a", "#8e4785", "#ab53a0", "#ca60bd", "#e96dda", "#ff87f0", "#ffb4f3"];

describe("market-value ramp tokens (globals.css)", () => {
  it("declares all seven light-mode steps", () => {
    LIGHT.forEach((hex, i) => expect(css).toContain(`--mv-${i + 1}: ${hex};`));
  });

  it("declares all seven dark-mode steps", () => {
    DARK.forEach((hex, i) => expect(css).toContain(`--mv-${i + 1}: ${hex};`));
  });

  it("is theme-invariant — no era block reassigns the ramp", () => {
    const eraBlocks = css.match(/\[data-era[^\]]*\][^{]*\{[^}]*\}/g) ?? [];
    for (const block of eraBlocks) expect(block).not.toMatch(/--mv-\d/);
  });
});
