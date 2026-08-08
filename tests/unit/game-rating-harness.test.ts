import { beforeAll, describe, expect, it } from "vitest";
import { MAX_DELTA } from "@/features/game/domain/rating-anchor";
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

describe("harness — TASK-1821 anchoring is bounded by construction", () => {
  it("keeps EVERY anchored season inside its ±6 window", () => {
    // The property the whole three-layer design rests on: a rating is an anchor plus a
    // small delta, so the worst possible bug in the delta moves a player six points,
    // not thirty. PR #99's unbounded per-role amplifier is the failure this forbids.
    const anchored = rows.filter((r) => r.anchor != null);
    expect(anchored.length).toBeGreaterThan(1000);
    const escaped = anchored
      .filter((r) => Math.abs(r.overall - (r.anchor as number)) > MAX_DELTA)
      .map((r) => `${r.name} ${r.season} ovr=${r.overall} anchor=${r.anchor}`);
    expect(escaped).toEqual([]);
  });

  it("does not pile the anchored population up on the edges of the window", () => {
    // THE DEGENERACY GATE. Bounding the delta is not enough on its own — a delta that
    // saturates is bounded and useless. Reading the spec literally as
    // `clamp(modelOverall - anchor, ±6)` puts 63% of anchored seasons on exactly
    // `anchor - 6`, because the two numbers are on different scales (raw gap: median
    // -10, 67% outside the window). The relative delta shipped here leaves 0% on the
    // floor and 82% in the interior.
    //
    // Every OTHER assertion in this file passes under that degenerate implementation —
    // including a "seasons of one career still differ" test that looked discriminating
    // and was not. This is the one that separates them, so do not weaken it.
    const anchored = rows.filter((r) => r.anchor != null);
    const deltas = anchored.map((r) => r.overall - (r.anchor as number));
    const onEdge = (sign: number) =>
      deltas.filter((d) => d * sign >= MAX_DELTA).length / deltas.length;
    const interior = deltas.filter((d) => Math.abs(d) < MAX_DELTA).length / deltas.length;

    expect(onEdge(-1)).toBeLessThan(0.25);
    expect(onEdge(1)).toBeLessThan(0.25);
    expect(interior).toBeGreaterThan(0.6);
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
