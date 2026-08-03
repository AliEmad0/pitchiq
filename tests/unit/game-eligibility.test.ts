import { describe, expect, it } from "vitest";
import { canPlay } from "@/features/game/domain/eligibility";
import type { GamePlayer } from "@/features/game/domain/player";

const base: GamePlayer = {
  cardId: "1@2003",
  playerId: 1,
  season: 2003,
  name: "Test Player",
  role: "CB",
  altRoles: ["RB"],
  foot: "right",
  height: 180,
  ratings: null,
  provenance: null,
};

describe("game eligibility (hard ban)", () => {
  it("allows the primary role", () => {
    expect(canPlay(base, "CB")).toBe(true);
  });
  it("allows an alt role", () => {
    expect(canPlay(base, "RB")).toBe(true);
  });
  it("bans an unlisted role", () => {
    expect(canPlay(base, "GK")).toBe(false);
  });
  it("bans when role is null", () => {
    expect(canPlay({ ...base, role: null }, "CB")).toBe(false);
  });
});
