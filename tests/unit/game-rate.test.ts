import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rate } from "@/features/game/domain/rate";
import { makeRatingContext } from "@/features/game/domain/ratings";

const mk = (id: number, role: string, extra: Record<string, unknown> = {}): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: 1,
    teamName: "T",
    position: "Midfielder",
    role,
    metrics: { appearances: 38, goals: 5, assists: 5, yellowCards: 1, redCards: 0, ...extra },
  }) as unknown as Player;

const rich = { passAccuracy: 85, extended: { minutesPlayed: 3420, goalsConceded: 40 } };

describe("rate", () => {
  it("routes a goalkeeper to the GK pipeline and attaches the gk block", () => {
    const cohort = [mk(1, "GK", { ...rich, saves: 100, cleanSheets: 10 }), mk(2, "CF", rich)];
    const ctx = makeRatingContext(2019, cohort, []);
    const result = rate(cohort[0], ctx);
    expect(result.ratings.gk).toBeDefined();
    expect(result.ratings.attack).toBeLessThan(20);
  });

  it("does not attach a gk block to an outfielder", () => {
    const cohort = [mk(1, "GK", rich), mk(2, "CF", rich)];
    const ctx = makeRatingContext(2019, cohort, []);
    expect(rate(cohort[1], ctx).ratings.gk).toBeUndefined();
  });

  it("detects the era from the data, not from a year constant", () => {
    const richCohort = [mk(1, "CF", rich)];
    expect(rate(richCohort[0], makeRatingContext(2019, richCohort, [])).provenance.tier).toBe(
      "rich",
    );
    const sparseCohort = [mk(1, "CF")];
    expect(rate(sparseCohort[0], makeRatingContext(1996, sparseCohort, [])).provenance.tier).toBe(
      "sparse",
    );
  });

  it("reports hasXg so a 2003-16 card stays honest", () => {
    const withXg = [mk(1, "CF", { ...rich, xg: 12.4 })];
    expect(rate(withXg[0], makeRatingContext(2019, withXg, [])).provenance.basis.hasXg).toBe(true);
    const noXg = [mk(1, "CF", rich)];
    expect(rate(noXg[0], makeRatingContext(2010, noXg, [])).provenance.basis.hasXg).toBe(false);
  });

  it("reports hasSaves so a keeper card can be honest about its grade", () => {
    const modern = [mk(1, "GK", { ...rich, saves: 100 })];
    expect(rate(modern[0], makeRatingContext(2019, modern, [])).provenance.basis.hasSaves).toBe(
      true,
    );
    const old = [mk(1, "GK", rich)];
    expect(rate(old[0], makeRatingContext(2004, old, [])).provenance.basis.hasSaves).toBe(false);
  });

  it("carries the season through on provenance", () => {
    const cohort = [mk(1, "CF", rich)];
    expect(rate(cohort[0], makeRatingContext(2012, cohort, [])).provenance.season).toBe(2012);
  });
});
