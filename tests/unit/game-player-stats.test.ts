import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import {
  GK_KEYS,
  OUTFIELD_KEYS,
  gkStats,
  outfieldStats,
} from "@/features/game/domain/player-stats";

const p = (metrics: Record<string, unknown>): Player =>
  ({
    id: 1,
    name: "P",
    teamId: 1,
    teamName: "T",
    position: "Defender",
    metrics,
  }) as unknown as Player;

// Van Dijk 2018/19 — real committed numbers, the reference case for this ticket.
const vvd = p({
  appearances: 38,
  goals: 4,
  assists: 2,
  tackles: 38,
  interceptions: 40,
  duelsWon: 175,
  passAccuracy: 89.5,
  keyPasses: 6,
  shotsOnTarget: 8,
  xg: 3.1,
  yellowCards: 1,
  redCards: 0,
  cleanSheets: 20,
  extended: {
    minutesPlayed: 3385,
    duels: 321,
    duelsLost: 76,
    groundDuelsWon: 63,
    groundDuelsLost: 15,
    tacklesWon: 28,
    tacklesLost: 10,
    clearances: 199,
    blocks: 18,
    goalsConceded: 22,
    foulsWon: 22,
    foulsConceded: 12,
  },
});

describe("outfieldStats", () => {
  it("computes duel rate from won + lost, NOT from the duels field", () => {
    // 175 / (175 + 76) = 69.7%. Dividing by `duels` (321) would report 54.5%.
    expect(outfieldStats(vvd).duelPct).toBeCloseTo(69.72, 1);
  });

  it("computes tackle rate as tacklesWon / tackles, since tackles is already won + lost", () => {
    // 28 / 38 = 73.7%. Using tackles/(tackles+tacklesLost) would report 79.2%.
    expect(outfieldStats(vvd).tacklePct).toBeCloseTo(73.68, 1);
  });

  it("computes ground duel rate from its own won + lost", () => {
    expect(outfieldStats(vvd).groundPct).toBeCloseTo(80.77, 1);
  });

  it("inverts on-pitch goals conceded so higher is better", () => {
    // 22 conceded over 3385' -> 0.585 per 90, negated.
    expect(outfieldStats(vvd).gcPrevented90).toBeCloseTo(-0.585, 2);
  });

  it("exposes NO aerial-duel stat — it cannot be derived from this dataset", () => {
    // duelsWon - groundDuelsWon is negative for 16 of 49 qualifying CBs in 2018/19.
    expect(OUTFIELD_KEYS.some((k) => /aerial/i.test(k))).toBe(false);
    expect(Object.keys(outfieldStats(vvd)).some((k) => /aerial/i.test(k))).toBe(false);
  });

  it("returns null rates rather than guesses when extended is absent (pre-2003)", () => {
    const sparse = p({ appearances: 30, goals: 10, assists: 4, yellowCards: 2, redCards: 0 });
    const s = outfieldStats(sparse);
    expect(s.duelPct).toBeNull();
    expect(s.groundPct).toBeNull();
    expect(s.tacklePct).toBeNull();
    expect(s.goals90).toBeCloseTo(0.333, 2);
  });

  it("scores cards for the discipline dimension, weighting a red twice a yellow", () => {
    expect(outfieldStats(p({ appearances: 10, yellowCards: 3, redCards: 1 })).cardScore).toBe(5);
  });
});

describe("gkStats", () => {
  const gk = p({
    appearances: 38,
    passAccuracy: 55.5,
    cleanSheets: 11,
    saves: 140,
    duelsWon: 9,
    yellowCards: 0,
    redCards: 0,
    extended: {
      minutesPlayed: 3420,
      goalsConceded: 58,
      goalsConcededOutsideBox: 4,
      penaltyGoalsConceded: 2,
      successfulLongPasses: 300,
      clearances: 20,
    },
  });

  it("derives save% from saves and goals conceded", () => {
    // 140 / (140 + 58) = 70.7%
    expect(gkStats(gk).savePct).toBeCloseTo(70.71, 1);
  });

  it("is null on savePct for the pre-2008 eras that have no saves field", () => {
    const old = p({
      appearances: 38,
      cleanSheets: 15,
      extended: { minutesPlayed: 3420, goalsConceded: 30 },
    });
    expect(gkStats(old).savePct).toBeNull();
    expect(gkStats(old).cleanSheetRate).toBeCloseTo(0.395, 2);
  });

  it("exposes only goalkeeper keys", () => {
    expect(GK_KEYS).toContain("savePct");
    expect(GK_KEYS).not.toContain("goals90");
  });
});
