import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔ NO ROUTE MAY CARRY A TIME-BASED `revalidate` — measured, 2026-08-22.
 *
 * Every page renders from COMMITTED JSON under `data/`, and that JSON can only change through
 * a data-refresh PR from the pipeline — a push to `main`, i.e. a production deploy, which
 * rebuilds every page anyway. A 24-hour window therefore bought nothing: it paid to
 * regenerate pages that came out byte-identical.
 *
 * ⭐ And it was expensive. Vercel's Functions view put `/en/game/legacy/47` at **4.97 seconds
 * of Active CPU for one invocation** — a Legacy page rebuilds its club's entire history out of
 * all 34 season files — with `/api/game/rivals/40` at 4.91s and every Legacy club between 3.6
 * and 5.0 seconds. Across 51 clubs x 2 locales that is a recurring daily bill for no change in
 * output, on the plan whose CPU cap already paused this project once (TASK-M71).
 *
 * ⚠️ `revalidate = 0` is a DIFFERENT thing and stays allowed: it means "never cache", which is
 * what `/api/trivia` deliberately is. What this forbids is a positive number — a timer that
 * regenerates identical output on a schedule nothing else observes.
 */
describe("route revalidation", () => {
  const files = globSync("src/app/**/*.{ts,tsx}", { cwd: process.cwd() });

  it("finds the app routes at all (a glob that matches nothing proves nothing)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("⛔ no route sets a positive `revalidate`", () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      // A positive integer only — `false` and `0` are both legitimate.
      const m = src.match(/export\s+const\s+revalidate\s*=\s*([0-9]+)\s*;/);
      if (m && Number(m[1]) > 0) offenders.push(`${rel} -> ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("⚠️ the force-static pages really do declare `revalidate = false`", () => {
    // The negative assertion above passes for a route that declares nothing at all, which
    // would leave it on Next's default. Check the positive form on a route we know is static.
    const src = readFileSync(
      join(process.cwd(), "src/app/[locale]/game/[mode]/[club]/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/export const dynamic = "force-static"/);
    expect(src).toMatch(/export const revalidate = false/);
  });
});
