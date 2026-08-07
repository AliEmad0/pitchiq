import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rateGk } from "@/features/game/domain/rating-gk";
import { makeRatingContext } from "@/features/game/domain/ratings";

const gk = (id: number, over: Record<string, unknown> = {}): Player =>
  ({
    id,
    name: `GK${id}`,
    teamId: 1,
    teamName: "T",
    position: "Goalkeeper",
    role: "GK",
    metrics: {
      appearances: 38,
      goals: 0,
      assists: 0,
      passAccuracy: 55,
      cleanSheets: 10,
      saves: 120,
      duelsWon: 9,
      yellowCards: 1,
      redCards: 0,
      extended: {
        minutesPlayed: 3420,
        goalsConceded: 50,
        goalsConcededOutsideBox: 5,
        penaltyGoalsConceded: 3,
        successfulLongPasses: 250,
        clearances: 15,
      },
      ...over,
    },
  }) as unknown as Player;

const best = gk(2, {
  saves: 160,
  cleanSheets: 16,
  extended: {
    minutesPlayed: 3420,
    goalsConceded: 25,
    goalsConcededOutsideBox: 1,
    penaltyGoalsConceded: 1,
    successfulLongPasses: 300,
    clearances: 20,
  },
});
const worst = gk(3, {
  saves: 90,
  cleanSheets: 5,
  extended: {
    minutesPlayed: 3420,
    goalsConceded: 70,
    goalsConcededOutsideBox: 9,
    penaltyGoalsConceded: 5,
    successfulLongPasses: 180,
    clearances: 10,
  },
});

const modern = [gk(1), best, worst, gk(4), gk(5), gk(6), gk(7), gk(8)];
const ctx = makeRatingContext(2019, modern, []);

describe("rateGk", () => {
  it("never gives a goalkeeper a high attack — the Van der Sar defect", () => {
    for (const k of modern) expect(rateGk(k, ctx).attack).toBeLessThan(20);
  });

  it("rates the best shot-stopper above the worst", () => {
    expect(rateGk(best, ctx).gk?.reflexes ?? 0).toBeGreaterThan(
      rateGk(worst, ctx).gk?.reflexes ?? 0,
    );
  });

  it("puts real goalkeeper quality into `defense` so the match engine can use it", () => {
    expect(rateGk(best, ctx).defense).toBeGreaterThan(rateGk(worst, ctx).defense);
  });

  it("returns null reflexes rather than a fabricated number when saves are absent", () => {
    const preSaves = [
      gk(9, { saves: null, extended: { minutesPlayed: 3420, goalsConceded: 40 } }),
      gk(10, { saves: null, extended: { minutesPlayed: 3420, goalsConceded: 30 } }),
    ];
    const oldCtx = makeRatingContext(1996, preSaves, []);
    expect(rateGk(preSaves[0], oldCtx).gk?.reflexes).toBeNull();
  });

  it("still produces a usable handling number from clean sheets alone", () => {
    const preSaves = [
      gk(9, { saves: null, cleanSheets: 20, extended: { minutesPlayed: 3420 } }),
      gk(10, { saves: null, cleanSheets: 2, extended: { minutesPlayed: 3420 } }),
    ];
    const oldCtx = makeRatingContext(1996, preSaves, []);
    expect(rateGk(preSaves[0], oldCtx).gk?.handling ?? 0).toBeGreaterThan(
      rateGk(preSaves[1], oldCtx).gk?.handling ?? 0,
    );
  });

  it("attaches all five goalkeeper dimensions", () => {
    const r = rateGk(best, ctx);
    expect(Object.keys(r.gk ?? {})).toEqual([
      "reflexes",
      "handling",
      "kicking",
      "positioning",
      "command",
    ]);
  });

  it("clamps every engine-facing dimension into 0-100", () => {
    for (const k of modern) {
      const r = rateGk(k, ctx);
      for (const v of [r.attack, r.creation, r.defense, r.physical, r.discipline, r.overall]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
