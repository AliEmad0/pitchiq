import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ⛔ AN ENTITY DETAIL ROUTE MAY NOT LEAVE REACHABLE PATHS UNBUILT — measured, 2026-08-30.
 *
 * `dynamicParams = true` means "generate any id I was not given, at request time". On a
 * `force-static` route that costs a Node render AND an ISR cache write **per distinct URL**,
 * paid once per path per deploy (a deploy resets the cache). That is affordable only while
 * nothing links to the unbuilt paths.
 *
 * ⭐ Nothing did, and then TASK-M71b (PR #74) opened `/seasons/<year>/<section>` for all 34
 * seasons. `<PlayersTable>` links every row to `/players/<id>` and `<FixtureBrowser>` links
 * every row to `/fixtures/<id>`, so ~4,825 players and ~12,786 fixtures per locale became
 * reachable while still unbuilt. The comment on the fixtures route still said they were
 * "pages nobody links to" — true when written, false ever since, and nothing failed to say so.
 *
 * A scraper walked that surface on 29-30 Aug 2026 and wrote **145,000 of the 200,000 monthly
 * ISR write units in two days**, at which point the whole account pauses. Vercel's own firewall
 * log named the shape: /fixtures/1992-08-25-LEE-TOT through /fixtures/2021-04-18-MUN-BUR.
 *
 * ⚠️ Prerendering the full set is NOT the expensive half. Build-time prerendering is not
 * metered as an ISR write — 1-28 Aug carried dozens of deploys at a near-zero write count,
 * and the entire 158,816 arrived in the two days the scraper ran. What prerendering spends is
 * BUILD TIME, and that is a ceiling to measure, not a bill that compounds with traffic.
 *
 * ⛔ So if the build ever nears the Hobby limit, trim by SEASON RANGE — never by turning
 * `dynamicParams` back on. An unbuilt path that something links to is the exact shape above.
 */

const ENTITY_ROUTES = [
  "src/app/[locale]/players/[id]/page.tsx",
  "src/app/[locale]/fixtures/[id]/page.tsx",
  "src/app/[locale]/managers/[id]/page.tsx",
  "src/app/[locale]/teams/[id]/page.tsx",
] as const;

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** The body of `generateStaticParams`, up to the next top-level `export`. */
function staticParamsBody(src: string): string {
  const start = src.indexOf("export async function generateStaticParams");
  expect(start, "generateStaticParams is missing entirely").toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("entity detail routes are bounded", () => {
  // A list of paths that no longer exist would make every assertion below vacuously true.
  it("finds every entity route it claims to guard", () => {
    for (const rel of ENTITY_ROUTES) {
      expect(read(rel).length, `${rel} is empty or missing`).toBeGreaterThan(0);
    }
  });

  it("⛔ every entity detail route sets `dynamicParams = false`", () => {
    const offenders = ENTITY_ROUTES.filter(
      (rel) => !/export const dynamicParams = false/.test(read(rel)),
    );
    expect(offenders).toEqual([]);
  });

  // The negative assertion above still passes for a route that prerenders only ONE season —
  // which is the state that caused the incident. These two routes are season-scoped, so they
  // must enumerate every committed season rather than `currentDataSeason()` alone.
  it.each([
    ["src/app/[locale]/players/[id]/page.tsx", "loadPlayers"],
    ["src/app/[locale]/fixtures/[id]/page.tsx", "loadFixtures"],
  ])("⚠️ %s prerenders EVERY season, not just the current one", (rel, loader) => {
    const body = staticParamsBody(read(rel));
    expect(body, "must iterate the committed seasons").toContain("getAvailableSeasons");
    // The precise regression: loading exactly one season inside generateStaticParams.
    expect(body).not.toMatch(new RegExp(`${loader}\\(\\s*currentDataSeason\\(\\)\\s*\\)`));
  });
});
