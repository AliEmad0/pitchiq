import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TASK-1816 motion — the owner's HYBRID of two gallery designs: #1 "Insert Coin" (rows and
 * the full-time board blink on like an arcade attract screen, rows staggered) and #4 "Neon
 * Flicker" (the neon headings and the verdict flicker on like tubes).
 *
 * ⛔ The two halves animate `opacity` on DIFFERENT elements (the board blinks, the verdict
 * inside it flickers) — on one element the later declaration would cancel the other (the
 * TASK-1833 hybrid lesson). Tests assert RULES (`selector {` + `animation:`), never bare
 * selectors, which also appear in the reduce gate.
 */
const root = path.resolve(__dirname, "../..");
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const whatIf = readFileSync(path.join(root, "src/features/game/components/WhatIf.tsx"), "utf8");

function ruleBody(selector: string): string | null {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`);
  return re.exec(css)?.[2] ?? null;
}

const ANIMATED: Record<string, string> = {
  ".wi-row": "wi-blink",
  ".wi-board": "wi-blink",
  ".wi-h": "wi-flicker",
  ".wi-board-verdict": "wi-flicker",
  ".wi-vhs": "wi-fade",
};

describe("What-If motion", () => {
  it("each element carries its own animation", () => {
    for (const [selector, name] of Object.entries(ANIMATED)) {
      const body = ruleBody(selector);
      expect(body, selector).not.toBeNull();
      expect(body!, selector).toMatch(new RegExp(`animation:[^;]*${name}`));
      expect(css).toContain(`@keyframes ${name} {`);
    }
  });

  it("Insert Coin blinks in hard steps, and the rows are staggered by index", () => {
    expect(ruleBody(".wi-row")!).toMatch(/steps\(1\)/);
    expect(ruleBody(".wi-row")!).toMatch(/var\(--wi-i/);
    expect(whatIf).toMatch(/"--wi-i"/);
  });

  it("⛔ the board's blink and the verdict's flicker are on different elements", () => {
    expect(ruleBody(".wi-board")!).not.toMatch(/wi-flicker/);
    expect(ruleBody(".wi-board-verdict")!).not.toMatch(/wi-blink/);
  });

  it("every animation plays once", () => {
    for (const selector of Object.keys(ANIMATED))
      expect(ruleBody(selector)!).not.toMatch(/infinite/);
  });

  it("⛔ reduced motion stops every animated element", () => {
    const gate =
      /@media \(prefers-reduced-motion: reduce\) \{\s*(\.wi-[^{]+)\{\s*animation: none;\s*\}/.exec(
        css,
      );
    expect(gate, "wi reduce gate").not.toBeNull();
    for (const selector of Object.keys(ANIMATED)) expect(gate![1]).toContain(selector);
  });
});
