import { describe, it, expect } from "vitest";

import { seasonHighlights } from "../../src/features/managers/managers-highlights";
import type { ManagerIndexRow } from "../../src/features/managers/managers-index.api";

const row = (
  managerId: string,
  name: string,
  o: Partial<ManagerIndexRow["record"]>,
): ManagerIndexRow => ({
  managerId,
  name,
  photo: managerId,
  photoFallback: null,
  nationality: null,
  nationalityCode: null,
  teamId: 1,
  teamName: "Club",
  teamLogo: "/logos/1.png",
  record: {
    played: 38,
    win: 0,
    draw: 0,
    loss: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    ppg: 0,
    winPct: 0,
    ...o,
  },
});

describe("seasonHighlights", () => {
  it("picks the leaders in points, wins, win% and PPG", () => {
    const rows = [
      row("1", "Arteta", { played: 38, win: 26, points: 85, ppg: 2.24, winPct: 68 }),
      row("2", "Guardiola", { played: 38, win: 23, points: 78, ppg: 2.05, winPct: 61 }),
    ];
    const h = seasonHighlights(rows);
    expect(h.mostPoints?.name).toBe("Arteta");
    expect(h.mostWins?.name).toBe("Arteta");
    expect(h.bestWinPct?.name).toBe("Arteta");
    expect(h.bestPpg?.name).toBe("Arteta");
  });

  it("excludes sub-half-season managers from the rate stats but not from points", () => {
    const rows = [
      row("1", "Regular", { played: 38, win: 20, points: 65, ppg: 1.71, winPct: 53 }),
      // A 17-game interim on a hot run (the real Carrick case) — must NOT top
      // win%/PPG over a full-season manager.
      row("2", "Interim", { played: 17, win: 12, points: 39, ppg: 2.29, winPct: 71 }),
    ];
    const h = seasonHighlights(rows);
    expect(h.bestPpg?.name).toBe("Regular");
    expect(h.bestWinPct?.name).toBe("Regular");
    // Points isn't gated — the interim's 39 is below Regular's 65 anyway.
    expect(h.mostPoints?.name).toBe("Regular");
  });

  it("returns nulls for an empty list", () => {
    expect(seasonHighlights([])).toEqual({
      mostPoints: null,
      mostWins: null,
      bestWinPct: null,
      bestPpg: null,
    });
  });
});
