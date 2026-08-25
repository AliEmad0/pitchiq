import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import { chaosDraft, type PoolCard } from "@/features/game/domain/chaos-draft";
import { BASE_SEASON } from "@/features/game/domain/market-index";
import type { PoolSpec } from "@/features/game/domain/rule-packs";

const CAP = 100_000_000;
const SPEC: PoolSpec = { kind: "pricedMarket", cap: 600, baseSeason: BASE_SEASON };
const ids = (xi: readonly { cardId: string }[] | undefined) => (xi ?? []).map((c) => c.cardId);
const cost = (xi: readonly PoolCard[]) => xi.reduce((a, c) => a + (c.costEur ?? 0), 0);

// Real committed data and real prices — a synthetic pool cannot show whether the policy
// stays inside a cap that only bites against genuine market values.
describe("budget rival", () => {
  it("fields a full XI inside the cap, on every seed", async () => {
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    for (const seed of [1, 2, 3, 7, 99, 12_345]) {
      const team = chaosDraft(pool, seed, "Rival", { policy: "budget", budget: CAP });
      expect(team.players, `seed ${seed}`).toHaveLength(11);
      expect(cost(team.players as PoolCard[]), `seed ${seed}`).toBeLessThanOrEqual(CAP);
    }
  }, 300_000);

  it("is not the same XI every time — a fixed best XI is the same match forever", async () => {
    // ⚠️ The reason this policy draws rng at all. `best` would field one immutable side, which
    // is exactly why `strong` exists for the Legacy rival.
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const a = chaosDraft(pool, 1, "Rival", { policy: "budget", budget: CAP });
    const b = chaosDraft(pool, 2, "Rival", { policy: "budget", budget: CAP });
    expect(ids(a.players)).not.toEqual(ids(b.players));
  }, 300_000);

  it("replays byte-for-byte from the same seed", async () => {
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const a = chaosDraft(pool, 42, "Rival", { policy: "budget", budget: CAP });
    const b = chaosDraft(pool, 42, "Rival", { policy: "budget", budget: CAP });
    expect(ids(a.players)).toEqual(ids(b.players));
    expect(ids(a.bench)).toEqual(ids(b.bench));
  }, 300_000);

  it("is competitive — it does not bargain-hunt itself into a weak XI", async () => {
    // ⛔ The whole point of the policy. The coach's optimum at EUR 100M measures mean 80.8;
    // a rival far below that re-creates the 2026-08-19 balance defect from the other side.
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const team = chaosDraft(pool, 5, "Rival", { policy: "budget", budget: CAP });
    const mean = team.players.reduce((a, p) => a + (p.ratings?.overall ?? 0), 0) / 11;
    expect(mean).toBeGreaterThan(74);
  }, 300_000);

  it("spends MORE when given more — the cap is what binds it, not the pool", async () => {
    // ⭐ The control. Without it "inside the cap" would stay green for a policy that simply
    // always drafted the eleven cheapest cards and ignored the budget entirely.
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const poor = chaosDraft(pool, 8, "Rival", { policy: "budget", budget: 50_000_000 });
    const rich = chaosDraft(pool, 8, "Rival", { policy: "budget", budget: 400_000_000 });
    expect(cost(rich.players as PoolCard[])).toBeGreaterThan(cost(poor.players as PoolCard[]));
  }, 300_000);
});
