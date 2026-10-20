/**
 * TASK-1825 — captures `session-legacy-golden.json` from the code AS SHIPPED, before a coach's
 * style joined the match's identity. Run once, from the repo root, before changing the engine:
 *   npx tsx tests/unit/fixtures/capture-session-golden.ts
 * Never re-run it to make a failing golden pass: a mismatch means old saves and v2 links moved.
 */
import { writeFileSync } from "node:fs";
import { hashEvents } from "@/features/game/domain/hash";
import { drainSession, GOLDEN_RIVALS } from "./style-pool";

const out: Record<string, number[]> = {};
for (const [name, rival] of GOLDEN_RIVALS) {
  out[name] = Array.from({ length: 40 }, (_, i) => hashEvents(drainSession(i + 1, rival)));
}
writeFileSync(
  "tests/unit/fixtures/session-legacy-golden.json",
  JSON.stringify(out, null, 1) + "\n",
);
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.slice(0, 3)])));
