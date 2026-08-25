// Regenerates the frozen table in src/features/game/domain/market-index.ts (TASK-1810).
//
// The basis is the mean of each season s 50 highest market values. See the design spec
// docs/superpowers/specs/2026-08-25-task-1810-budget-cap-design.md section 2 for why the
// top 50 rather than the median: the middle of the market inflated ~6.5x against the top s
// ~4.3x, so a median basis penalises older players by 1.8x.
import { readFileSync } from "node:fs";

const mv = JSON.parse(readFileSync("data/market-values.json", "utf8"));

// A season with fewer priced players than this is not a market. 2003 is a key in the file
// but holds 6 priced players out of 517, which is noise rather than a season.
const MIN_PRICED = 100;

const out = {};
for (const [season, byPlayer] of Object.entries(mv)) {
  const values = Object.values(byPlayer)
    .map((e) => e.valueEur)
    .filter((v) => typeof v === "number" && v > 0)
    .sort((a, b) => a - b);
  if (values.length < MIN_PRICED) continue;
  const top = values.slice(-50);
  out[season] = Math.round(top.reduce((a, b) => a + b, 0) / top.length);
}
console.log(JSON.stringify(out, null, 2));
