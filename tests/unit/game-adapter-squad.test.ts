import { describe, expect, it } from "vitest";
import { loadGameSquad } from "@/features/game/adapter/squad";

describe("loadGameSquad (committed 2003 data)", () => {
  it("returns a team's player-season cards", async () => {
    // Leeds United teamId 63 appears in players-2003.json.
    const squad = await loadGameSquad(63, 2003);
    expect(squad).not.toBeNull();
    expect(squad!.length).toBeGreaterThan(0);
    for (const card of squad!) {
      expect(card.season).toBe(2003);
      expect(card.cardId.endsWith("@2003")).toBe(true);
    }
    expect(squad!.some((c) => c.name === "Aaron Lennon")).toBe(true);
  });

  it("returns [] for a team with no rows that season", async () => {
    const squad = await loadGameSquad(999999, 2003);
    expect(squad).toEqual([]);
  });

  it("returns null for an unsupported season", async () => {
    const squad = await loadGameSquad(63, 1800);
    expect(squad).toBeNull();
  });
});
