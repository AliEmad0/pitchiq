import { describe, expect, it } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import type { TacticalStyle } from "@/features/game/domain/opponent";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import {
  scoutedStyle,
  STYLES,
  styleTendency,
  TENDENCY_P,
} from "@/features/game/domain/style-scouting";

/**
 * TASK-1825 (owner, 2026-10-20: "Scouting report"). The styles are a 5-cycle with Balanced
 * neutral, so a blind pick against a uniform draw is a coin flip. Each opponent instead has a
 * TENDENCY read from its own XI, played 6 times in 10 — so reading the opponent is the skill.
 */
type P = { role: string; ratings: PlayerRatings };
const r = (attack: number, creation: number, defense: number, physical: number): PlayerRatings => ({
  attack,
  creation,
  defense,
  physical,
  discipline: 50,
  overall: Math.round((attack + creation + defense + physical) / 4),
});
const xi = (rt: PlayerRatings): P[] => [
  { role: "GK", ratings: r(10, 10, 90, 50) },
  ...Array.from({ length: 10 }, () => ({ role: "CM", ratings: rt })),
];

describe("styleTendency", () => {
  it("every style is the tendency of some real club-season, none dominates", async () => {
    const tally = new Map<TacticalStyle, number>();
    let n = 0;
    for (let season = 1992; season <= 2025; season++) {
      const d = await loadClassicData(season);
      for (const club of d?.squads ?? []) {
        const t = styleTendency(club.pool);
        tally.set(t, (tally.get(t) ?? 0) + 1);
        n++;
      }
    }
    expect(n).toBe(686);
    for (const s of STYLES) {
      const share = (tally.get(s) ?? 0) / n;
      expect(share, `${s} ${(share * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.03);
      expect(share, `${s} ${(share * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.45);
    }
  }, 240_000);

  it("reads shape, not strength", () => {
    const shapes = [r(62, 50, 44, 50), r(48, 64, 46, 47), r(45, 47, 60, 46), r(52, 46, 47, 62)];
    for (const s of shapes) {
      const up = r(
        Math.min(99, s.attack + 15),
        Math.min(99, s.creation + 15),
        Math.min(99, s.defense + 15),
        Math.min(99, s.physical + 15),
      );
      expect(styleTendency(xi(up))).toBe(styleTendency(xi(s)));
    }
  });

  it("ignores the goalkeeper", () => {
    const team = xi(r(48, 64, 46, 47));
    const otherKeeper = [{ role: "GK", ratings: r(90, 90, 10, 10) }, ...team.slice(1)];
    expect(styleTendency(otherKeeper)).toBe(styleTendency(team));
  });
});

describe("scoutedStyle", () => {
  it("plays the tendency 6 times in 10 and each other style 8 in 100", () => {
    const team = xi(r(48, 64, 46, 47));
    const t = styleTendency(team);
    const tally = new Map<TacticalStyle, number>();
    const N = 20_000;
    for (let seed = 1; seed <= N; seed++) {
      const s = scoutedStyle(team, seed);
      tally.set(s, (tally.get(s) ?? 0) + 1);
    }
    expect(TENDENCY_P).toBe(0.6);
    expect((tally.get(t) ?? 0) / N).toBeGreaterThanOrEqual(0.585);
    expect((tally.get(t) ?? 0) / N).toBeLessThanOrEqual(0.615);
    for (const s of STYLES.filter((x) => x !== t)) {
      expect((tally.get(s) ?? 0) / N, s).toBeGreaterThanOrEqual(0.07);
      expect((tally.get(s) ?? 0) / N, s).toBeLessThanOrEqual(0.09);
    }
  });

  it("is deterministic", () => {
    const team = xi(r(62, 50, 44, 50));
    for (let seed = 1; seed < 50; seed++)
      expect(scoutedStyle(team, seed)).toBe(scoutedStyle(team, seed));
  });
});
