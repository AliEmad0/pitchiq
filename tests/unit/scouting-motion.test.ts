import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TASK-1825 motion — the dossier's half of the owner's hybrid: #1 Sticker Slap (the odds bars
 * draw left to right, staggered) + #5 Stamp Slam (the CONFIDENTIAL stamp slams down, the folder
 * shakes once, the verdict slams in). Four DIFFERENT elements, so no element carries two
 * animations (the TASK-1833 hybrid lesson). Rules are asserted, not bare selectors — the
 * selectors also appear in the reduce gate.
 */
const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");

function ruleBody(selector: string): string | null {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`);
  return re.exec(css)?.[2] ?? null;
}

const ANIMATED: Record<string, string> = {
  ".sd-bar": "sd-grow",
  ".sd-stamp": "sd-slam",
  ".sd-dossier.is-stamped": "sd-shake",
  ".sd-verdict": "sd-slam",
};

describe("Scout's Dossier motion", () => {
  it("each element carries its own animation, defined", () => {
    for (const [selector, name] of Object.entries(ANIMATED)) {
      const body = ruleBody(selector);
      expect(body, selector).not.toBeNull();
      expect(body!, selector).toMatch(new RegExp(`animation:[^;]*${name}`));
      expect(css).toContain(`@keyframes ${name} {`);
    }
  });

  it("the bars grow on scaleX and are staggered", () => {
    expect(ruleBody(".sd-bar")!).toMatch(/var\(--i/);
    const grow = /@keyframes sd-grow \{([\s\S]*?)\n\}/.exec(css)![1]!;
    expect(grow).toMatch(/scaleX\(0\)/);
  });

  it("the stamp comes to rest at its tilt, not upright", () => {
    const slam = /@keyframes sd-slam \{([\s\S]*?)\n\}/.exec(css)![1]!;
    expect(slam).toMatch(/to \{[^}]*rotate\(var\(--sd-tilt/);
  });

  it("every animation plays once", () => {
    for (const s of Object.keys(ANIMATED)) expect(ruleBody(s)!).not.toMatch(/infinite/);
  });

  it("⛔ reduced motion stops every animated element", () => {
    const gate =
      /@media \(prefers-reduced-motion: reduce\) \{\s*(\.sd-[^{]+)\{\s*animation: none;\s*\}/.exec(
        css,
      );
    expect(gate, "sd reduce gate").not.toBeNull();
    for (const s of Object.keys(ANIMATED)) expect(gate![1]).toContain(s);
  });
});
