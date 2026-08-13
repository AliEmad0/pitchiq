import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `/game/*` route must be `force-static`.
 *
 * The whole TASK-M71 arc existed to get routes off lambdas and onto the CDN, and the
 * Fluid-CPU crisis it fixed was caused by exactly this directive being absent — a route
 * with only `revalidate` falls back to a dynamic render, ships `private, no-store`, and
 * every view runs a function.
 *
 * ⚠️ This asserts the DIRECTIVE, not the outcome. Only `next build` can prove a route
 * actually prerenders (`●` rather than `ƒ`), and CI runs that. What this catches is the
 * cheap, silent regression: someone adds a `/game/*` route and forgets the export, or
 * deletes it while refactoring. That is the failure mode that has actually happened.
 */
const GAME_ROUTES = join(process.cwd(), "src", "app", "[locale]", "game");

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

describe("game routes stay CDN-served", () => {
  const files = pageFiles(GAME_ROUTES);

  it("finds every game route", () => {
    // If this drops the glob broke and every assertion below is vacuous. Raise it when
    // a route is added: /game (the gate), /game/demo, /game/chaos, /game/draft.
    // TASK-1832 retired /game/play — it is a next.config redirect now, not a route.
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files.map((f) => [f.slice(f.indexOf("src")), f]))(
    "%s declares force-static",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/export const dynamic\s*=\s*"force-static"/);
    },
  );
});
