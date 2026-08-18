import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * TASK-1810 — the Legacy flow's palette is a CONTRACT, not decoration.
 *
 * Both match screens read these tokens by name, and the owner's instruction was one theme
 * across the whole flow. A renamed or dropped token would not fail a component test — the
 * CSS variable simply resolves to nothing and the element renders transparent — so this
 * asserts the block itself.
 */
const css = readFileSync("src/app/globals.css", "utf8");

const TOKENS = [
  "--ground",
  "--panel",
  "--panel-2",
  "--rule",
  "--chalk",
  "--chalk-dim",
  "--chalk-faint",
  "--home",
  "--home-deep",
  "--away",
  "--away-deep",
  "--cta",
  "--alert",
  "--turf-a",
  "--turf-b",
  "--ink-home",
  "--ink-away",
  "--ink-cta",
] as const;

/** The `.lg-root` rule body, from its opening brace to the matching close. */
function legacyBlock(): string {
  const start = css.indexOf(".lg-root {");
  expect(start, ".lg-root must be defined in globals.css").toBeGreaterThan(-1);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

describe("the Legacy theme", () => {
  it("defines every token the two match screens read", () => {
    const block = legacyBlock();
    for (const token of TOKENS) expect(block, `${token} is missing`).toContain(`${token}:`);
  });

  it("scopes them to .lg-root so they cannot leak app-wide", () => {
    // `--home` and `--panel` are generic names. Defined on :root they would collide with
    // every other feature; the whole point of the scope is that they cannot.
    const roots = css.match(/:root\s*\{[^}]*\}/g) ?? [];
    for (const rule of roots) {
      for (const token of TOKENS) {
        expect(rule, `${token} must not be defined on :root`).not.toContain(`${token}:`);
      }
    }
  });

  it("gives the flow an explicit ground and ink, so no screen inherits the app theme", () => {
    const block = legacyBlock();
    expect(block).toContain("background: var(--ground)");
    expect(block).toContain("color: var(--chalk)");
  });
});
