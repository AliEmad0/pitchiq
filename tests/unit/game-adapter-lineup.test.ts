import { describe, expect, it } from "vitest";
import { assembleGameTeam } from "@/features/game/adapter/lineup";

describe("assembleGameTeam (committed data)", () => {
  it("assembles an 11-player team aligned to its formation", async () => {
    const team = await assembleGameTeam(42, 2020); // Arsenal 2020
    expect(team).not.toBeNull();
    expect(team!.players).toHaveLength(11);
    expect(team!.formation.slots).toHaveLength(11);
    expect(team!.players.every((p) => p.ratings != null)).toBe(true);
    expect(team!.name.length).toBeGreaterThan(0);
  });

  it("returns null for a team absent that season", async () => {
    expect(await assembleGameTeam(999999, 2020)).toBeNull();
  });
});
