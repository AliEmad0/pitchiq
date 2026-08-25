import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { BASE_SEASON } from "@/features/game/domain/market-index";
import type { PoolSpec } from "@/features/game/domain/rule-packs";
import { buildSession } from "@/features/game/view/match-session";

const CAP = 100_000_000;
const SPEC: PoolSpec = { kind: "pricedMarket", cap: 600, baseSeason: BASE_SEASON };
const NAMES = { home: "Your XI", away: "Rivals" };
// ⚠️ By NAME, never by index — `FORMATIONS`' order is presentation only, and a guard test
// in `game-formation.test.ts` fails on index access.
const SHAPE = formationByName("4-4-2 Flat");
const away = (s: { away: { players: readonly { cardId: string }[] } }) =>
  s.away.players.map((p) => p.cardId);
const cost = (xi: readonly PoolCard[]) => xi.reduce((a, c) => a + (c.costEur ?? 0), 0);

/**
 * The budget reaches the RIVAL, not only the coach's draft.
 *
 * ⛔ This is the half that is easy to miss and impossible to see: `policy: "budget"` with no
 * cap has an Infinity ceiling, so it degenerates into best-available and the coach's €100M XI
 * faces the unlimited one — a match that looks completely normal on screen.
 */
describe("budget session", () => {
  it("caps the rival it drafts", async () => {
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const xi = pool.slice(0, 11);
    const session = buildSession(pool, xi, SHAPE, 4242, NAMES, {
      policy: "budget",
      budget: CAP,
    });
    expect(session.away.players).toHaveLength(11);
    expect(cost(session.away.players as PoolCard[])).toBeLessThanOrEqual(CAP);
  }, 300_000);

  it("⛔ THE CONTROL — dropping the cap drafts a DIFFERENT, more expensive rival", async () => {
    // Without this the test above would stay green for an implementation that never threaded
    // the budget at all: an uncapped rival is still eleven players, it is just a better team.
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const xi = pool.slice(0, 11);
    const capped = buildSession(pool, xi, SHAPE, 4242, NAMES, { policy: "budget", budget: CAP });
    const uncapped = buildSession(pool, xi, SHAPE, 4242, NAMES, { policy: "budget" });

    expect(away(uncapped)).not.toEqual(away(capped));
    expect(cost(uncapped.away.players as PoolCard[])).toBeGreaterThan(CAP);
  }, 300_000);

  it("rebuilds the same rival from the same inputs, so a replay is not a corrupt save", async () => {
    // Resume and share both re-run `buildSession` and verify by fingerprint.
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const xi = pool.slice(0, 11);
    const opts = { policy: "budget" as const, budget: CAP };
    const live = buildSession(pool, xi, SHAPE, 777, NAMES, opts);
    const replay = buildSession(pool, xi, SHAPE, 777, NAMES, opts);
    expect(away(replay)).toEqual(away(live));
  }, 300_000);
});
