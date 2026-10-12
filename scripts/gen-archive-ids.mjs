#!/usr/bin/env node
/**
 * Regenerate src/generated/archive-ids.json — the ids the middleware rewrites to the
 * static-data archive shells (TASK-M96).
 *
 * The middleware runs on the edge and cannot read `data/`, so it needs this list baked in.
 * It is committed rather than generated during `next build` so the build stays a pure
 * function of the repo; `tests/unit/archive-ids.test.ts` recomputes it from the loaders and
 * FAILS if it drifts, which is when to run this:
 *
 *   node scripts/gen-archive-ids.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const current = Number(/LATEST_DATA_SEASON = (\d{4})/.exec(readFileSync("src/utils/season.ts", "utf8"))[1]);
const seasons = read("data/_meta.json").seasons.filter((s) => s <= current);

const fixtures = [];
for (const season of seasons) {
  if (season >= current) continue; // must mirror isArchivedSeason in src/data/archive.ts
  for (const f of read(`data/fixtures-${season}.json`)) fixtures.push(f.id);
}
fixtures.sort();

mkdirSync("src/generated", { recursive: true });
writeFileSync(
  "src/generated/archive-ids.json",
  JSON.stringify({ currentSeason: current, fixtures: fixtures.join(",") }) + "\n",
);
console.log(`archive-ids.json: ${fixtures.length} archived fixtures (current season ${current})`);
