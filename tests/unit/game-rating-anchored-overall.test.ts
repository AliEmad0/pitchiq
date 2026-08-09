import { describe, expect, it } from "vitest";
import type { Player, Standing } from "@/data/schemas";
import {
  MAX_BOOST,
  SCALE_CEILING,
  amplifyUnanchored,
} from "@/features/game/domain/rating-achievement";
import { MAX_DELTA, anchorOf } from "@/features/game/domain/rating-anchor";
import { rate } from "@/features/game/domain/rate";
import { rateOutfield } from "@/features/game/domain/rating-outfield";
import { makeRatingContext } from "@/features/game/domain/ratings";

/**
 * TASK-1821 Layers 2 + 3 wiring — an anchored player's `overall` is their heritage
 * anchor plus a bounded season delta, an un-anchored player gets the clamped role
 * amplifier, and both then take the team-achievement boost under a hard ceiling.
 *
 * Ids are REAL and come from the committed anchor file, because a made-up id silently
 * resolves to "un-anchored" and the test would pass while proving nothing. (A curated
 * tier list in this ticket already shipped 17 fabricated ids that each resolved to a
 * different obscure player.)
 *
 * Anchor VALUES are read via `anchorOf` rather than hardcoded — Layer 3 rebased every
 * tier base by −3, which silently invalidated the literals that were here.
 */

const ANCHORED = 1003185; // Alan Shearer — curated `icon`
const ANCHORED_PEER = 1002939; // curated `legend`
const UNANCHORED = 999_999_999;

const ext = (over: Record<string, number> = {}) => ({
  minutesPlayed: 3420,
  duelsLost: 40,
  groundDuelsWon: 30,
  groundDuelsLost: 20,
  tacklesWon: 12,
  clearances: 100,
  blocks: 10,
  goalsConceded: 40,
  foulsWon: 20,
  foulsConceded: 20,
  ...over,
});

const mk = (id: number, role: string, over: Record<string, unknown> = {}): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: 1,
    teamName: "T",
    position: "Forward",
    role,
    metrics: {
      appearances: 38,
      goals: 8,
      assists: 4,
      tackles: 20,
      interceptions: 20,
      duelsWon: 60,
      passAccuracy: 80,
      keyPasses: 5,
      shotsOnTarget: 20,
      yellowCards: 2,
      redCards: 0,
      extended: ext(),
      ...over,
    },
  }) as unknown as Player;

/** A CF cohort in 1994: one prolific anchored player, one poor anchored peer, plus filler. */
const prolific = mk(ANCHORED, "CF", { goals: 34, assists: 12, shotsOnTarget: 80 });
const poor = mk(ANCHORED_PEER, "CF", { goals: 1, assists: 0, shotsOnTarget: 4 });
const cohort = [
  prolific,
  poor,
  mk(UNANCHORED, "CF", { goals: 12, shotsOnTarget: 30 }),
  mk(701, "CF", { goals: 9, shotsOnTarget: 24 }),
  mk(702, "CF", { goals: 6, shotsOnTarget: 18 }),
  mk(703, "CF", { goals: 3, shotsOnTarget: 10 }),
  mk(704, "CB"),
  mk(705, "CM"),
];
const ctx = makeRatingContext(1994, cohort, []);

