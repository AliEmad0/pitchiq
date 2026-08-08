import { beforeAll, describe, expect, it } from "vitest";
import {
  MIN_COHORT,
  type RatedRow,
  type RoleStat,
  findRow,
  rateAllSeasons,
  roleStats,
} from "./_helpers/rating-harness";

/**
 * The rating model's hard gate. Any change to the model must pass this.
 *
 * WHY IT EXISTS: TASK-1820's per-position normalisation shipped fully green. It was
 * validated against ~10 named players and two aggregate statistics, while the real
 * defect — a per-role amplifier ranging 1.0x to 5.0x — surfaced only as implausible
 * NAMES scattered across roles and eras (Barry '11 at 96, Campbell '04 at 67). Every
 * assertion below either sweeps ALL roles and eras or pins an anomaly that actually
 * shipped, so the same class of failure cannot pass twice.
 *
 * These are STABILITY bounds, not historical-accuracy bounds. Getting legends into
 * their rightful range is the anchor system's job; this file's job is to guarantee no
 * change can destabilise the scale while doing it.
 */

/** Minimum cohort for a season-over-season stability claim (see that test). */
const STABLE_COHORT = 12;

let rows: RatedRow[];
let stats: RoleStat[];

beforeAll(async () => {
  rows = await rateAllSeasons();
  stats = roleStats(rows);
}, 120_000);

describe("harness — coverage", () => {
  it("sweeps every committed season and a full set of roles", () => {
    const seasons = new Set(rows.map((r) => r.season));
    const roles = new Set(rows.map((r) => r.role));
    expect(seasons.size).toBeGreaterThanOrEqual(30);
    expect(roles.size).toBeGreaterThanOrEqual(12);
    expect(rows.length).toBeGreaterThan(8000);
  });
});

describe("harness — bounds", () => {
  it("keeps every rating inside 0-100", () => {
    for (const r of rows) {
      for (const v of [r.overall, r.attack, r.creation, r.defense, r.physical]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("never saturates the top of the scale", () => {
    // A model that pushes players to 96+ has stopped discriminating. Under the
    // reverted normalisation four players sat on exactly 100.
    const at96 = rows.filter((r) => r.overall >= 96);
    expect(at96).toHaveLength(0);
    const at93 = rows.filter((r) => r.overall >= 93).length;
    expect(at93 / rows.length).toBeLessThan(0.01);
  });
});

describe("harness — per-role stability across every era", () => {
  it("keeps every role-season cohort inside a sane band", () => {
    const bad = stats.filter((s) => s.median < 25 || s.median > 90 || s.max > 95);
    expect(bad.map((s) => `${s.season} ${s.role} med=${s.median} max=${s.max}`)).toEqual([]);
  });

  it("does not let a role's median lurch between consecutive seasons", () => {
    // The normalisation's per-role divisor made cohorts swing violently from one
    // season to the next — the clearest fingerprint of an unstable scale, and it hit
    // LARGE cohorts too (CM n=55 amplified 2.4x, CDM n=32 at 2.3x).
    //
    // Judged only on cohorts of 12+. A median over 8-10 players is inherently noisy:
    // LW fielded 8-10 players a season around 2000 and legitimately swung 27 points
    // between two weak and strong years. At 12+ the league has zero lurches.
    const byRole = new Map<string, RoleStat[]>();
    for (const s of stats) {
      if (s.count < STABLE_COHORT) continue;
      const list = byRole.get(s.role) ?? [];
      list.push(s);
      byRole.set(s.role, list);
    }
    const lurches: string[] = [];
    for (const [role, list] of byRole) {
      const ordered = [...list].sort((a, b) => a.season - b.season);
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1];
        const cur = ordered[i];
        if (cur.season !== prev.season + 1) continue;
        const jump = Math.abs(cur.median - prev.median);
        if (jump > 25) lurches.push(`${role} ${prev.season}->${cur.season} ${jump}`);
      }
    }
    expect(lurches).toEqual([]);
  });

  it("reports a cohort size for every judged role-season", () => {
    for (const s of stats) expect(s.count).toBeGreaterThanOrEqual(MIN_COHORT);
  });
});

describe("harness — anomalies that actually shipped", () => {
  const at = (season: number, name: string) => {
    const row = findRow(rows, season, name);
    if (!row) throw new Error(`harness fixture missing: ${name} ${season}`);
    return row;
  };

  it("does not inflate squad midfielders and full-backs into the 90s", () => {
    // All three hit 90+ under per-position normalisation.
    expect(at(2011, "Gareth Barry").overall).toBeLessThan(90);
    expect(at(2023, "Ben White").overall).toBeLessThan(90);
    expect(at(1996, "Gary Neville").overall).toBeLessThan(88);
  });

  it("ranks a prolific starter above a rotation attacker", () => {
    // Benayoun (1,890') outranked Rooney (2,264') on per-90 rates alone.
    expect(at(2008, "Wayne Rooney").overall).toBeGreaterThan(at(2008, "Yossi Benayoun").overall);
  });

  it("keeps goalkeepers out of the outfield dimensions", () => {
    for (const r of rows.filter((x) => x.role === "GK")) expect(r.attack).toBeLessThan(20);
  });

  it("does not credit forwards with defensive work", () => {
    expect(at(2007, "Cristiano Ronaldo").defense).toBeLessThan(50);
    expect(at(2018, "Mohamed Salah").defense).toBeLessThan(15);
  });

  it("rates a dominant centre-back's defending highly", () => {
    expect(at(2018, "Virgil van Dijk").defense).toBeGreaterThan(80);
  });
});
