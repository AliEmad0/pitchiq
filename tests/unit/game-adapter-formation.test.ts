import { describe, expect, it } from "vitest";
import type { TeamLineupRaw } from "@/data/schemas";
import {
  formationFromLineup,
  mineFormationTemplates,
} from "@/features/game/adapter/formation";

const lineup: TeamLineupRaw = {
  teamId: 52,
  formation: "4-4-2",
  startXI: [
    { id: 1, name: "GK", number: 1, pos: "Goalkeeper", grid: "1:1" },
    { id: 2, name: "D1", number: 2, pos: "Defender", grid: "2:1" },
    { id: 3, name: "F1", number: 9, pos: "Attacker", grid: "4:1" },
    { id: 4, name: "Bench", number: 12, pos: null, grid: null },
  ],
  substitutes: [],
} as unknown as TeamLineupRaw;

describe("formationFromLineup", () => {
  it("builds a Formation from a real lineup, skipping bench players", () => {
    const f = formationFromLineup(lineup, 2020);
    expect(f.name).toBe("4-4-2");
    expect(f.season).toBe(2020);
    expect(f.slots).toHaveLength(3); // bench (null grid) excluded
    expect(f.slots[0]).toEqual({ row: 1, col: 1, role: "GK" });
  });

  it("maps coarse pos to a game role", () => {
    const f = formationFromLineup(lineup, 2020);
    const roles = f.slots.map((s) => s.role);
    expect(roles).toContain("GK");
    expect(roles).toContain("CB"); // Defender → CB
    expect(roles).toContain("CF"); // Attacker → CF
  });
});

describe("mineFormationTemplates", () => {
  it("keeps one representative per formationKey", () => {
    const templates = mineFormationTemplates([lineup, lineup], 2020);
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("4-4-2");
  });
});
