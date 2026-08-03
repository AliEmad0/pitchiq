import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { toGamePlayer } from "@/features/game/adapter/player";

const raw: Player = {
  id: 1000003,
  name: "Aaron Lennon",
  role: "RW",
  altRoles: ["RM"],
  foot: "right",
  height: 165,
  roleSource: "enriched",
  metrics: { appearances: 11, assists: 1, cleanSheets: 0, goals: 0 },
} as unknown as Player;

describe("toGamePlayer", () => {
  it("maps M56 fields onto a player-season card", () => {
    const card = toGamePlayer(raw, 2003);
    expect(card.cardId).toBe("1000003@2003");
    expect(card.playerId).toBe(1000003);
    expect(card.season).toBe(2003);
    expect(card.name).toBe("Aaron Lennon");
    expect(card.role).toBe("RW");
    expect(card.altRoles).toEqual(["RM"]);
    expect(card.foot).toBe("right");
    expect(card.height).toBe(165);
  });

  it("leaves ratings/provenance null for TASK-1802 to fill", () => {
    const card = toGamePlayer(raw, 2003);
    expect(card.ratings).toBeNull();
    expect(card.provenance).toBeNull();
  });

  it("defaults missing optional M56 fields safely", () => {
    const sparse = { id: 42, name: "Old Timer" } as unknown as Player;
    const card = toGamePlayer(sparse, 1995);
    expect(card.role).toBeNull();
    expect(card.altRoles).toEqual([]);
    expect(card.foot).toBeNull();
    expect(card.height).toBeNull();
  });
});
