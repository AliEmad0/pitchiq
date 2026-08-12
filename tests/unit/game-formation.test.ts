import { describe, expect, it } from "vitest";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { formationByName, formationKey, parseGrid } from "@/features/game/domain/formation";
import type { Formation } from "@/features/game/domain/formation";

describe("formation helpers", () => {
  it("parses a row:col grid string", () => {
    expect(parseGrid("1:1")).toEqual({ row: 1, col: 1 });
    expect(parseGrid("4:2")).toEqual({ row: 4, col: 2 });
  });

  it("returns null for a bench (null/empty) grid", () => {
    expect(parseGrid(null)).toBeNull();
    expect(parseGrid("")).toBeNull();
  });

  it("keys a formation by name + slot count", () => {
    const f: Formation = {
      name: "4-4-2",
      season: 2020,
      slots: Array.from({ length: 11 }, (_, i) => ({
        row: 1,
        col: i + 1,
        role: "CM",
      })),
    };
    expect(formationKey(f)).toBe("4-4-2/11");
  });
});

describe("formationByName", () => {
  it("resolves a shipped formation", () => {
    expect(formationByName(FORMATIONS[0].name).name).toBe(FORMATIONS[0].name);
  });

  it("resolves every shipped formation", () => {
    for (const f of FORMATIONS) expect(formationByName(f.name)).toBe(f);
  });

  it("⚠️ throws on an unknown name rather than returning undefined", () => {
    // A silent undefined here surfaces as a crash somewhere far from the cause —
    // typically inside a reducer that assumed it had a shape.
    expect(() => formationByName("4-4-3")).toThrow(/unknown formation/i);
  });
});
