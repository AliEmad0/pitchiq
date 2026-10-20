import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TASK-1813/1819 motion — the Trophy Room's half of the owner's hybrid, #1 Sticker Slap:
 * stickers and lit cups pop in with a small overshoot, staggered. Rules, not bare selectors.
 */
const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
function ruleBody(selector: string): string | null {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`);
  return re.exec(css)?.[2] ?? null;
}
const ANIMATED = [".ta-sticker", ".tc-cup.is-lit"];

describe("Trophy Room motion", () => {
  it("stickers and lit cups pop, staggered, once", () => {
    for (const s of ANIMATED) {
      const body = ruleBody(s);
      expect(body, s).not.toBeNull();
      expect(body!, s).toMatch(/animation:[^;]*tr-pop/);
      expect(body!, s).toMatch(/var\(--i/);
      expect(body!, s).not.toMatch(/infinite/);
    }
    expect(css).toContain("@keyframes tr-pop {");
  });

  it("⛔ reduced motion stops both", () => {
    const gate =
      /@media \(prefers-reduced-motion: reduce\) \{\s*(\.ta-[^{]+)\{\s*animation: none;\s*\}/.exec(
        css,
      );
    expect(gate, "trophy reduce gate").not.toBeNull();
    for (const s of ANIMATED) expect(gate![1]).toContain(s);
  });
});
