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

/**
 * The game's DATA routes, outside `/[locale]` because they serve JSON rather than a screen.
 *
 * ⛔ Held to the same rule and for a sharper reason: a page that goes dynamic costs a lambda
 * per view, but this one is fetched by the draft screen on every club change — so without
 * `force-static` plus a closed param set it is a lambda per interaction, which is the 2026-07
 * Fluid Active-CPU shape in miniature.
 */
const GAME_API_ROUTES = [
  join(process.cwd(), "src", "app", "api", "game", "classic", "[season]", "route.ts"),
  join(process.cwd(), "src", "app", "api", "game", "rivals", "[club]", "route.ts"),
];

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
    // a route is added: /game (the gate), /game/demo, /game/chaos, /game/draft,
    // /game/daily (TASK-1817), /game/[mode] + /game/[mode]/[club] (TASK-1810).
    // TASK-1832 retired /game/play — it is a next.config redirect now, not a route.
    // ⚠️ The two dynamic files stand for N prerendered pages between them (one per pack,
    // one per pack × club), so this counts FILES, not pages — do not "fix" it downward
    // when the club list grows.
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files.map((f) => [f.slice(f.indexOf("src")), f]))(
    "%s declares force-static",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/export const dynamic\s*=\s*"force-static"/);
    },
  );

  /**
   * ⛔ A DYNAMIC segment needs more than `force-static` (TASK-1810).
   *
   * `force-static` fixes how a route renders; it does NOT stop Next rendering params that
   * `generateStaticParams` never returned. Those are built on demand and cached — one
   * lambda per invented URL, which is the 2026-07 Fluid Active-CPU shape exactly. Both
   * parameterised game routes back a closed set (the rule packs; the 51 PL clubs), so
   * anything outside it must 404 without the page running.
   */
  const dynamicRoutes = files.filter((f) => /\[[^\]]+\][/\\]page\.tsx$/.test(f));

  it("finds the parameterised game routes", () => {
    // Guards the guard: if this glob stops matching, every assertion below is vacuous.
    expect(dynamicRoutes.length).toBeGreaterThanOrEqual(2);
  });

  it.each(dynamicRoutes.map((f) => [f.slice(f.indexOf("src")), f]))(
    "%s closes its param set",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/export const dynamicParams\s*=\s*false/);
      expect(source).toMatch(/export async function generateStaticParams/);
    },
  );

  it.each(GAME_API_ROUTES.map((f) => [f.slice(f.indexOf("src")), f]))(
    "%s is prerendered too",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/export const dynamic\s*=\s*"force-static"/);
      expect(source).toMatch(/export const dynamicParams\s*=\s*false/);
      expect(source).toMatch(/export async function generateStaticParams/);
    },
  );
});
