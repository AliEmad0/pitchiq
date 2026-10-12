import { describe, expect, it } from "vitest";
import { soloLeagueId } from "@/features/game/view/season-league";

/**
 * A league id for a side that is not a Premier League club (owner, 2026-10-12: every mode
 * gets a season). It is also the identity a saved season resumes by, so all three properties
 * below are load-bearing.
 */
describe("soloLeagueId", () => {
  it("is NEGATIVE, so it can never collide with a real club id", () => {
    for (const key of ["h2h", "chaos", "budget", "chemistry", "captains:1000457", "nation:eg"]) {
      expect(soloLeagueId(key)).toBeLessThan(0);
      expect(Number.isInteger(soloLeagueId(key))).toBe(true);
    }
  });

  it("is STABLE — a reload must name the same side", () => {
    expect(soloLeagueId("nation:eg")).toBe(soloLeagueId("nation:eg"));
  });

  it("⛔ is DISTINCT per mode — draft and chaos share a pool, so only this tells them apart", () => {
    const keys = ["h2h", "chaos", "budget", "chemistry", "captains:1", "captains:2", "nation:eg"];
    expect(new Set(keys.map(soloLeagueId)).size).toBe(keys.length);
  });
});