describe("rate — Layer 2/3 anchoring", () => {
  it("puts every anchored player inside ±6 of their heritage anchor", () => {
    // Both ends deliberately: the prolific season's RAW overall already lands within 6
    // of its anchor by coincidence, so asserting on it alone would pass unwired. The
    // poor season is the discriminating case — raw it rates far below its anchor.
    for (const [player, id] of [
      [prolific, ANCHORED],
      [poor, ANCHORED_PEER],
    ] as const) {
      const anchor = anchorOf(id, 1994) as number;
      expect(anchor).toBeGreaterThan(0);
      expect(Math.abs(rate(player, ctx).ratings.overall - anchor)).toBeLessThanOrEqual(MAX_DELTA);
    }
  });

  it("rewards the best season in the role cohort with a positive delta", () => {
    expect(rate(prolific, ctx).ratings.overall).toBeGreaterThan(anchorOf(ANCHORED, 1994) as number);
  });

  it("pushes the worst season in the role cohort below its anchor", () => {
    expect(rate(poor, ctx).ratings.overall).toBeLessThan(anchorOf(ANCHORED_PEER, 1994) as number);
  });

  it("keeps a weak legend above a strong lesser player — the anchor dominates", () => {
    // The whole point of anchoring: form moves a player a few points, heritage decides
    // the tier. Shearer's worst season must still out-rank a good un-anchored striker.
    expect(rate(poor, ctx).ratings.overall).toBeGreaterThan(rate(cohort[2], ctx).ratings.overall);
  });

  it("puts an un-anchored player on the role-amplified statistical model", () => {
    // Layer 3 changed this deliberately: un-anchored players used to pass through
    // untouched, and now carry the clamped role correction. CF is compressed (0.809),
    // because the league-wide dimensions flatter forwards.
    const raw = rateOutfield(cohort[2], ctx).overall;
    const got = rate(cohort[2], ctx).ratings.overall;
    expect(got).toBe(Math.round(amplifyUnanchored(raw, "CF")));
    expect(got).toBeLessThan(raw);
  });

  it("does not disturb the four dimensions — only `overall` is anchored", () => {
    const r = rate(prolific, ctx).ratings;
    const raw = rateOutfield(prolific, ctx);
    expect([r.attack, r.creation, r.defense, r.physical]).toEqual([
      raw.attack,
      raw.creation,
      raw.defense,
      raw.physical,
    ]);
  });

  it("adds the team-achievement boost on top of the anchored window", () => {
    const standings: Standing[] = [
      {
        rank: 1,
        teamId: 1,
        teamName: "T",
        played: 38,
        won: 30,
        drawn: 5,
        lost: 3,
        goalsFor: 90,
        goalsAgainst: 30,
        goalsDiff: 60,
        points: 95,
      },
    ] as unknown as Standing[];
    const champCtx = makeRatingContext(1994, cohort, standings);
    const withTitle = rate(prolific, champCtx).ratings.overall;
    const withoutTitle = rate(prolific, ctx).ratings.overall;
    expect(withTitle).toBeGreaterThan(withoutTitle);
    expect(withTitle - withoutTitle).toBeLessThanOrEqual(MAX_BOOST);
  });

  it("never lets the boost push anyone past the scale ceiling", () => {
    const standings: Standing[] = [
      {
        rank: 1,
        teamId: 1,
        teamName: "T",
        played: 38,
        won: 30,
        drawn: 5,
        lost: 3,
        goalsFor: 90,
        goalsAgainst: 30,
        goalsDiff: 60,
        points: 95,
      },
    ] as unknown as Standing[];
    const champCtx = makeRatingContext(1994, cohort, standings);
    for (const p of cohort) {
      expect(rate(p, champCtx).ratings.overall).toBeLessThanOrEqual(SCALE_CEILING);
    }
  });

  it("shrinks the delta for an anchored cameo season", () => {
    const cameo = mk(ANCHORED, "CF", {
      goals: 34,
      assists: 12,
      shotsOnTarget: 80,
      extended: ext({ minutesPlayed: 400 }),
    });
    const cameoCtx = makeRatingContext(1994, [...cohort, cameo], []);
    const full = rate(prolific, cameoCtx).ratings.overall;
    const short = rate(cameo, cameoCtx).ratings.overall;
    expect(short).toBeLessThan(full);
    // Read the anchor rather than hardcoding it — Layer 3 rebased every tier by −3.
    expect(Math.abs(short - (anchorOf(ANCHORED, 1994) as number))).toBeLessThan(2);
  });
});
