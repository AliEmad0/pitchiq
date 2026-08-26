import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { BASE_SEASON } from "@/features/game/domain/market-index";
import type { PoolSpec } from "@/features/game/domain/rule-packs";
import { buildSession } from "@/features/game/view/match-session";

const CAP = 1000; // £100.0m in tenths
const SPEC: PoolSpec = { kind: "pricedMarket", cap: 600, baseSeason: BASE_SEASON };
const NAMES = { home: "Your XI", away: "Rivals" };
// ⚠️ By NAME, never by index — `FORMATIONS`' order is presentation only, and a guard test
// in `game-formation.test.ts` fails on index access.
const SHAPE = formationByName("4-4-2 Flat");
const away = (s: { away: { players: readonly { cardId: string }[] } }) =>
  s.away.players.map((p) => p.cardId);
const cost = (xi: readonly PoolCard[]) => xi.reduce((a, c) => a + (c.price ?? 0), 0);

/**
 * The budget reaches the RIVAL, not only the coach's draft.
 *
 * ⛔ This is the half that is easy to miss and impossible to see: `policy: "budget"` with no
 * cap has an Infinity ceiling, so it degenerates into best-available and the coach's €100M XI
 * faces the unlimited one — a match that looks completely normal on screen.
 */
describe("budget session", () => {
  it("⭐ the DRAFTED bench is the one that plays, and the XI keeps its eleven", async () => {
    /**
     * ⛔ The coach PAYS for his bench (owner, 2026-08-26), so it has to be the bench that
     * actually appears — paying for five men who never play is a lie the screen tells.
     *
     * ⚠️ `buildSession` is the ONLY place the squad is split, at `formation.slots.length`.
     * That is what makes the drafted bench survive storage, the share code and both replays
     * without any of them learning about benches: they all carry one ordered list.
     */
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const xi = pool.slice(0, 11);
    const bench = pool.slice(11, 16);
    const s = buildSession(pool, [...xi, ...bench], SHAPE, 4242, NAMES, {
      policy: "budget",
      budget: CAP,
    });
    expect(s.home.players.map((p) => p.cardId)).toEqual(xi.map((c) => c.cardId));
    expect((s.home.bench ?? []).map((p) => p.cardId)).toEqual(bench.map((c) => c.cardId));
  }, 300_000);

  it("⛔ THE CONTROL — an XI-only squad still gets the AUTO-drafted bench", async () => {
    // Every other mode hands up eleven and must be completely untouched by the split.
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const xi = pool.slice(0, 11);
    const s = buildSession(pool, xi, SHAPE, 4242, NAMES, { policy: "budget", budget: CAP });
    expect(s.home.players).toHaveLength(11);
    expect((s.home.bench ?? []).length).toBeGreaterThan(0);
    // ...and it is NOT simply the next cards off the pool, which is what a split of an
    // eleven-card list would wrongly produce.
    expect((s.home.bench ?? []).map((p) => p.cardId)).not.toEqual(
      pool.slice(11, 16).map((c) => c.cardId),
    );
  }, 300_000);

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
