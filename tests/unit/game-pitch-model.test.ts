import { describe, expect, it } from "vitest";
import type { FormationSlot } from "@/features/game/domain/formation";
import { assignNumbers, laneOfSlot, shortName } from "@/features/game/view/pitch-model";

const F442: FormationSlot[] = [
  { row: 1, col: 1, role: "GK" },
  { row: 2, col: 1, role: "LB" },
  { row: 2, col: 2, role: "CB" },
  { row: 2, col: 3, role: "CB" },
  { row: 2, col: 4, role: "RB" },
  { row: 3, col: 1, role: "LM" },
  { row: 3, col: 2, role: "CM" },
  { row: 3, col: 3, role: "CM" },
  { row: 3, col: 4, role: "RM" },
  { row: 4, col: 1, role: "CF" },
  { row: 4, col: 2, role: "CF" },
];

const withSeeds = (offset: number) =>
  F442.map((s, i) => ({ role: s.role, seed: (i + 1) * 7 + offset }));

describe("assignNumbers", () => {
  const nums = assignNumbers(withSeeds(0));
  it("gives the goalkeeper number 1", () => {
    expect(nums[0]).toBe(1);
  });
  it("produces 11 distinct numbers", () => {
    expect(new Set(nums).size).toBe(nums.length);
  });
  it("stays within a realistic 1..99 range", () => {
    expect(nums.every((n) => n >= 1 && n <= 99)).toBe(true);
  });
  it("varies numbers by identity so two teams are not symmetric", () => {
    const other = assignNumbers(withSeeds(3));
    expect(nums).not.toEqual(other);
  });
});

describe("shortName", () => {
  it("takes the surname", () => {
    expect(shortName("James Ward-Prowse")).toBe("Ward-Prowse");
    expect(shortName("Heung-Min Son")).toBe("Son");
  });
  it("returns a single-token name as-is", () => {
    expect(shortName("Ronaldinho")).toBe("Ronaldinho");
  });
  it("tolerates messy whitespace", () => {
    expect(shortName("  Thierry   Henry  ")).toBe("Henry");
  });
});

describe("laneOfSlot", () => {
  it("classifies the ends and middle of a back four", () => {
    expect(laneOfSlot(1, F442)).toBe("left"); // LB, col 1
    expect(laneOfSlot(4, F442)).toBe("right"); // RB, col 4
  });
  it("treats a single-occupant row as central", () => {
    expect(laneOfSlot(0, F442)).toBe("center"); // lone GK
  });
});
