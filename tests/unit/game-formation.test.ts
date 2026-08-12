import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
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
  it("resolves every shipped formation", () => {
    for (const f of FORMATIONS) expect(formationByName(f.name)).toBe(f);
  });

  it("⚠️ throws on an unknown name rather than returning undefined", () => {
    // A silent undefined here surfaces as a crash somewhere far from the cause —
    // typically inside a reducer that assumed it had a shape.
    expect(() => formationByName("4-4-3")).toThrow(/unknown formation/i);
  });

  it("⚠️ nothing reads FORMATIONS by index", () => {
    // Index access makes the array's ORDER load-bearing: inserting a shape silently
    // repoints every downstream assumption. The hard-ban test pins slot 4 precisely
    // because it is the only index whose role differs between two specific shapes, so
    // against a different pair it would keep passing for the wrong reason.
    //
    // `DraftHub` indexes by the user's current selection, which is dynamic rather than
    // positional, so that one form is allowed.
    //
    // ⚠️ This matches source TEXT, not an AST — it will flag the pattern inside a comment
    // too. That is a deliberate trade for a guard this simple; describe the anti-pattern
    // in prose rather than writing it out.
    const files = [
      ...readdirSync("tests/unit")
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => `tests/unit/${f}`),
      "src/features/game/components/DraftHub.tsx",
    ];

    const offenders: string[] = [];
    for (const file of files) {
      for (const m of readFileSync(file, "utf8").matchAll(/FORMATIONS\[(\w+)\]/g)) {
        if (m[1] === "i") continue;
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

const ROLES: PlayerRole[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
];

describe("the formation set", () => {
  it("ships twenty shapes", () => {
    expect(FORMATIONS).toHaveLength(20);
  });

  it("every shape is eleven slots with exactly one keeper", () => {
    for (const f of FORMATIONS) {
      expect(f.slots, f.name).toHaveLength(11);
      expect(f.slots.filter((s) => s.role === "GK"), f.name).toHaveLength(1);
    }
  });

  it("every slot role is a real PlayerRole", () => {
    for (const f of FORMATIONS) {
      for (const s of f.slots) expect(ROLES, `${f.name} ${s.role}`).toContain(s.role);
    }
  });

  it("⚠️ every key is unique", () => {
    // formationKey is `${name}/${slots.length}` and every shape has 11 slots, so two
    // variants both named "4-3-3" would collide — and TASK-1807 B2 resolves a stored
    // match by that key, so a collision restores a saved match into the WRONG shape.
    const keys = FORMATIONS.map(formationKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the three families are all represented", () => {
    const names = FORMATIONS.map((f) => f.name);
    for (const name of ["4-4-2 Flat", "3-5-2", "2-3-5 Pyramid"]) expect(names).toContain(name);
  });
});
