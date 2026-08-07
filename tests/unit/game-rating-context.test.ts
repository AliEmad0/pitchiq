import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { makeRatingContext } from "@/features/game/domain/ratings";

const mk = (id: number, role: string, minutes: number, goals: number): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: 1,
    teamName: "T",
    position: "Midfielder",
    role,
    metrics: { appearances: 30, goals, extended: { minutesPlayed: minutes } },
  }) as unknown as Player;

describe("makeRatingContext", () => {
  it("builds the outfield and goalkeeper pools separately", () => {
    const cohort = [mk(1, "CF", 3000, 20), mk(2, "GK", 3000, 0), mk(3, "CB", 3000, 2)];
    const ctx = makeRatingContext(2019, cohort, []);
    // Goalkeepers must never enter an outfield pool — the Van der Sar defect.
    expect(ctx.pools.outfield.goals90).toHaveLength(2);
    expect(ctx.pools.gk.cleanSheetRate).toBeDefined();
  });

  it("keeps goalkeepers out of the outfield pool even when they dominate a stat", () => {
    const cohort = [mk(1, "GK", 3000, 0), mk(2, "GK", 3000, 0), mk(3, "CF", 3000, 1)];
    const ctx = makeRatingContext(2019, cohort, []);
    expect(ctx.pools.outfield.goals90).toHaveLength(1);
  });

  it("keeps season and standings on the context", () => {
    const ctx = makeRatingContext(2019, [], []);
    expect(ctx.season).toBe(2019);
    expect(ctx.standings).toEqual([]);
  });

  it("excludes sub-threshold players from the pools but still keeps the cohort", () => {
    const cohort = [mk(1, "CF", 3000, 20), mk(2, "CF", 100, 1)];
    const ctx = makeRatingContext(2019, cohort, []);
    expect(ctx.pools.outfield.goals90).toHaveLength(1);
    expect(ctx.cohort).toHaveLength(2);
  });
});
